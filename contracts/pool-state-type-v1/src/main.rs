#![no_std]
#![no_main]

use ckb_std::{
    ckb_constants::Source,
    ckb_types::packed::Script,
    error::SysError,
    high_level::{
        load_cell_capacity, load_cell_data, load_cell_lock, load_cell_lock_hash,
        load_cell_type_hash, load_input, load_script, load_script_hash,
    },
    type_id::check_type_id,
};
use obscell_v1_types::{
    Byte32, MAX_ACCEPTED_STAGING, PoolStateV1, PoolTypeArgsV1, ScriptCodeRefV1, StagingCellDataV1,
    StagingLockArgsV1, StateError, VERSION, VaultLockArgsV1, is_canonical_fr, is_zero,
    root_history_transition_is_valid,
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
    let args = PoolTypeArgsV1::from_slice(&raw_args).map_err(|_| Error::InvalidArgs)?;
    if !args.is_valid() {
        return Err(Error::InvalidArgs);
    }

    let input_count = count_cells(Source::GroupInput)?;
    let output_count = count_cells(Source::GroupOutput)?;
    match (input_count, output_count) {
        (0, 1) => validate_genesis(&args),
        (1, 1) => validate_acceptance(&args),
        _ => Err(Error::InvalidCellCount),
    }
}

fn validate_genesis(args: &PoolTypeArgsV1) -> Result<(), Error> {
    check_type_id(2, 32).map_err(|_| Error::InvalidTypeId)?;
    let pool_type_hash = load_script_hash()?;
    let state = load_state(0, Source::GroupOutput)?;
    validate_state(&state, &args.type_id)?;

    if state.sequence != 0
        || state.next_leaf_index != 0
        || state.outstanding_count != 0
        || state.outstanding_value != 0
        || !is_zero(&state.nullifier_root)
        || state.frontier.iter().any(|node| !is_zero(node))
        || state.accepted_roots.len() != 1
    {
        return Err(Error::InvalidGenesis);
    }

    let mut vault_count = 0usize;
    let mut index = 0usize;
    loop {
        let type_hash = match load_cell_type_hash(index, Source::Output) {
            Ok(value) => value,
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        };
        if type_hash == Some(pool_type_hash) {
            index += 1;
            continue;
        }
        if type_hash == Some(state.config.asset_id)
            && vault_lock_matches(
                index,
                Source::Output,
                &args.vault_lock,
                &args.type_id,
                &pool_type_hash,
                &state,
            )?
        {
            let data = load_cell_data(index, Source::Output)?;
            if data.len() < 32 || data[..32].iter().any(|byte| *byte != 0) {
                return Err(Error::InvalidVault);
            }
            vault_count += 1;
        } else if type_hash.is_some() {
            return Err(Error::InvalidCellShape);
        }
        index += 1;
    }
    if vault_count != 1 || any_typed_cells(Source::Input)? {
        return Err(Error::InvalidVault);
    }

    // The pool-specific Poseidon empty root is not linked yet. A structurally
    // valid cell must not become authoritative until that derivation is exact.
    Err(Error::UnsupportedInitialization)
}

fn validate_acceptance(args: &PoolTypeArgsV1) -> Result<(), Error> {
    let pool_type_hash = load_script_hash()?;
    let old = load_state(0, Source::GroupInput)?;
    let new = load_state(0, Source::GroupOutput)?;
    validate_state(&old, &args.type_id)?;
    validate_state(&new, &args.type_id)?;

    if old.config != new.config {
        return Err(Error::InvalidConfig);
    }
    if new.sequence != old.sequence.checked_add(1).ok_or(Error::InvalidSequence)? {
        return Err(Error::InvalidSequence);
    }
    if new.next_leaf_index <= old.next_leaf_index || new.outstanding_count <= old.outstanding_count
    {
        return Err(Error::UnsupportedTransition);
    }
    let leaf_delta = new.next_leaf_index - old.next_leaf_index;
    if leaf_delta as usize > MAX_ACCEPTED_STAGING
        || new.outstanding_count != old.outstanding_count + leaf_delta as u64
    {
        return Err(Error::InvalidAccounting);
    }
    let value_delta = old
        .config
        .denomination
        .checked_mul(leaf_delta as u128)
        .ok_or(Error::InvalidAccounting)?;
    if new.outstanding_value
        != old
            .outstanding_value
            .checked_add(value_delta)
            .ok_or(Error::InvalidAccounting)?
    {
        return Err(Error::InvalidAccounting);
    }
    if new.nullifier_root != old.nullifier_root {
        return Err(Error::UnsupportedTransition);
    }
    if new.commitment_root == old.commitment_root
        || new.frontier == old.frontier
        || !root_history_transition_is_valid(&old, &new)
    {
        return Err(Error::InvalidRootTransition);
    }

    let input_shape = inspect_acceptance_cells(Source::Input, args, &pool_type_hash, &old, true)?;
    let output_shape =
        inspect_acceptance_cells(Source::Output, args, &pool_type_hash, &new, false)?;
    if input_shape.pool != 1
        || output_shape.pool != 1
        || input_shape.vault != 1
        || output_shape.vault != 1
        || input_shape.staging != leaf_delta as usize
        || output_shape.staging != 0
    {
        return Err(Error::InvalidCellShape);
    }
    if input_shape.vault_commitment == output_shape.vault_commitment {
        return Err(Error::InvalidVault);
    }

    // Identity and accounting checks above are necessary but not sufficient:
    // exact Poseidon frontier append and fixed-denomination CT verification are
    // not linked in this foundation, so no state update is authorized yet.
    Err(Error::UnsupportedTransition)
}

#[derive(Default)]
struct AcceptanceShape {
    pool: usize,
    vault: usize,
    staging: usize,
    vault_commitment: Option<Byte32>,
}

fn inspect_acceptance_cells(
    source: Source,
    args: &PoolTypeArgsV1,
    pool_type_hash: &Byte32,
    state: &PoolStateV1,
    allow_staging: bool,
) -> Result<AcceptanceShape, Error> {
    let mut shape = AcceptanceShape::default();
    let mut previous_outpoint: Option<(Byte32, u32)> = None;
    let mut index = 0usize;
    loop {
        let type_hash = match load_cell_type_hash(index, source) {
            Ok(value) => value,
            Err(SysError::IndexOutOfBound) => break,
            Err(error) => return Err(error.into()),
        };
        match type_hash {
            None => {}
            Some(hash) if hash == *pool_type_hash => shape.pool += 1,
            Some(hash) if hash == state.config.asset_id => {
                if vault_lock_matches(
                    index,
                    source,
                    &args.vault_lock,
                    &args.type_id,
                    pool_type_hash,
                    state,
                )? {
                    let data = load_cell_data(index, source)?;
                    if data.len() < 32 || shape.vault_commitment.is_some() {
                        return Err(Error::InvalidVault);
                    }
                    shape.vault_commitment =
                        Some(data[..32].try_into().map_err(|_| Error::InvalidVault)?);
                    shape.vault += 1;
                } else if allow_staging
                    && staging_lock_matches(
                        index,
                        source,
                        &args.staging_lock,
                        &args.type_id,
                        pool_type_hash,
                    )?
                {
                    validate_staging_cell(index, source, state, &mut previous_outpoint)?;
                    shape.staging += 1;
                } else {
                    return Err(Error::InvalidAsset);
                }
            }
            Some(_) => return Err(Error::InvalidCellShape),
        }
        index += 1;
    }
    Ok(shape)
}

fn validate_staging_cell(
    index: usize,
    source: Source,
    state: &PoolStateV1,
    previous_outpoint: &mut Option<(Byte32, u32)>,
) -> Result<(), Error> {
    let data = load_cell_data(index, source)?;
    let staging = StagingCellDataV1::from_slice(&data).map_err(|_| Error::InvalidStaging)?;
    let deposit = staging.deposit;
    if deposit.version != VERSION
        || deposit.pool_id != state.config.pool_id
        || deposit.asset_id != state.config.asset_id
        || deposit.denomination != state.config.denomination
        || is_zero(&deposit.commitment)
        || !is_canonical_fr(&deposit.commitment)
        || is_zero(&deposit.refund_lock_hash)
        || !valid_relative_block_since(deposit.refund_since)
        || deposit.capacity_reserve == 0
        || load_cell_capacity(index, source)? < deposit.capacity_reserve
        || staging.ct_commitment.iter().all(|byte| *byte == 0)
        || load_cell_lock_hash(index, source)? == deposit.refund_lock_hash
    {
        return Err(Error::InvalidStaging);
    }

    if source == Source::Input {
        let input = load_input(index, Source::Input)?;
        let outpoint = input.previous_output();
        let tx_hash: Byte32 = outpoint
            .tx_hash()
            .raw_data()
            .as_ref()
            .try_into()
            .map_err(|_| Error::InvalidStagingOrder)?;
        let raw_index = outpoint.index().raw_data();
        let output_index = u32::from_le_bytes(
            raw_index
                .as_ref()
                .try_into()
                .map_err(|_| Error::InvalidStagingOrder)?,
        );
        let current = (tx_hash, output_index);
        if previous_outpoint
            .as_ref()
            .is_some_and(|previous| previous >= &current)
        {
            return Err(Error::InvalidStagingOrder);
        }
        *previous_outpoint = Some(current);
    }
    Ok(())
}

fn vault_lock_matches(
    index: usize,
    source: Source,
    code: &ScriptCodeRefV1,
    pool_id: &Byte32,
    pool_type_hash: &Byte32,
    state: &PoolStateV1,
) -> Result<bool, Error> {
    let script = load_cell_lock(index, source)?;
    if !script_code_matches(&script, code) {
        return Ok(false);
    }
    let raw_args = script.args().raw_data();
    let lock_args = VaultLockArgsV1::from_slice(&raw_args).map_err(|_| Error::InvalidVault)?;
    Ok(lock_args.is_valid()
        && lock_args.pool_id == *pool_id
        && lock_args.pool_type_hash == *pool_type_hash
        && lock_args.asset_id == state.config.asset_id
        && lock_args.denomination == state.config.denomination)
}

fn staging_lock_matches(
    index: usize,
    source: Source,
    code: &ScriptCodeRefV1,
    pool_id: &Byte32,
    pool_type_hash: &Byte32,
) -> Result<bool, Error> {
    let script = load_cell_lock(index, source)?;
    if !script_code_matches(&script, code) {
        return Ok(false);
    }
    let raw_args = script.args().raw_data();
    let lock_args = StagingLockArgsV1::from_slice(&raw_args).map_err(|_| Error::InvalidStaging)?;
    Ok(lock_args.is_valid()
        && lock_args.pool_id == *pool_id
        && lock_args.pool_type_hash == *pool_type_hash)
}

fn script_code_matches(script: &Script, expected: &ScriptCodeRefV1) -> bool {
    script.code_hash().raw_data().as_ref() == expected.code_hash
        && u8::from(script.hash_type()) == expected.hash_type
}

fn validate_state(state: &PoolStateV1, pool_id: &Byte32) -> Result<(), Error> {
    state.validate(pool_id).map_err(|error| match error {
        StateError::Version => Error::InvalidVersion,
        StateError::PoolIdentity => Error::InvalidPoolIdentity,
        StateError::AssetIdentity => Error::InvalidAsset,
        StateError::Denomination => Error::InvalidDenomination,
        StateError::NonCanonicalField => Error::NonCanonicalField,
        StateError::Accounting => Error::InvalidAccounting,
        StateError::RootHistory => Error::InvalidRootTransition,
        StateError::TreeDepth
        | StateError::RootHistorySize
        | StateError::Reserved
        | StateError::FrontierLength
        | StateError::TreeCapacity => Error::InvalidConfig,
    })
}

fn load_state(index: usize, source: Source) -> Result<PoolStateV1, Error> {
    let data = load_cell_data(index, source)?;
    PoolStateV1::from_slice(&data).map_err(|_| Error::InvalidStateEncoding)
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

fn any_typed_cells(source: Source) -> Result<bool, Error> {
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, source) {
            Ok(Some(_)) => return Ok(true),
            Ok(None) => index += 1,
            Err(SysError::IndexOutOfBound) => return Ok(false),
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
