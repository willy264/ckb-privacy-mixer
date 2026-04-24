#![no_std]
#![no_main]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{load_cell_data, load_witness_args},
};
use sha2::{Digest, Sha256};


mod error;
use error::Error;

pub mod vk;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(16384, 1258306, 64);

const HASH_BYTES: usize = 32;
const PUBLIC_INPUTS_BYTES: usize = HASH_BYTES * 2;

pub fn program_entry() -> i8 {
    match validate() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}

fn count_group_cells(source: Source) -> Result<usize, Error> {
    let mut count = 0usize;
    loop {
        match load_cell_data(count, source) {
            Ok(_) => count += 1,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => return Err(Error::InvalidCellCount),
        }
    }
    Ok(count)
}

use ark_bn254::{Bn254, Fr};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_serialize::CanonicalDeserialize;
use alloc::vec;

fn validate() -> Result<(), Error> {
    if count_group_cells(Source::GroupInput)? != 0 || count_group_cells(Source::GroupOutput)? != 1 {
        return Err(Error::InvalidCellCount);
    }

    let output_data = load_cell_data(0, Source::GroupOutput)?;
    if output_data.len() != PUBLIC_INPUTS_BYTES {
        return Err(Error::InvalidProofData);
    }
    
    // Public Inputs: [root, nullifierHash]
    let root_bytes: [u8; 32] = output_data[..32].try_into().map_err(|_| Error::InvalidProofData)?;
    let nullifier_bytes: [u8; 32] = output_data[32..64].try_into().map_err(|_| Error::InvalidProofData)?;

    let public_inputs = vec![
        Fr::deserialize_uncompressed(&root_bytes[..]).map_err(|_| Error::InvalidProofData)?,
        Fr::deserialize_uncompressed(&nullifier_bytes[..]).map_err(|_| Error::InvalidProofData)?,
    ];

    let witness_args = load_witness_args(0, Source::Input).map_err(|_| Error::InvalidProofData)?;
    let proof_bytes = witness_args
        .output_type()
        .to_opt()
        .map(|bytes| bytes.raw_data())
        .ok_or(Error::InvalidProofData)?;
    
    let vk = vk::get_vk();
    let proof = ark_groth16::Proof::<Bn254>::deserialize_uncompressed(&proof_bytes[..])
        .map_err(|_| Error::InvalidProofData)?;

    let is_valid = Groth16::<Bn254>::verify(&vk, &public_inputs, &proof)
        .map_err(|_| Error::InvalidProofData)?;

    if !is_valid {
        return Err(Error::InvalidMerkleRoot);
    }

    Ok(())
}
