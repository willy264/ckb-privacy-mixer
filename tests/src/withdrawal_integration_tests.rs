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

const NULLIFIER_ALREADY_USED: i8 = 8;
const INVALID_MERKLE_ROOT: i8 = 8;

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

fn registry_data(nullifier_count: u32, nullifier_bytes: &[u8]) -> Bytes {
    let mut data = Vec::with_capacity(4 + nullifier_bytes.len());
    data.extend_from_slice(&nullifier_count.to_le_bytes());
    data.extend_from_slice(nullifier_bytes);
    Bytes::from(data)
}

fn sample_public_inputs() -> Bytes {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("circuits")
        .join("public.json");
    let values = serde_json::from_str::<Vec<String>>(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut out = Vec::new();
    for value in values.into_iter().take(2) {
        let bytes = super::zk_membership_tests::BigIntBytes::from_decimal_string(&value).to_le_bytes_32();
        out.extend_from_slice(&bytes);
    }
    Bytes::from(out)
}

fn sample_proof_bytes() -> Bytes {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("circuits")
        .join("proof.json");
    let proof = serde_json::from_str::<super::zk_membership_tests::ProofJson>(&std::fs::read_to_string(path).unwrap()).unwrap();
    Bytes::from(super::zk_membership_tests::pack_proof_bytes(&proof))
}

fn extract_nullifier(public_inputs: &Bytes) -> [u8; 32] {
    let slice = public_inputs.slice(32..64);
    let mut out = [0u8; 32];
    out.copy_from_slice(&slice);
    out
}

fn build_withdrawal_context(
    input_registry: Bytes,
    output_registry: Bytes,
    verifier_public_inputs: Bytes,
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
        input_registry,
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
            output_registry.pack(),
            verifier_public_inputs.pack(),
            Bytes::new().pack(),
        ])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    (context, tx)
}

#[test]
fn test_live_withdrawal_transaction_succeeds() {
    let public_inputs = sample_public_inputs();
    let proof_bytes = sample_proof_bytes();
    let nullifier = extract_nullifier(&public_inputs);
    let (context, tx) = build_withdrawal_context(
        registry_data(0, &[]),
        registry_data(1, &nullifier),
        public_inputs,
        proof_bytes,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    if let Err(error) = result {
        panic!("Expected success but got: {:?}", error);
    }
}

#[test]
fn test_live_withdrawal_replay_fails() {
    let public_inputs = sample_public_inputs();
    let proof_bytes = sample_proof_bytes();
    let nullifier = extract_nullifier(&public_inputs);
    let mut duplicated = Vec::new();
    duplicated.extend_from_slice(&nullifier);
    duplicated.extend_from_slice(&nullifier);
    let (context, tx) = build_withdrawal_context(
        registry_data(1, &nullifier),
        registry_data(2, &duplicated),
        public_inputs,
        proof_bytes,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, NULLIFIER_ALREADY_USED);
}

#[test]
fn test_live_withdrawal_invalid_membership_fails() {
    let mut public_inputs = sample_public_inputs().to_vec();
    public_inputs[0] ^= 0xff;
    let proof_bytes = sample_proof_bytes();
    let nullifier = extract_nullifier(&Bytes::from(public_inputs.clone()));
    let (context, tx) = build_withdrawal_context(
        registry_data(0, &[]),
        registry_data(1, &nullifier),
        Bytes::from(public_inputs),
        proof_bytes,
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, INVALID_MERKLE_ROOT);
}
