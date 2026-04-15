#![no_std]
#![no_main]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::load_cell_data,
};

mod error;
use error::Error;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(16384, 1258306, 64);

const COUNT_BYTES: usize = 4;
const NULLIFIER_BYTES: usize = 32;

struct RegistryView<'a> {
    count: usize,
    nullifiers: &'a [u8],
}

pub fn program_entry() -> i8 {
    match validate() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}

fn parse_registry(data: &[u8]) -> Result<RegistryView<'_>, Error> {
    if data.len() < COUNT_BYTES {
        return Err(Error::InvalidRegistryData);
    }

    let count = u32::from_le_bytes(
        data[..COUNT_BYTES]
            .try_into()
            .map_err(|_| Error::InvalidRegistryData)?,
    ) as usize;
    let expected_len = COUNT_BYTES
        .checked_add(
            count
                .checked_mul(NULLIFIER_BYTES)
                .ok_or(Error::InvalidRegistryData)?,
        )
        .ok_or(Error::InvalidRegistryData)?;

    if data.len() != expected_len {
        return Err(Error::InvalidRegistryData);
    }

    Ok(RegistryView {
        count,
        nullifiers: &data[COUNT_BYTES..],
    })
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

fn validate_init() -> Result<(), Error> {
    let output_data = load_cell_data(0, Source::GroupOutput)?;
    let registry = parse_registry(&output_data)?;
    if registry.count != 0 {
        return Err(Error::NonEmptyInitRegistry);
    }
    Ok(())
}

fn validate_update() -> Result<(), Error> {
    let input_data = load_cell_data(0, Source::GroupInput)?;
    let output_data = load_cell_data(0, Source::GroupOutput)?;

    let old_registry = parse_registry(&input_data)?;
    let new_registry = parse_registry(&output_data)?;

    if new_registry.count != old_registry.count + 1 {
        return Err(Error::InvalidRegistryUpdate);
    }

    if !new_registry.nullifiers.starts_with(old_registry.nullifiers) {
        return Err(Error::InvalidRegistryUpdate);
    }

    let appended_offset = old_registry
        .count
        .checked_mul(NULLIFIER_BYTES)
        .ok_or(Error::InvalidRegistryUpdate)?;
    let appended_end = appended_offset
        .checked_add(NULLIFIER_BYTES)
        .ok_or(Error::InvalidRegistryUpdate)?;
    let new_nullifier = &new_registry.nullifiers[appended_offset..appended_end];

    for existing in old_registry.nullifiers.chunks_exact(NULLIFIER_BYTES) {
        if existing == new_nullifier {
            return Err(Error::NullifierAlreadyUsed);
        }
    }

    Ok(())
}

fn validate() -> Result<(), Error> {
    let input_count = count_group_cells(Source::GroupInput)?;
    let output_count = count_group_cells(Source::GroupOutput)?;

    match (input_count, output_count) {
        (0, 1) => validate_init(),
        (1, 1) => validate_update(),
        _ => Err(Error::InvalidCellCount),
    }
}
