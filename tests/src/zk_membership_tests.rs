use super::*;
use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::TransactionBuilder,
    core::TransactionView,
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use sha2::{Digest, Sha256};

const ERROR_INVALID_PROOF_DATA: i8 = 5;
const ERROR_INVALID_CELL_COUNT: i8 = 6;
const ERROR_INVALID_MERKLE_PATH: i8 = 7;
const ERROR_INVALID_MERKLE_ROOT: i8 = 8;
const ERROR_INVALID_NULLIFIER: i8 = 9;

const HASH_BYTES: usize = 32;

fn assert_script_error(result: Result<u64, ckb_testtool::ckb_error::Error>, expected_code: i8) {
    let err = result.expect_err("Expected transaction to fail but it succeeded");
    let err_str = format!("{:?}", err);
    assert!(
        err_str.contains(&format!("error code {}", expected_code))
            || err_str.contains(&format!("ValidationFailure(\"Byte({})\")", expected_code)),
        "Expected error code {}, but got: {}",
        expected_code,
        err_str
    );
}

fn hash_with_prefix(prefix: u8, parts: &[&[u8]]) -> [u8; HASH_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update([prefix]);
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().into()
}

fn hash_leaf(commitment: &[u8; HASH_BYTES]) -> [u8; HASH_BYTES] {
    hash_with_prefix(0, &[commitment])
}

fn hash_node(left: &[u8; HASH_BYTES], right: &[u8; HASH_BYTES]) -> [u8; HASH_BYTES] {
    hash_with_prefix(1, &[left, right])
}

fn derive_nullifier(blinding_factor: &[u8; HASH_BYTES], session_id: &[u8]) -> [u8; HASH_BYTES] {
    hash_with_prefix(2, &[blinding_factor, session_id])
}

fn build_merkle_root(commitments: &[[u8; HASH_BYTES]]) -> Vec<Vec<[u8; HASH_BYTES]>> {
    let mut levels = vec![commitments.iter().map(hash_leaf).collect::<Vec<_>>()];
    while levels.last().unwrap().len() > 1 {
        let current = levels.last().unwrap();
        let mut next = Vec::new();
        for i in (0..current.len()).step_by(2) {
            let left = current[i];
            let right = *current.get(i + 1).unwrap_or(&current[i]);
            next.push(hash_node(&left, &right));
        }
        levels.push(next);
    }
    levels
}

fn generate_proof(
    commitments: &[[u8; HASH_BYTES]],
    leaf_index: usize,
) -> ([u8; HASH_BYTES], Vec<[u8; HASH_BYTES]>, Vec<u8>) {
    let levels = build_merkle_root(commitments);
    let root = levels.last().unwrap()[0];
    let mut siblings = Vec::new();
    let mut directions = Vec::new();
    let mut index = leaf_index;

    for level in &levels[..levels.len() - 1] {
        let is_right = index % 2 == 1;
        let sibling_index = if is_right { index - 1 } else { index + 1 };
        let sibling = *level.get(sibling_index).unwrap_or(&level[index]);
        siblings.push(sibling);
        directions.push(if is_right { 1 } else { 0 });
        index /= 2;
    }

    (root, siblings, directions)
}

fn encode_witness(
    session_id: &[u8],
    commitment: &[u8; HASH_BYTES],
    blinding_factor: &[u8; HASH_BYTES],
    leaf_index: u32,
    siblings: &[[u8; HASH_BYTES]],
    directions: &[u8],
) -> Bytes {
    let mut data = Vec::new();
    data.extend_from_slice(&(session_id.len() as u32).to_le_bytes());
    data.extend_from_slice(session_id);
    data.extend_from_slice(commitment);
    data.extend_from_slice(blinding_factor);
    data.extend_from_slice(&leaf_index.to_le_bytes());
    data.extend_from_slice(&(siblings.len() as u32).to_le_bytes());
    for sibling in siblings {
        data.extend_from_slice(sibling);
    }
    data.extend_from_slice(directions);
    Bytes::from(data)
}

fn build_zk_membership_context(
    public_inputs: [u8; HASH_BYTES * 2],
    witness_data: Bytes,
    duplicate_output: bool,
) -> (Context, TransactionView) {
    let loader = Loader::default();
    let mut context = Context::default();

    let always_success_dep = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_script_dep = CellDep::new_builder()
        .out_point(always_success_dep.clone())
        .build();
    let always_success_script = context
        .build_script(&always_success_dep, Bytes::new())
        .expect("build always-success script");

    let verifier_bin = loader.load_binary("zk-membership-type");
    let verifier_dep = context.deploy_cell(verifier_bin);
    let verifier_script_dep = CellDep::new_builder()
        .out_point(verifier_dep.clone())
        .build();
    let verifier_script = context
        .build_script(&verifier_dep, Bytes::new())
        .expect("build verifier script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone())
            .build(),
        Bytes::new(),
    );

    let mut outputs = vec![
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone())
            .type_(Some(verifier_script.clone()).pack())
            .build(),
    ];
    let mut outputs_data = vec![Bytes::from(public_inputs.to_vec())];

    if duplicate_output {
        outputs.push(
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script)
                .type_(Some(verifier_script).pack())
                .build(),
        );
        outputs_data.push(Bytes::from(public_inputs.to_vec()));
    }

    let witness = WitnessArgs::new_builder()
        .output_type(Some(witness_data).pack())
        .build();

    let tx = TransactionBuilder::default()
        .cell_deps(vec![verifier_script_dep, always_success_script_dep])
        .inputs(vec![CellInput::new_builder().previous_output(input_out_point).build()])
        .outputs(outputs)
        .outputs_data(outputs_data.into_iter().map(|d| d.pack()).collect::<Vec<_>>())
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    (context, tx)
}

fn sample_commitment(byte: u8) -> [u8; HASH_BYTES] {
    [byte; HASH_BYTES]
}

#[test]
fn test_zk_membership_valid_proof() {
    let commitments = [
        sample_commitment(1),
        sample_commitment(2),
        sample_commitment(3),
        sample_commitment(4),
    ];
    let session_id = b"session_c";
    let blinding_factor = sample_commitment(42);
    let leaf_index = 2usize;
    let (root, siblings, directions) = generate_proof(&commitments, leaf_index);
    let nullifier = derive_nullifier(&blinding_factor, session_id);

    let mut public_inputs = [0u8; HASH_BYTES * 2];
    public_inputs[..HASH_BYTES].copy_from_slice(&root);
    public_inputs[HASH_BYTES..].copy_from_slice(&nullifier);

    let witness_data = encode_witness(
        session_id,
        &commitments[leaf_index],
        &blinding_factor,
        leaf_index as u32,
        &siblings,
        &directions,
    );
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}

#[test]
fn test_zk_membership_invalid_root() {
    let commitments = [sample_commitment(1), sample_commitment(2)];
    let session_id = b"session_a";
    let blinding_factor = sample_commitment(33);
    let leaf_index = 1usize;
    let (root, siblings, directions) = generate_proof(&commitments, leaf_index);
    let nullifier = derive_nullifier(&blinding_factor, session_id);

    let mut public_inputs = [0u8; HASH_BYTES * 2];
    public_inputs[..HASH_BYTES].copy_from_slice(&root);
    public_inputs[0] ^= 0xff;
    public_inputs[HASH_BYTES..].copy_from_slice(&nullifier);

    let witness_data = encode_witness(
        session_id,
        &commitments[leaf_index],
        &blinding_factor,
        leaf_index as u32,
        &siblings,
        &directions,
    );
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_MERKLE_ROOT);
}

#[test]
fn test_zk_membership_invalid_nullifier() {
    let commitments = [sample_commitment(1), sample_commitment(2)];
    let session_id = b"session_a";
    let blinding_factor = sample_commitment(33);
    let leaf_index = 0usize;
    let (root, siblings, directions) = generate_proof(&commitments, leaf_index);
    let nullifier = derive_nullifier(&blinding_factor, session_id);

    let mut public_inputs = [0u8; HASH_BYTES * 2];
    public_inputs[..HASH_BYTES].copy_from_slice(&root);
    public_inputs[HASH_BYTES..].copy_from_slice(&nullifier);
    public_inputs[HASH_BYTES] ^= 0xff;

    let witness_data = encode_witness(
        session_id,
        &commitments[leaf_index],
        &blinding_factor,
        leaf_index as u32,
        &siblings,
        &directions,
    );
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_NULLIFIER);
}

#[test]
fn test_zk_membership_invalid_path_direction() {
    let commitments = [sample_commitment(1), sample_commitment(2), sample_commitment(3)];
    let session_id = b"session_b";
    let blinding_factor = sample_commitment(55);
    let leaf_index = 2usize;
    let (root, siblings, mut directions) = generate_proof(&commitments, leaf_index);
    directions[0] = 1;
    let nullifier = derive_nullifier(&blinding_factor, session_id);

    let mut public_inputs = [0u8; HASH_BYTES * 2];
    public_inputs[..HASH_BYTES].copy_from_slice(&root);
    public_inputs[HASH_BYTES..].copy_from_slice(&nullifier);

    let witness_data = encode_witness(
        session_id,
        &commitments[leaf_index],
        &blinding_factor,
        leaf_index as u32,
        &siblings,
        &directions,
    );
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_MERKLE_PATH);
}

#[test]
fn test_zk_membership_malformed_witness() {
    let public_inputs = [0u8; HASH_BYTES * 2];
    let witness_data = Bytes::from(vec![1u8, 2u8, 3u8]);
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_PROOF_DATA);
}

#[test]
fn test_zk_membership_invalid_cell_count() {
    let commitments = [sample_commitment(1), sample_commitment(2)];
    let session_id = b"session_a";
    let blinding_factor = sample_commitment(33);
    let leaf_index = 0usize;
    let (root, siblings, directions) = generate_proof(&commitments, leaf_index);
    let nullifier = derive_nullifier(&blinding_factor, session_id);

    let mut public_inputs = [0u8; HASH_BYTES * 2];
    public_inputs[..HASH_BYTES].copy_from_slice(&root);
    public_inputs[HASH_BYTES..].copy_from_slice(&nullifier);

    let witness_data = encode_witness(
        session_id,
        &commitments[leaf_index],
        &blinding_factor,
        leaf_index as u32,
        &siblings,
        &directions,
    );
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, true);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_CELL_COUNT);
}
