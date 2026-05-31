#![no_std]
#![no_main]

#[cfg(not(feature = "library"))]
use ckb_std::default_alloc;
#[cfg(not(feature = "library"))]
ckb_std::entry!(program_entry);
#[cfg(not(feature = "library"))]
default_alloc!();

use ckb_std::{
    ckb_constants::Source,
    high_level::{load_cell_capacity, load_cell_data, load_script, QueryIter},
};

/// Minimum stake: 100,000 CKB in shannons.
const MIN_STAKE_SHANNONS: u64 = 100_000 * 100_000_000;

pub fn program_entry() -> i8 {
    let _script = load_script().unwrap();

    let output_capacities: alloc::vec::Vec<u64> =
        QueryIter::new(load_cell_capacity, Source::GroupOutput).collect();

    // We only validate outputs.
    // If the user wants to destroy the registry cell, they simply don't create it
    // in the output (handled by the standard lock script).
    // If they create or update it, the output must have sufficient capacity
    // and valid data.
    for (i, capacity) in output_capacities.iter().enumerate() {
        if *capacity < MIN_STAKE_SHANNONS {
            return 1; // ERR_INSUFFICIENT_STAKE
        }

        let data = load_cell_data(i, Source::GroupOutput).unwrap();
        if data.len() < 32 {
            return 2; // ERR_INVALID_DATA (Must contain at least a 32-byte PubKey/Waku Node ID)
        }
    }

    0
}
