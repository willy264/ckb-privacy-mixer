#![no_std]
#![no_main]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{load_cell_data, load_witness_args},
};


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

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_ff::PrimeField;
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_groth16::Proof;
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
        Fr::from_le_bytes_mod_order(&root_bytes[..]),
        Fr::from_le_bytes_mod_order(&nullifier_bytes[..]),
    ];

    let witness_args = load_witness_args(0, Source::Input).map_err(|_| Error::InvalidProofData)?;
    let proof_bytes = witness_args
        .output_type()
        .to_opt()
        .map(|bytes| bytes.raw_data())
        .ok_or(Error::InvalidProofData)?;

    if proof_bytes.len() != 256 {
        return Err(Error::InvalidProofData);
    }
    
    let vk = vk::get_vk();
    let proof = decode_packed_proof(&proof_bytes[..])?;

    let is_valid = Groth16::<Bn254>::verify(&vk, &public_inputs, &proof)
        .map_err(|_| Error::InvalidProofData)?;

    if !is_valid {
        return Err(Error::InvalidMerkleRoot);
    }

    Ok(())
}

fn decode_fq(bytes: &[u8]) -> Result<Fq, Error> {
    if bytes.len() != 32 {
        return Err(Error::InvalidProofData);
    }
    Ok(Fq::from_le_bytes_mod_order(bytes))
}

fn decode_g1(x_bytes: &[u8], y_bytes: &[u8]) -> Result<G1Affine, Error> {
    let x = decode_fq(x_bytes)?;
    let y = decode_fq(y_bytes)?;
    let point = G1Affine::new_unchecked(x, y);
    if !point.is_on_curve() {
        return Err(Error::InvalidProofData);
    }
    Ok(point)
}

fn decode_g2(
    x_c0_bytes: &[u8],
    x_c1_bytes: &[u8],
    y_c0_bytes: &[u8],
    y_c1_bytes: &[u8],
) -> Result<G2Affine, Error> {
    let x = Fq2::new(decode_fq(x_c0_bytes)?, decode_fq(x_c1_bytes)?);
    let y = Fq2::new(decode_fq(y_c0_bytes)?, decode_fq(y_c1_bytes)?);
    let point = G2Affine::new_unchecked(x, y);
    if !point.is_on_curve() {
        return Err(Error::InvalidProofData);
    }
    Ok(point)
}

fn decode_packed_proof(bytes: &[u8]) -> Result<Proof<Bn254>, Error> {
    let a = decode_g1(&bytes[0..32], &bytes[32..64])?;
    let b = decode_g2(&bytes[96..128], &bytes[64..96], &bytes[160..192], &bytes[128..160])?;
    let c = decode_g1(&bytes[192..224], &bytes[224..256])?;

    Ok(Proof { a, b, c })
}
