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

const NULLIFIER_ALREADY_USED: i8 = 8;
const INVALID_MERKLE_ROOT: i8 = 8;

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

fn registry_data(nullifiers: &[[u8; 32]]) -> Bytes {
    let mut data = Vec::with_capacity(4 + nullifiers.len() * 32);
    data.extend_from_slice(&(nullifiers.len() as u32).to_le_bytes());
    for nullifier in nullifiers {
        data.extend_from_slice(nullifier);
    }
    Bytes::from(data)
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

fn build_merkle_levels(commitments: &[[u8; HASH_BYTES]]) -> Vec<Vec<[u8; HASH_BYTES]>> {
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
    let levels = build_merkle_levels(commitments);
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

struct WithdrawalFixture {
    public_inputs: [u8; HASH_BYTES * 2],
    witness_data: Bytes,
    nullifier: [u8; HASH_BYTES],
}

fn sample_withdrawal_fixture() -> WithdrawalFixture {
    let commitments = [
        [1u8; HASH_BYTES],
        [2u8; HASH_BYTES],
        [3u8; HASH_BYTES],
        [4u8; HASH_BYTES],
    ];
    let session_id = b"session_withdraw";
    let blinding_factor = [9u8; HASH_BYTES];
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

    WithdrawalFixture {
        public_inputs,
        witness_data,
        nullifier,
    }
}

fn build_withdrawal_context(
    input_registry: Vec<[u8; 32]>,
    output_registry: Vec<[u8; 32]>,
    verifier_public_inputs: [u8; HASH_BYTES * 2],
    witness_data: Bytes,
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

    let nullifier_bin = loader.load_binary("nullifier-type");
    let nullifier_dep = context.deploy_cell(nullifier_bin);
    let nullifier_script_dep = CellDep::new_builder()
        .out_point(nullifier_dep.clone())
        .build();
    let nullifier_script = context
        .build_script(&nullifier_dep, Bytes::new())
        .expect("build nullifier script");

    let zk_bin = loader.load_binary("zk-membership-type");
    let zk_dep = context.deploy_cell(zk_bin);
    let zk_script_dep = CellDep::new_builder()
        .out_point(zk_dep.clone())
        .build();
    let zk_script = context
        .build_script(&zk_dep, Bytes::new())
        .expect("build zk-membership script");

    let registry_input = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone())
            .type_(Some(nullifier_script.clone()).pack())
            .build(),
        registry_data(&input_registry),
    );

    let witness = WitnessArgs::new_builder()
        .output_type(Some(witness_data).pack())
        .build();

    let tx = TransactionBuilder::default()
        .cell_deps(vec![
            nullifier_script_dep,
            zk_script_dep,
            always_success_script_dep,
        ])
        .inputs(vec![CellInput::new_builder().previous_output(registry_input).build()])
        .outputs(vec![
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script.clone())
                .type_(Some(nullifier_script).pack())
                .build(),
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script.clone())
                .type_(Some(zk_script).pack())
                .build(),
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script)
                .build(),
        ])
        .outputs_data(vec![
            registry_data(&output_registry).pack(),
            Bytes::from(verifier_public_inputs.to_vec()).pack(),
            Bytes::new().pack(),
        ])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    (context, tx)
}

#[test]
fn test_live_withdrawal_transaction_succeeds() {
    let fixture = sample_withdrawal_fixture();
    let (context, tx) = build_withdrawal_context(
        vec![],
        vec![fixture.nullifier],
        fixture.public_inputs,
        fixture.witness_data,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}

#[test]
fn test_live_withdrawal_replay_fails() {
    let fixture = sample_withdrawal_fixture();
    let (context, tx) = build_withdrawal_context(
        vec![fixture.nullifier],
        vec![fixture.nullifier, fixture.nullifier],
        fixture.public_inputs,
        fixture.witness_data,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, NULLIFIER_ALREADY_USED);
}

#[test]
fn test_live_withdrawal_invalid_membership_fails() {
    let fixture = sample_withdrawal_fixture();
    let mut bad_public_inputs = fixture.public_inputs;
    bad_public_inputs[0] ^= 0xff;

    let (context, tx) = build_withdrawal_context(
        vec![],
        vec![fixture.nullifier],
        bad_public_inputs,
        fixture.witness_data,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, INVALID_MERKLE_ROOT);
}
