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

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(16384, 1258306, 64);

const HASH_BYTES: usize = 32;
const PUBLIC_INPUTS_BYTES: usize = HASH_BYTES * 2;

struct MembershipWitness<'a> {
    session_id: &'a [u8],
    commitment: [u8; HASH_BYTES],
    blinding_factor: [u8; HASH_BYTES],
    leaf_index: usize,
    sibling_count: usize,
    siblings: &'a [u8],
    directions: &'a [u8],
}

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

fn read_u32(data: &[u8], cursor: &mut usize) -> Result<u32, Error> {
    let end = cursor.checked_add(4).ok_or(Error::InvalidProofData)?;
    let bytes: [u8; 4] = data
        .get(*cursor..end)
        .ok_or(Error::InvalidProofData)?
        .try_into()
        .map_err(|_| Error::InvalidProofData)?;
    *cursor = end;
    Ok(u32::from_le_bytes(bytes))
}

fn read_slice<'a>(data: &'a [u8], cursor: &mut usize, len: usize) -> Result<&'a [u8], Error> {
    let end = cursor.checked_add(len).ok_or(Error::InvalidProofData)?;
    let slice = data.get(*cursor..end).ok_or(Error::InvalidProofData)?;
    *cursor = end;
    Ok(slice)
}

fn read_fixed<const N: usize>(data: &[u8], cursor: &mut usize) -> Result<[u8; N], Error> {
    read_slice(data, cursor, N)?
        .try_into()
        .map_err(|_| Error::InvalidProofData)
}

fn parse_membership_witness(data: &[u8]) -> Result<MembershipWitness<'_>, Error> {
    let mut cursor = 0usize;

    let session_len = read_u32(data, &mut cursor)? as usize;
    let session_id = read_slice(data, &mut cursor, session_len)?;
    let commitment = read_fixed::<HASH_BYTES>(data, &mut cursor)?;
    let blinding_factor = read_fixed::<HASH_BYTES>(data, &mut cursor)?;
    let leaf_index = read_u32(data, &mut cursor)? as usize;
    let sibling_count = read_u32(data, &mut cursor)? as usize;
    let siblings_len = sibling_count
        .checked_mul(HASH_BYTES)
        .ok_or(Error::InvalidProofData)?;
    let siblings = read_slice(data, &mut cursor, siblings_len)?;
    let directions = read_slice(data, &mut cursor, sibling_count)?;

    if cursor != data.len() {
        return Err(Error::InvalidProofData);
    }

    Ok(MembershipWitness {
        session_id,
        commitment,
        blinding_factor,
        leaf_index,
        sibling_count,
        siblings,
        directions,
    })
}

fn hash_with_prefix(prefix: u8, parts: &[&[u8]]) -> [u8; HASH_BYTES] {
    let mut hasher = Sha256::new();
    hasher.update([prefix]);
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().into()
}

fn hash_leaf(commitment: &[u8; HASH_BYTES]) -> [u8; HASH_BYTES] {
    hash_with_prefix(0, &[commitment])
}

fn hash_node(left: &[u8; HASH_BYTES], right: &[u8; HASH_BYTES]) -> [u8; HASH_BYTES] {
    hash_with_prefix(1, &[left, right])
}

fn derive_nullifier(blinding_factor: &[u8; HASH_BYTES], session_id: &[u8]) -> [u8; HASH_BYTES] {
    hash_with_prefix(2, &[blinding_factor, session_id])
}

fn validate() -> Result<(), Error> {
    if count_group_cells(Source::GroupInput)? != 0 || count_group_cells(Source::GroupOutput)? != 1 {
        return Err(Error::InvalidCellCount);
    }

    let output_data = load_cell_data(0, Source::GroupOutput)?;
    if output_data.len() != PUBLIC_INPUTS_BYTES {
        return Err(Error::InvalidProofData);
    }
    let expected_root: [u8; HASH_BYTES] = output_data[..HASH_BYTES]
        .try_into()
        .map_err(|_| Error::InvalidProofData)?;
    let expected_nullifier: [u8; HASH_BYTES] = output_data[HASH_BYTES..]
        .try_into()
        .map_err(|_| Error::InvalidProofData)?;

    let witness_args = load_witness_args(0, Source::Input).map_err(|_| Error::InvalidProofData)?;
    let proof_data = witness_args
        .output_type()
        .to_opt()
        .map(|bytes| bytes.raw_data())
        .ok_or(Error::InvalidProofData)?;
    let proof = parse_membership_witness(&proof_data)?;

    let derived_nullifier = derive_nullifier(&proof.blinding_factor, proof.session_id);
    if derived_nullifier != expected_nullifier {
        return Err(Error::InvalidNullifier);
    }

    let mut current = hash_leaf(&proof.commitment);
    let mut index = proof.leaf_index;

    for step in 0..proof.sibling_count {
        let sibling_bytes: [u8; HASH_BYTES] = proof.siblings
            .get(step * HASH_BYTES..(step + 1) * HASH_BYTES)
            .ok_or(Error::InvalidProofData)?
            .try_into()
            .map_err(|_| Error::InvalidProofData)?;
        let direction = *proof.directions.get(step).ok_or(Error::InvalidProofData)?;
        let expected_direction = if index % 2 == 0 { 0u8 } else { 1u8 };
        if direction != expected_direction {
            return Err(Error::InvalidMerklePath);
        }

        current = match direction {
            0 => hash_node(&current, &sibling_bytes),
            1 => hash_node(&sibling_bytes, &current),
            _ => return Err(Error::InvalidMerklePath),
        };
        index /= 2;
    }

    if current != expected_root {
        return Err(Error::InvalidMerkleRoot);
    }

    Ok(())
}
