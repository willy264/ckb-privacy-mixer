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
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

const ERROR_INVALID_PROOF_DATA: i8 = 5;
const ERROR_INVALID_CELL_COUNT: i8 = 6;
const ERROR_INVALID_MERKLE_ROOT: i8 = 8;

#[derive(Deserialize)]
pub(crate) struct ProofJson {
    pi_a: [String; 3],
    pi_b: [[String; 2]; 3],
    pi_c: [String; 3],
}

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

fn repo_root() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path
}

fn read_public_inputs_bytes() -> Bytes {
    let path = repo_root().join("circuits").join("public.json");
    let signals = serde_json::from_str::<Vec<String>>(&fs::read_to_string(path).unwrap()).unwrap();
    let mut bytes = Vec::with_capacity(64);
    for signal in signals.into_iter().take(2) {
      let value = BigIntBytes::from_decimal_string(&signal);
      bytes.extend_from_slice(&value.to_le_bytes_32());
    }
    Bytes::from(bytes)
}

fn read_proof_bytes() -> Bytes {
    let path = repo_root().join("circuits").join("proof.json");
    let proof = serde_json::from_str::<ProofJson>(&fs::read_to_string(path).unwrap()).unwrap();
    Bytes::from(pack_proof_bytes(&proof))
}

pub(crate) struct BigIntBytes([u8; 32]);

impl BigIntBytes {
    pub(crate) fn from_decimal_string(value: &str) -> Self {
        let bigint = value.parse::<u128>().ok();
        if let Some(small) = bigint {
            let mut out = [0u8; 32];
            out[..16].copy_from_slice(&small.to_le_bytes());
            return Self(out);
        }

        let mut decimal = value
            .bytes()
            .map(|byte| byte - b'0')
            .collect::<Vec<_>>();
        let mut out = [0u8; 32];
        for byte in &mut out {
            let mut carry = 0u16;
            for digit in &mut decimal {
                let current = carry * 10 + u16::from(*digit);
                *digit = (current / 256) as u8;
                carry = current % 256;
            }
            *byte = carry as u8;
            while decimal.first() == Some(&0) {
                decimal.remove(0);
                if decimal.is_empty() {
                    break;
                }
            }
            if decimal.is_empty() {
                break;
            }
        }
        Self(out)
    }

    pub(crate) fn to_le_bytes_32(&self) -> [u8; 32] {
        self.0
    }
}

fn pack_decimal_32(value: &str, out: &mut Vec<u8>) {
    out.extend_from_slice(&BigIntBytes::from_decimal_string(value).to_le_bytes_32());
}

pub(crate) fn pack_proof_bytes(proof: &ProofJson) -> Vec<u8> {
    let mut out = Vec::with_capacity(256);
    pack_decimal_32(&proof.pi_a[0], &mut out);
    pack_decimal_32(&proof.pi_a[1], &mut out);
    pack_decimal_32(&proof.pi_b[0][1], &mut out);
    pack_decimal_32(&proof.pi_b[0][0], &mut out);
    pack_decimal_32(&proof.pi_b[1][1], &mut out);
    pack_decimal_32(&proof.pi_b[1][0], &mut out);
    pack_decimal_32(&proof.pi_c[0], &mut out);
    pack_decimal_32(&proof.pi_c[1], &mut out);
    out
}

fn build_zk_membership_context(
    public_inputs: Bytes,
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
    let mut outputs_data = vec![public_inputs];

    if duplicate_output {
        outputs.push(
            CellOutput::new_builder()
                .capacity(1000u64)
                .lock(always_success_script)
                .type_(Some(verifier_script).pack())
                .build(),
        );
        outputs_data.push(Bytes::new());
    }

    let witness = WitnessArgs::new_builder()
        .output_type(Some(witness_data).pack())
        .build();

    let tx = TransactionBuilder::default()
        .cell_deps(vec![verifier_script_dep, always_success_script_dep])
        .inputs(vec![CellInput::new_builder().previous_output(input_out_point).build()])
        .outputs(outputs)
        .outputs_data(outputs_data.into_iter().map(|data| data.pack()).collect::<Vec<_>>())
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    (context, tx)
}

#[test]
fn test_zk_membership_valid_groth16_fixture() {
    let public_inputs = read_public_inputs_bytes();
    let witness_data = read_proof_bytes();
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    if let Err(error) = result {
        panic!("Expected success but got: {:?}", error);
    }
}

#[test]
fn test_zk_membership_invalid_proof_bytes_fail() {
    let public_inputs = read_public_inputs_bytes();
    let mut witness_data = read_proof_bytes().to_vec();
    witness_data[0] ^= 0xff;
    let (context, tx) = build_zk_membership_context(public_inputs, Bytes::from(witness_data), false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_PROOF_DATA);
}

#[test]
fn test_zk_membership_wrong_public_input_order_fails() {
    let mut public_inputs = read_public_inputs_bytes().to_vec();
    public_inputs[..32].reverse();
    let witness_data = read_proof_bytes();
    let (context, tx) = build_zk_membership_context(Bytes::from(public_inputs), witness_data, false);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_MERKLE_ROOT);
}

#[test]
fn test_zk_membership_invalid_cell_count() {
    let public_inputs = read_public_inputs_bytes();
    let witness_data = read_proof_bytes();
    let (context, tx) = build_zk_membership_context(public_inputs, witness_data, true);
    let result = context.verify_tx(&tx, 100_000_000);
    assert_script_error(result, ERROR_INVALID_CELL_COUNT);
}
