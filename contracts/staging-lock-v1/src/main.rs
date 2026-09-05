#![no_std]
#![no_main]

use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{
        load_cell_capacity, load_cell_data, load_cell_lock_hash, load_cell_type_hash,
        load_input_since, load_script, load_script_hash,
    },
};
use obscell_v1_types::{
    PoolStateV1, StagingCellDataV1, StagingLockArgsV1, VERSION, is_canonical_fr, is_zero,
};

mod error;
use error::Error;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!();

pub fn program_entry() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(error) => error as i8,
    }
}

fn validate() -> Result<(), Error> {
    let script = load_script()?;
    let raw_args = script.args().raw_data();
    let args = StagingLockArgsV1::from_slice(&raw_args).map_err(|_| Error::InvalidArgs)?;
    if !args.is_valid() {
        return Err(Error::InvalidArgs);
    }

    let group_count = count_cells(Source::GroupInput)?;
    if group_count == 0 {
        return Err(Error::InvalidCellCount);
    }
    let current_lock_hash = load_script_hash()?;
    let mut staging = Vec::with_capacity(group_count);
    for index in 0..group_count {
        if load_cell_type_hash(index, Source::GroupInput)?.is_none() {
            return Err(Error::InvalidAsset);
        }
        let data = load_cell_data(index, Source::GroupInput)?;
        let cell = StagingCellDataV1::from_slice(&data).map_err(|_| Error::InvalidDeposit)?;
        if cell.deposit.version != VERSION
            || cell.deposit.pool_id != args.pool_id
            || is_zero(&cell.deposit.asset_id)
            || cell.deposit.denomination == 0
            || is_zero(&cell.deposit.commitment)
            || !is_canonical_fr(&cell.deposit.commitment)
            || is_zero(&cell.deposit.refund_lock_hash)
            || cell.deposit.refund_lock_hash == current_lock_hash
            || !valid_relative_block_since(cell.deposit.refund_since)
            || cell.deposit.capacity_reserve == 0
            || load_cell_capacity(index, Source::GroupInput)? < cell.deposit.capacity_reserve
            || cell.ct_commitment.iter().all(|byte| *byte == 0)
            || load_cell_type_hash(index, Source::GroupInput)? != Some(cell.deposit.asset_id)
        {
            return Err(Error::InvalidDeposit);
        }
        staging.push(cell);
    }

    let old_pool = find_pool_state(Source::Input, &args)?;
    let new_pool = find_pool_state(Source::Output, &args)?;
    match (old_pool, new_pool) {
        (Some(old), Some(new)) => validate_acceptance(&args, &staging, &old, &new),
        (None, None) => validate_refund(&staging),
        _ => Err(Error::InvalidPoolTransition),
    }
}

fn validate_acceptance(
    args: &StagingLockArgsV1,
    staging: &[StagingCellDataV1],
    old: &PoolStateV1,
    new: &PoolStateV1,
) -> Result<(), Error> {
    if old.validate(&args.pool_id).is_err()
        || new.validate(&args.pool_id).is_err()
        || old.config != new.config
        || new.sequence
            != old
                .sequence
                .checked_add(1)
                .ok_or(Error::InvalidPoolTransition)?
        || new.next_leaf_index != old.next_leaf_index + staging.len() as u32
    {
        return Err(Error::InvalidPoolTransition);
    }
    for cell in staging {
        if cell.deposit.asset_id != old.config.asset_id
            || cell.deposit.denomination != old.config.denomination
        {
            return Err(Error::InvalidDeposit);
        }
    }
    Ok(())
}

fn validate_refund(staging: &[StagingCellDataV1]) -> Result<(), Error> {
    if staging.len() != 1 {
        return Err(Error::InvalidCellCount);
    }
    let cell = &staging[0];
    let actual_since = load_input_since(0, Source::GroupInput)?;
    if !valid_relative_block_since(actual_since) || actual_since < cell.deposit.refund_since {
        return Err(Error::RefundTooEarly);
    }

    if count_typed_cells(Source::Input, &cell.deposit.asset_id)? != 1
        || count_typed_cells(Source::Output, &cell.deposit.asset_id)? != 1
    {
        return Err(Error::InvalidCellShape);
    }

    let mut refund_index = None;
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, Source::Output) {
            Ok(Some(hash)) if hash == cell.deposit.asset_id => {
                if refund_index.is_some() {
                    return Err(Error::InvalidCellShape);
                }
                refund_index = Some(index);
            }
            Ok(_) => {}
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        }
        index += 1;
    }
    let index = refund_index.ok_or(Error::InvalidAsset)?;
    if load_cell_lock_hash(index, Source::Output)? != cell.deposit.refund_lock_hash {
        return Err(Error::InvalidRefundRecipient);
    }
    let refund_data = load_cell_data(index, Source::Output)?;
    if refund_data.len() < 32
        || refund_data[..32] != cell.ct_commitment
        || load_cell_capacity(index, Source::Output)? < cell.deposit.capacity_reserve
    {
        return Err(Error::InvalidRefundValue);
    }
    Ok(())
}

fn find_pool_state(source: Source, args: &StagingLockArgsV1) -> Result<Option<PoolStateV1>, Error> {
    let mut found = None;
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, source) {
            Ok(Some(hash)) if hash == args.pool_type_hash => {
                if found.is_some() {
                    return Err(Error::InvalidPoolTransition);
                }
                let data = load_cell_data(index, source)?;
                found =
                    Some(PoolStateV1::from_slice(&data).map_err(|_| Error::InvalidPoolTransition)?);
            }
            Ok(_) => {}
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        }
        index += 1;
    }
    Ok(found)
}

fn count_typed_cells(source: Source, asset_id: &[u8; 32]) -> Result<usize, Error> {
    let mut count = 0usize;
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, source) {
            Ok(Some(hash)) if hash == *asset_id => count += 1,
            Ok(Some(_)) => return Err(Error::InvalidCellShape),
            Ok(None) => {}
            Err(SysError::IndexOutOfBound) => return Ok(count),
            Err(error) => return Err(error.into()),
        }
        index += 1;
    }
}

fn count_cells(source: Source) -> Result<usize, Error> {
    let mut count = 0usize;
    loop {
        match load_cell_data(count, source) {
            Ok(_) => count += 1,
            Err(SysError::IndexOutOfBound) => return Ok(count),
            Err(error) => return Err(error.into()),
        }
    }
}

fn valid_relative_block_since(value: u64) -> bool {
    const FLAGS_MASK: u64 = 0xff00_0000_0000_0000;
    const RELATIVE_BLOCK_FLAGS: u64 = 0x8000_0000_0000_0000;
    const VALUE_MASK: u64 = 0x00ff_ffff_ffff_ffff;
    value & FLAGS_MASK == RELATIVE_BLOCK_FLAGS && value & VALUE_MASK != 0
}
