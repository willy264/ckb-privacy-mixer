#![no_std]
#![no_main]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::{CellField, Source},
    ckb_types::{packed::ScriptReader, prelude::Reader},
    error::SysError,
    high_level::load_cell_data,
    syscalls,
};
use bulletproofs::PedersenGens;
use curve25519_dalek::scalar::Scalar;

mod error;
use error::Error;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(16384, 1258306, 64);

const DENOMINATION: u64 = 100;
const TEST_BLINDING_FACTOR: u64 = 42;

pub fn program_entry() -> i8 {
    match validate() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
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

fn validate() -> Result<(), Error> {
    let pc_gens = PedersenGens::default();
    let expected = pc_gens
        .commit(
            Scalar::from(DENOMINATION),
            Scalar::from(TEST_BLINDING_FACTOR),
        )
        .compress();
    let expected_bytes = expected.as_bytes();

    let mut input_count = 0usize;
    let mut i = 0usize;
    loop {
        match load_cell_data(i, Source::GroupInput) {
            Ok(data) => {
                if data.len() < 32 {
                    return Err(Error::InvalidDenomination);
                }
                if &data[0..32] != expected_bytes {
                    return Err(Error::InvalidDenomination);
                }
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

    let mut output_count = 0usize;
    let mut j = 0usize;
    loop {
        match load_cell_data(j, Source::GroupOutput) {
            Ok(data) => {
                if data.len() < 32 {
                    return Err(Error::InvalidDenomination);
                }
                if &data[0..32] != expected_bytes {
                    return Err(Error::InvalidDenomination);
                }
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
