use super::*;
use bulletproofs::PedersenGens;
use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::TransactionBuilder,
    core::TransactionView,
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use curve25519_dalek::scalar::Scalar;

// These must match error.rs in contracts/mixer-pool-type/src/error.rs
const ERROR_INVALID_DENOMINATION: i8 = 5;
const ERROR_INSUFFICIENT_PARTICIPANTS: i8 = 7;
const ERROR_INVALID_OUTPUT_LOCK: i8 = 8;

/// Asserts a transaction was rejected with a specific contract error code.
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

/// Builds a CoinJoin test transaction.
///
/// - `input_amounts`: denominations for each input cell
/// - `output_amounts`: denominations for each output cell
/// - `stealth_output_count`: how many outputs use the stealth-lock (53-byte args);
///    the rest use always-success (will trigger InvalidOutputLock)
fn build_test_context(
    input_amounts: &[u64],
    output_amounts: &[u64],
    stealth_output_count: usize,
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

    // Deploy our mixer-pool-type contract (built from this project)
    let mixer_bin = loader.load_binary("mixer-pool-type");
    let mixer_dep = context.deploy_cell(mixer_bin);
    let mixer_script_dep = CellDep::new_builder().out_point(mixer_dep.clone()).build();
    let mixer_script = context
        .build_script(&mixer_dep, Bytes::new())
        .expect("build mixer script");

    // Deploy stealth-lock fixture (from Obscell, pre-compiled in tests/fixtures/)
    let stealth_bin = loader.load_fixture("stealth-lock");
    let stealth_dep = context.deploy_cell(stealth_bin);
    let stealth_script_dep = CellDep::new_builder().out_point(stealth_dep.clone()).build();

    let pc_gens = PedersenGens::default();
    let bf = Scalar::from(42u64); // fixed test blinding factor matching the contract constant

    // Build inputs — each gets a unique outpoint via context.create_cell()
    let mut inputs = vec![];
    let mut witnesses = vec![];
    for &amount in input_amounts {
        let commitment = pc_gens.commit(Scalar::from(amount), bf).compress();
        let cell = CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone()) // anyone can spend in tests
            .type_(Some(mixer_script.clone()).pack())
            .build();
        let out_point = context.create_cell(cell, Bytes::from(commitment.as_bytes().to_vec()));
        inputs.push(CellInput::new_builder().previous_output(out_point).build());
        let witness = WitnessArgs::new_builder()
            .input_type(Some(Bytes::from(bf.to_bytes().to_vec())).pack())
            .build();
        witnesses.push(witness.as_bytes());
    }

    // Build outputs — stealth lock for the first N, always-success for the rest
    let mut outputs = vec![];
    let mut outputs_data = vec![];
    for (i, &amount) in output_amounts.iter().enumerate() {
        let commitment = pc_gens.commit(Scalar::from(amount), bf).compress();
        let lock = if i < stealth_output_count {
            // Stealth lock: args must be exactly 53 bytes (P || Q')
            context
                .build_script(&stealth_dep, Bytes::from(vec![1u8; 53]))
                .expect("build stealth lock script")
        } else {
            // Non-stealth lock — will fail the InvalidOutputLock check
            always_success_script.clone()
        };
        outputs.push(
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(lock)
                .type_(Some(mixer_script.clone()).pack())
                .build(),
        );
        outputs_data.push(Bytes::from(commitment.as_bytes().to_vec()));
        let witness = WitnessArgs::new_builder()
            .output_type(Some(Bytes::from(bf.to_bytes().to_vec())).pack())
            .build();
        witnesses.push(witness.as_bytes());
    }

    let tx = TransactionBuilder::default()
        .cell_deps(vec![
            mixer_script_dep,
            stealth_script_dep,
            always_success_script_dep,
        ])
        .inputs(inputs)
        .outputs(outputs)
        .outputs_data(outputs_data.into_iter().map(|d| d.pack()).collect::<Vec<_>>())
        .witnesses(witnesses.into_iter().map(|w| w.pack()).collect::<Vec<_>>())
        .build();

    (context, tx)
}

#[test]
fn test_valid_coinjoin_3_participants() {
    let (context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 100], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}

#[test]
fn test_invalid_denomination_input() {
    let (context, tx) = build_test_context(&[100, 50, 100], &[100, 100, 100], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_DENOMINATION);
}

#[test]
fn test_invalid_denomination_output() {
    let (context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 150], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_DENOMINATION);
}

#[test]
fn test_insufficient_participants() {
    let (context, tx) = build_test_context(&[100, 100], &[100, 100], 2);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INSUFFICIENT_PARTICIPANTS);
}

#[test]
fn test_output_not_stealth() {
    // Only 2 of 3 outputs use stealth lock — third uses always-success (wrong lock arg size)
    let (context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 100], 2);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_OUTPUT_LOCK);
}

#[test]
fn test_valid_coinjoin_5_participants() {
    let (context, tx) =
        build_test_context(&[100, 100, 100, 100, 100], &[100, 100, 100, 100, 100], 5);
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}
