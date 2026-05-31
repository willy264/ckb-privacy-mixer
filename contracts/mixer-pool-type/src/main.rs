#![no_std]
#![no_main]



use ckb_std::{
    ckb_constants::{CellField, Source},
    ckb_types::{packed::ScriptReader, prelude::Reader},
    error::SysError,
    high_level::{load_cell_data, load_witness_args},
    syscalls,
};
use bulletproofs::PedersenGens;
use curve25519_dalek::scalar::Scalar;

mod error;
use error::Error;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(16384, 1258306, 64);

const DENOMINATION: u64 = 100;

pub fn program_entry() -> i8 {
    match validate() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}

/// Extracts a 32-byte blinding factor scalar from raw witness bytes.
fn parse_blinding_factor(raw: &[u8]) -> Result<Scalar, Error> {
    if raw.len() != 32 {
        return Err(Error::InvalidWitness);
    }
    let mut buf = [0u8; 32];
    buf.copy_from_slice(raw);
    // curve25519-dalek Scalar::from_canonical_bytes returns None if ≥ field order
    Option::from(Scalar::from_canonical_bytes(buf)).ok_or(Error::InvalidWitness)
}

/// Verifies that a cell's commitment matches commit(DENOMINATION, blinding_factor).
fn verify_commitment(cell_data: &[u8], blinding_factor: &Scalar) -> Result<(), Error> {
    if cell_data.len() < 32 {
        return Err(Error::InvalidDenomination);
    }
    let pc_gens = PedersenGens::default();
    let expected = pc_gens
        .commit(Scalar::from(DENOMINATION), *blinding_factor)
        .compress();
    if &cell_data[0..32] != expected.as_bytes() {
        return Err(Error::InvalidDenomination);
    }
    Ok(())
}

fn load_output_lock_args_len(index: usize) -> Result<usize, Error> {
    let mut buf = [0u8; 256];
    let len = match syscalls::load_cell_by_field(&mut buf, 0, index, Source::GroupOutput, CellField::Lock) {
        Ok(len) => len,
        Err(SysError::LengthNotEnough(_)) => return Err(Error::InvalidOutputLock),
        Err(_) => return Err(Error::InvalidOutputLock),
    };

    let script = ScriptReader::from_slice(&buf[..len]).map_err(|_| Error::InvalidOutputLock)?;
    Ok(script.args().len())
}

/// Counts the total number of transaction-level inputs (all scripts, not just ours).
fn count_all_inputs() -> usize {
    let mut count = 0usize;
    loop {
        match load_cell_data(count, Source::Input) {
            Ok(_) => count += 1,
            Err(_) => break,
        }
    }
    count
}

fn validate() -> Result<(), Error> {
    // --- Validate inputs ---
    // Each participant provides their own blinding factor in witness_args.input_type().
    let mut input_count = 0usize;
    let mut i = 0usize;
    loop {
        match load_cell_data(i, Source::GroupInput) {
            Ok(data) => {
                // Load the participant's blinding factor from the witness
                let witness_args = load_witness_args(i, Source::GroupInput)
                    .map_err(|_| Error::InvalidWitness)?;
                let bf_raw = witness_args
                    .input_type()
                    .to_opt()
                    .map(|bytes| bytes.raw_data())
                    .ok_or(Error::InvalidWitness)?;
                let blinding_factor = parse_blinding_factor(&bf_raw)?;

                verify_commitment(&data, &blinding_factor)?;
                input_count += 1;
                i += 1;
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => return Err(Error::InvalidDenomination),
        }
    }

    if input_count < 3 {
        return Err(Error::InsufficientParticipants);
    }

    // --- Validate outputs ---
    // Output blinding factors are stored in extra witnesses appended after input witnesses.
    // Convention: witness[total_input_count + j].output_type() = 32-byte blinding factor for output j.
    let total_inputs = count_all_inputs();

    let mut output_count = 0usize;
    let mut j = 0usize;
    loop {
        match load_cell_data(j, Source::GroupOutput) {
            Ok(data) => {
                // Load the output's blinding factor from the extra witness
                let witness_args = load_witness_args(total_inputs + j, Source::Input)
                    .map_err(|_| Error::InvalidWitness)?;
                let bf_raw = witness_args
                    .output_type()
                    .to_opt()
                    .map(|bytes| bytes.raw_data())
                    .ok_or(Error::InvalidWitness)?;
                let blinding_factor = parse_blinding_factor(&bf_raw)?;

                verify_commitment(&data, &blinding_factor)?;

                if load_output_lock_args_len(j)? != 53 {
                    return Err(Error::InvalidOutputLock);
                }
                output_count += 1;
                j += 1;
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => return Err(Error::InvalidDenomination),
        }
    }

    if input_count != output_count {
        return Err(Error::InputOutputMismatch);
    }

    Ok(())
}
