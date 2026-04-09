#![no_std]
#![no_main]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    ckb_types::prelude::*,
    high_level::{load_cell_data, load_cell_lock, load_witness_args, QueryIter},
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

fn validate() -> Result<(), Error> {
    let pc_gens = PedersenGens::default();
    let expected_commitment = pc_gens.commit(
        Scalar::from(DENOMINATION),
        Scalar::from(42u64),
    ).compress();

    let mut input_count = 0usize;
    let mut i = 0usize;
    loop {
        match load_cell_data(i, Source::GroupInput) {
            Ok(data) => {
                if data.len() < 32 {
                    return Err(Error::CommitmentVerificationFailed);
                }
                let commitment_bytes: [u8; 32] = data[0..32].try_into().map_err(|_| Error::CommitmentVerificationFailed)?;
                
                let witness_args = load_witness_args(i, Source::Input).map_err(|_| Error::CommitmentVerificationFailed)?;
                let bf_bytes = witness_args.input_type().to_opt()
                    .map(|b| b.raw_data())
                    .ok_or(Error::CommitmentVerificationFailed)?;
                
                if bf_bytes.len() != 32 {
                    return Err(Error::CommitmentVerificationFailed);
                }
                
                let mut bf_arr = [0u8; 32];
                bf_arr.copy_from_slice(&bf_bytes);
                let blinding_factor = Scalar::from_bytes_mod_order(bf_arr);
                
                let actual_commitment = pc_gens.commit(Scalar::from(DENOMINATION), blinding_factor).compress();
                
                if actual_commitment.as_bytes() != &commitment_bytes {
                    return Err(Error::InvalidDenomination);
                }
                
                input_count += 1;
                i += 1;
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => return Err(Error::CommitmentVerificationFailed),
        }
    }

    let mut output_count = 0usize;
    let mut j = 0usize;
    loop {
        match load_cell_data(j, Source::GroupOutput) {
            Ok(data) => {
                if data.len() < 32 {
                    return Err(Error::CommitmentVerificationFailed);
                }
                let commitment_bytes: [u8; 32] = data[0..32].try_into().map_err(|_| Error::CommitmentVerificationFailed)?;
                
                let witness_args = load_witness_args(input_count + j, Source::Input).map_err(|_| Error::CommitmentVerificationFailed)?;
                let bf_bytes = witness_args.output_type().to_opt()
                    .map(|b| b.raw_data())
                    .ok_or(Error::CommitmentVerificationFailed)?;
                
                if bf_bytes.len() != 32 {
                    return Err(Error::CommitmentVerificationFailed);
                }
                
                let mut bf_arr = [0u8; 32];
                bf_arr.copy_from_slice(&bf_bytes);
                let blinding_factor = Scalar::from_bytes_mod_order(bf_arr);
                
                let actual_commitment = pc_gens.commit(Scalar::from(DENOMINATION), blinding_factor).compress();
                
                if actual_commitment.as_bytes() != &commitment_bytes {
                    return Err(Error::InvalidDenomination);
                }
                
                let lock = load_cell_lock(j, Source::GroupOutput)?;
                let lock_args = lock.args().raw_data();
                if lock_args.len() != 53 {
                    return Err(Error::InvalidOutputLock);
                }
                
                output_count += 1;
                j += 1;
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => return Err(Error::CommitmentVerificationFailed),
        }
    }

    if input_count != output_count {
        return Err(Error::InputOutputMismatch);
    }

    if input_count < 3 {
        return Err(Error::InsufficientParticipants);
    }

    Ok(())
}
