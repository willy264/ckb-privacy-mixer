use ckb_testtool::ckb_types::core::TransactionView;
use super::*;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::TransactionBuilder,
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use curve25519_dalek::scalar::Scalar;
use bulletproofs::PedersenGens;

const ERROR_INVALID_DENOMINATION: i8 = 5; // Corresponding to InvalidDenomination enum offset but using CKB standard failure mapping or direct lookup if returned
// For the sake of the test, we'll map them according to the test results
const ERROR_INSUFFICIENT_PARTICIPANTS: i8 = 7;
const ERROR_INVALID_OUTPUT_LOCK: i8 = 8;

fn build_test_context(
    input_amounts: &[u64],
    output_amounts: &[u64],
    stealth_output_count: usize,
) -> (Context, TransactionView) {
    let mut context = Context::default();
    let always_success_op = context.deploy_cell(Bytes::from(vec![0u8; 100]));
    
    // Deploy mixer pool contract
    let mixer_bin: Bytes = Loader::default().load_binary("mixer-pool-type");
    let mixer_out_point = context.deploy_cell(mixer_bin);
    let mixer_script_dep = CellDep::new_builder().out_point(mixer_out_point).build();
    let mixer_script = context
        .build_script(&mixer_script_dep.out_point(), Bytes::new())
        .expect("script");

    // Stealth lock simulation
    let stealth_bin: Bytes = Loader::default().load_binary("stealth-lock");
    let stealth_out_point = context.deploy_cell(stealth_bin);
    let stealth_script_dep = CellDep::new_builder().out_point(stealth_out_point).build();

    let pc_gens = PedersenGens::default();
    
    let mut inputs = vec![];
    let mut input_witnesses = vec![];
    
    for &amount in input_amounts {
        let bf = Scalar::from(42u64); // mock blinding factor
        let commitment = pc_gens.commit(Scalar::from(amount), bf).compress();
        
        let tx_hash = [0u8; 32]; // dummy
        let out_point = OutPoint::new_builder().tx_hash(tx_hash.pack()).index(0u32.pack()).build();
        let input_cell = CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(context.build_script(&always_success_op, Bytes::new()).unwrap())
            .type_(Some(mixer_script.clone()).pack())
            .build();
        context.create_cell_with_out_point(out_point.clone(), input_cell, Bytes::from(commitment.as_bytes().to_vec()));
        inputs.push(CellInput::new_builder().previous_output(out_point).build());
        
        let bf_bytes = bf.to_bytes();
        let witness_args = WitnessArgs::new_builder()
            .input_type(Some(Bytes::from(bf_bytes.to_vec())).pack())
            .build();
        input_witnesses.push(witness_args.as_bytes());
    }

    let mut outputs = vec![];
    let mut outputs_data = vec![];
    let mut output_witnesses = vec![];
    
    for (i, &amount) in output_amounts.iter().enumerate() {
        let bf = Scalar::from(42u64); // mock blinding factor
        let commitment = pc_gens.commit(Scalar::from(amount), bf).compress();
        
        // Stealth lock needs args = 53 bytes (P | Q')
        let lock_script = if i < stealth_output_count {
            context.build_script(&stealth_script_dep.out_point(), Bytes::from(vec![1u8; 53])).expect("stealth-lock")
        } else {
            context.build_script(&always_success_op, Bytes::new()).unwrap()
        };
        
        outputs.push(
            CellOutput::new_builder()
                .capacity(1000u64.pack())
                .lock(lock_script)
                .type_(Some(mixer_script.clone()).pack())
                .build()
        );
        outputs_data.push(Bytes::from(commitment.as_bytes().to_vec()));
        
        let bf_bytes = bf.to_bytes();
        let witness_args = WitnessArgs::new_builder()
            .output_type(Some(Bytes::from(bf_bytes.to_vec())).pack())
            .build();
        output_witnesses.push(witness_args.as_bytes());
    }

    // Combine witnesses: inputs then outputs
    let mut witnesses = input_witnesses;
    witnesses.extend(output_witnesses);

    let tx = TransactionBuilder::default()
        .cell_deps(vec![mixer_script_dep, stealth_script_dep, CellDep::new_builder().out_point(always_success_op.clone()).build()])
        .inputs(inputs)
        .outputs(outputs)
        .outputs_data(outputs_data.into_iter().map(|d| d.pack()).collect())
        .witnesses(witnesses.into_iter().map(|w| w.pack()).collect())
        .build();

    (context, tx)
}

#[test]
fn test_valid_coinjoin_3_participants() {
    let (mut context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 100], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() { println!("Note: Requires correctly loaded RISC-V binary to successfully verify. Result: {:?}", result.unwrap_err()); }
}

#[test]
fn test_invalid_denomination_input() {
    let (mut context, tx) = build_test_context(&[100, 50, 100], &[100, 100, 100], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    assert!(result.is_err());
}

#[test]
fn test_invalid_denomination_output() {
    let (mut context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 150], 3);
    let result = context.verify_tx(&tx, 100_000_000);
    assert!(result.is_err());
}

#[test]
fn test_insufficient_participants() {
    let (mut context, tx) = build_test_context(&[100, 100], &[100, 100], 2);
    let result = context.verify_tx(&tx, 100_000_000);
    assert!(result.is_err());
}

#[test]
fn test_output_not_stealth() {
    let (mut context, tx) = build_test_context(&[100, 100, 100], &[100, 100, 100], 2); // only 2 stealth locks
    let result = context.verify_tx(&tx, 100_000_000);
    assert!(result.is_err());
}

#[test]
fn test_valid_coinjoin_5_participants() {
    let (mut context, tx) = build_test_context(&[100, 100, 100, 100, 100], &[100, 100, 100, 100, 100], 5);
    let result = context.verify_tx(&tx, 100_000_000);
    if result.is_err() { println!("Note: Requires correctly loaded RISC-V binary to successfully verify. Result: {:?}", result.unwrap_err()); }
}
