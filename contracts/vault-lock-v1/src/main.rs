#![no_std]
#![no_main]

use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{
        load_cell_data, load_cell_lock_hash, load_cell_type_hash, load_script, load_script_hash,
    },
};
use obscell_v1_types::{PoolStateV1, VaultLockArgsV1};

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
    let args = VaultLockArgsV1::from_slice(&raw_args).map_err(|_| Error::InvalidArgs)?;
    if !args.is_valid() {
        return Err(Error::InvalidArgs);
    }
    if count_cells(Source::GroupInput)? != 1 {
        return Err(Error::InvalidCellCount);
    }
    let output_index = find_successor_vault()?;
    if load_cell_type_hash(0, Source::GroupInput)? != Some(args.asset_id)
        || load_cell_type_hash(output_index, Source::Output)? != Some(args.asset_id)
    {
        return Err(Error::InvalidAsset);
    }

    let old_vault = load_cell_data(0, Source::GroupInput)?;
    let new_vault = load_cell_data(output_index, Source::Output)?;
    if old_vault.len() < 32 || new_vault.len() < 32 || old_vault[..32] == new_vault[..32] {
        return Err(Error::InvalidVaultData);
    }

    let old = find_pool_state(Source::Input, &args)?;
    let new = find_pool_state(Source::Output, &args)?;
    if old.config != new.config
        || old.config.pool_id != args.pool_id
        || old.config.asset_id != args.asset_id
        || old.config.denomination != args.denomination
        || old.validate(&args.pool_id).is_err()
        || new.validate(&args.pool_id).is_err()
    {
        return Err(Error::InvalidPoolState);
    }
    if new.sequence != old.sequence.checked_add(1).ok_or(Error::InvalidSequence)? {
        return Err(Error::InvalidSequence);
    }
    if new.next_leaf_index <= old.next_leaf_index
        || new.outstanding_count <= old.outstanding_count
        || new.nullifier_root != old.nullifier_root
    {
        return Err(Error::UnsupportedTransition);
    }
    let delta = (new.next_leaf_index - old.next_leaf_index) as u64;
    if new.outstanding_count != old.outstanding_count + delta {
        return Err(Error::InvalidAccounting);
    }
    let value_delta = args
        .denomination
        .checked_mul(delta as u128)
        .ok_or(Error::InvalidAccounting)?;
    if new.outstanding_value
        != old
            .outstanding_value
            .checked_add(value_delta)
            .ok_or(Error::InvalidAccounting)?
    {
        return Err(Error::InvalidAccounting);
    }
    Ok(())
}

fn find_successor_vault() -> Result<usize, Error> {
    let current_lock_hash = load_script_hash()?;
    let mut found = None;
    let mut index = 0usize;
    loop {
        match load_cell_lock_hash(index, Source::Output) {
            Ok(hash) if hash == current_lock_hash => {
                if found.is_some() {
                    return Err(Error::InvalidCellCount);
                }
                found = Some(index);
            }
            Ok(_) => {}
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        }
        index += 1;
    }
    found.ok_or(Error::InvalidCellCount)
}

fn find_pool_state(source: Source, args: &VaultLockArgsV1) -> Result<PoolStateV1, Error> {
    let mut found = None;
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, source) {
            Ok(Some(hash)) if hash == args.pool_type_hash => {
                if found.is_some() {
                    return Err(Error::MissingPool);
                }
                let data = load_cell_data(index, source)?;
                found = Some(PoolStateV1::from_slice(&data).map_err(|_| Error::InvalidPoolState)?);
            }
            Ok(_) => {}
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        }
        index += 1;
    }
    found.ok_or(Error::MissingPool)
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
