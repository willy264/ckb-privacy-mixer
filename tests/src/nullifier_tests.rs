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

const ERROR_INVALID_REGISTRY_DATA: i8 = 5;
const ERROR_INVALID_CELL_COUNT: i8 = 6;
const ERROR_INVALID_REGISTRY_UPDATE: i8 = 7;
const ERROR_NULLIFIER_ALREADY_USED: i8 = 8;
const ERROR_NON_EMPTY_INIT_REGISTRY: i8 = 9;

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

fn build_nullifier_context(
    input_registry: Option<Vec<[u8; 32]>>,
    output_registry: Option<Vec<[u8; 32]>>,
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

    let mut inputs = vec![];
    if let Some(registry) = input_registry {
        let cell = CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone())
            .type_(Some(nullifier_script.clone()).pack())
            .build();
        let out_point = context.create_cell(cell, registry_data(&registry));
        inputs.push(CellInput::new_builder().previous_output(out_point).build());
    }

    let mut outputs = vec![];
    let mut outputs_data = vec![];
    if let Some(registry) = output_registry {
        outputs.push(
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script)
                .type_(Some(nullifier_script).pack())
                .build(),
        );
        outputs_data.push(registry_data(&registry));
    }

    let tx = TransactionBuilder::default()
        .cell_deps(vec![nullifier_script_dep, always_success_script_dep])
        .inputs(inputs)
        .outputs(outputs)
        .outputs_data(outputs_data.into_iter().map(|d| d.pack()).collect::<Vec<_>>())
        .build();

    (context, tx)
}

fn nullifier(byte: u8) -> [u8; 32] {
    [byte; 32]
}

#[test]
fn test_nullifier_registry_init_empty_success() {
    let (context, tx) = build_nullifier_context(None, Some(vec![]));
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}

#[test]
fn test_nullifier_registry_init_non_empty_fails() {
    let (context, tx) = build_nullifier_context(None, Some(vec![nullifier(1)]));
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_NON_EMPTY_INIT_REGISTRY);
}

#[test]
fn test_nullifier_registry_append_success() {
    let (context, tx) = build_nullifier_context(
        Some(vec![nullifier(1)]),
        Some(vec![nullifier(1), nullifier(2)]),
    );
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() {
        panic!("Expected success but got: {:?}", result.unwrap_err());
    }
}

#[test]
fn test_nullifier_registry_reject_replay() {
    let (context, tx) = build_nullifier_context(
        Some(vec![nullifier(1)]),
        Some(vec![nullifier(1), nullifier(1)]),
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_NULLIFIER_ALREADY_USED);
}

#[test]
fn test_nullifier_registry_reject_non_append_update() {
    let (context, tx) = build_nullifier_context(
        Some(vec![nullifier(1), nullifier(2)]),
        Some(vec![nullifier(2), nullifier(1), nullifier(3)]),
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_REGISTRY_UPDATE);
}

#[test]
fn test_nullifier_registry_reject_multiple_new_entries() {
    let (context, tx) = build_nullifier_context(
        Some(vec![nullifier(1)]),
        Some(vec![nullifier(1), nullifier(2), nullifier(3)]),
    );
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_REGISTRY_UPDATE);
}

#[test]
fn test_nullifier_registry_reject_invalid_cell_count() {
    let (context, tx) = build_nullifier_context(Some(vec![nullifier(1)]), None);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_CELL_COUNT);
}

#[test]
fn test_nullifier_registry_reject_malformed_data() {
    let loader = Loader::default();
    let mut context = Context::default();

    let always_success_dep = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_script = context
        .build_script(&always_success_dep, Bytes::new())
        .expect("build always-success script");
    let always_success_script_dep = CellDep::new_builder()
        .out_point(always_success_dep)
        .build();

    let nullifier_bin = loader.load_binary("nullifier-type");
    let nullifier_dep = context.deploy_cell(nullifier_bin);
    let nullifier_script = context
        .build_script(&nullifier_dep, Bytes::new())
        .expect("build nullifier script");
    let nullifier_script_dep = CellDep::new_builder()
        .out_point(nullifier_dep)
        .build();

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64)
            .lock(always_success_script.clone())
            .type_(Some(nullifier_script.clone()).pack())
            .build(),
        Bytes::from(vec![1u8, 2u8, 3u8]),
    );

    let tx = TransactionBuilder::default()
        .cell_deps(vec![nullifier_script_dep, always_success_script_dep])
        .inputs(vec![CellInput::new_builder().previous_output(input_out_point).build()])
        .outputs(vec![
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script)
                .type_(Some(nullifier_script).pack())
                .build(),
        ])
        .outputs_data(vec![registry_data(&[nullifier(1)]).pack()])
        .build();

    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_REGISTRY_DATA);
}
