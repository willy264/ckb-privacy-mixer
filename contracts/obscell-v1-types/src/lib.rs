#![no_std]

extern crate alloc;

use alloc::vec::Vec;

pub type Byte32 = [u8; 32];

pub const VERSION: u16 = 1;
pub const TREE_DEPTH: u8 = 20;
pub const TREE_CAPACITY: u32 = 1 << TREE_DEPTH;
pub const MAX_ROOT_HISTORY_SIZE: u8 = 32;
pub const MAX_ACCEPTED_STAGING: usize = 16;
pub const CT_COMMITMENT_SIZE: usize = 32;
pub const POOL_CONFIG_SIZE: usize = 86;
pub const SCRIPT_CODE_REF_SIZE: usize = 33;
pub const POOL_TYPE_ARGS_SIZE: usize = 100;
pub const VAULT_LOCK_ARGS_SIZE: usize = 114;
pub const STAGING_LOCK_ARGS_SIZE: usize = 66;

const FR_MODULUS_BE: Byte32 = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CodecError {
    InvalidLength,
    InvalidTable,
    InvalidVector,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateError {
    Version,
    PoolIdentity,
    AssetIdentity,
    Denomination,
    TreeDepth,
    RootHistorySize,
    Reserved,
    NonCanonicalField,
    FrontierLength,
    RootHistory,
    TreeCapacity,
    Accounting,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScriptCodeRefV1 {
    pub code_hash: Byte32,
    pub hash_type: u8,
}

impl ScriptCodeRefV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() != SCRIPT_CODE_REF_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            code_hash: read_array(&data[..32])?,
            hash_type: data[32],
        })
    }

    pub fn to_bytes(self) -> [u8; SCRIPT_CODE_REF_SIZE] {
        let mut data = [0u8; SCRIPT_CODE_REF_SIZE];
        data[..32].copy_from_slice(&self.code_hash);
        data[32] = self.hash_type;
        data
    }

    pub fn is_valid(&self) -> bool {
        !is_zero(&self.code_hash) && matches!(self.hash_type, 0 | 1 | 2 | 4)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PoolTypeArgsV1 {
    pub version: u16,
    pub type_id: Byte32,
    pub vault_lock: ScriptCodeRefV1,
    pub staging_lock: ScriptCodeRefV1,
}

impl PoolTypeArgsV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() != POOL_TYPE_ARGS_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            version: read_u16(&data[..2])?,
            type_id: read_array(&data[2..34])?,
            vault_lock: ScriptCodeRefV1::from_slice(&data[34..67])?,
            staging_lock: ScriptCodeRefV1::from_slice(&data[67..100])?,
        })
    }

    pub fn to_bytes(self) -> [u8; POOL_TYPE_ARGS_SIZE] {
        let mut data = [0u8; POOL_TYPE_ARGS_SIZE];
        data[..2].copy_from_slice(&self.version.to_le_bytes());
        data[2..34].copy_from_slice(&self.type_id);
        data[34..67].copy_from_slice(&self.vault_lock.to_bytes());
        data[67..100].copy_from_slice(&self.staging_lock.to_bytes());
        data
    }

    pub fn is_valid(&self) -> bool {
        self.version == VERSION
            && !is_zero(&self.type_id)
            && self.vault_lock.is_valid()
            && self.staging_lock.is_valid()
            && self.vault_lock != self.staging_lock
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VaultLockArgsV1 {
    pub version: u16,
    pub pool_id: Byte32,
    pub pool_type_hash: Byte32,
    pub asset_id: Byte32,
    pub denomination: u128,
}

impl VaultLockArgsV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() != VAULT_LOCK_ARGS_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            version: read_u16(&data[..2])?,
            pool_id: read_array(&data[2..34])?,
            pool_type_hash: read_array(&data[34..66])?,
            asset_id: read_array(&data[66..98])?,
            denomination: read_u128(&data[98..114])?,
        })
    }

    pub fn to_bytes(self) -> [u8; VAULT_LOCK_ARGS_SIZE] {
        let mut data = [0u8; VAULT_LOCK_ARGS_SIZE];
        data[..2].copy_from_slice(&self.version.to_le_bytes());
        data[2..34].copy_from_slice(&self.pool_id);
        data[34..66].copy_from_slice(&self.pool_type_hash);
        data[66..98].copy_from_slice(&self.asset_id);
        data[98..114].copy_from_slice(&self.denomination.to_le_bytes());
        data
    }

    pub fn is_valid(&self) -> bool {
        self.version == VERSION
            && !is_zero(&self.pool_id)
            && !is_zero(&self.pool_type_hash)
            && !is_zero(&self.asset_id)
            && self.denomination > 0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StagingLockArgsV1 {
    pub version: u16,
    pub pool_id: Byte32,
    pub pool_type_hash: Byte32,
}

impl StagingLockArgsV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() != STAGING_LOCK_ARGS_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            version: read_u16(&data[..2])?,
            pool_id: read_array(&data[2..34])?,
            pool_type_hash: read_array(&data[34..66])?,
        })
    }

    pub fn to_bytes(self) -> [u8; STAGING_LOCK_ARGS_SIZE] {
        let mut data = [0u8; STAGING_LOCK_ARGS_SIZE];
        data[..2].copy_from_slice(&self.version.to_le_bytes());
        data[2..34].copy_from_slice(&self.pool_id);
        data[34..66].copy_from_slice(&self.pool_type_hash);
        data
    }

    pub fn is_valid(&self) -> bool {
        self.version == VERSION && !is_zero(&self.pool_id) && !is_zero(&self.pool_type_hash)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PoolConfigV1 {
    pub version: u16,
    pub pool_id: Byte32,
    pub asset_id: Byte32,
    pub denomination: u128,
    pub tree_depth: u8,
    pub root_history_size: u8,
    pub reserved: u16,
}

impl PoolConfigV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() != POOL_CONFIG_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            version: read_u16(&data[..2])?,
            pool_id: read_array(&data[2..34])?,
            asset_id: read_array(&data[34..66])?,
            denomination: read_u128(&data[66..82])?,
            tree_depth: data[82],
            root_history_size: data[83],
            reserved: read_u16(&data[84..86])?,
        })
    }

    pub fn to_bytes(self) -> [u8; POOL_CONFIG_SIZE] {
        let mut data = [0u8; POOL_CONFIG_SIZE];
        data[..2].copy_from_slice(&self.version.to_le_bytes());
        data[2..34].copy_from_slice(&self.pool_id);
        data[34..66].copy_from_slice(&self.asset_id);
        data[66..82].copy_from_slice(&self.denomination.to_le_bytes());
        data[82] = self.tree_depth;
        data[83] = self.root_history_size;
        data[84..86].copy_from_slice(&self.reserved.to_le_bytes());
        data
    }

    pub fn validate(&self, expected_pool_id: &Byte32) -> Result<(), StateError> {
        if self.version != VERSION {
            return Err(StateError::Version);
        }
        if is_zero(&self.pool_id) || self.pool_id != *expected_pool_id {
            return Err(StateError::PoolIdentity);
        }
        if is_zero(&self.asset_id) {
            return Err(StateError::AssetIdentity);
        }
        if self.denomination == 0 {
            return Err(StateError::Denomination);
        }
        if self.tree_depth != TREE_DEPTH {
            return Err(StateError::TreeDepth);
        }
        if self.root_history_size == 0 || self.root_history_size > MAX_ROOT_HISTORY_SIZE {
            return Err(StateError::RootHistorySize);
        }
        if self.reserved != 0 {
            return Err(StateError::Reserved);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolStateV1 {
    pub config: PoolConfigV1,
    pub sequence: u64,
    pub commitment_root: Byte32,
    pub nullifier_root: Byte32,
    pub next_leaf_index: u32,
    pub outstanding_count: u64,
    pub outstanding_value: u128,
    pub frontier: Vec<Byte32>,
    pub accepted_roots: Vec<Byte32>,
}

impl PoolStateV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        let fields = decode_table::<9>(data)?;
        Ok(Self {
            config: PoolConfigV1::from_slice(fields[0])?,
            sequence: read_u64(fields[1])?,
            commitment_root: read_array(fields[2])?,
            nullifier_root: read_array(fields[3])?,
            next_leaf_index: read_u32(fields[4])?,
            outstanding_count: read_u64(fields[5])?,
            outstanding_value: read_u128(fields[6])?,
            frontier: decode_byte32_vec(fields[7])?,
            accepted_roots: decode_byte32_vec(fields[8])?,
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let config = self.config.to_bytes();
        let sequence = self.sequence.to_le_bytes();
        let next_leaf_index = self.next_leaf_index.to_le_bytes();
        let outstanding_count = self.outstanding_count.to_le_bytes();
        let outstanding_value = self.outstanding_value.to_le_bytes();
        let frontier = encode_byte32_vec(&self.frontier);
        let accepted_roots = encode_byte32_vec(&self.accepted_roots);
        encode_table(&[
            &config,
            &sequence,
            &self.commitment_root,
            &self.nullifier_root,
            &next_leaf_index,
            &outstanding_count,
            &outstanding_value,
            &frontier,
            &accepted_roots,
        ])
    }

    pub fn validate(&self, expected_pool_id: &Byte32) -> Result<(), StateError> {
        self.config.validate(expected_pool_id)?;
        if !is_canonical_fr(&self.commitment_root)
            || !is_canonical_fr(&self.nullifier_root)
            || self.frontier.iter().any(|value| !is_canonical_fr(value))
            || self
                .accepted_roots
                .iter()
                .any(|value| !is_canonical_fr(value))
        {
            return Err(StateError::NonCanonicalField);
        }
        if self.frontier.len() != TREE_DEPTH as usize {
            return Err(StateError::FrontierLength);
        }
        if self.accepted_roots.is_empty()
            || self.accepted_roots.len() > self.config.root_history_size as usize
            || self.accepted_roots.last() != Some(&self.commitment_root)
        {
            return Err(StateError::RootHistory);
        }
        if self.next_leaf_index > TREE_CAPACITY {
            return Err(StateError::TreeCapacity);
        }
        if self.outstanding_count > self.next_leaf_index as u64
            || self
                .config
                .denomination
                .checked_mul(self.outstanding_count as u128)
                != Some(self.outstanding_value)
        {
            return Err(StateError::Accounting);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StagingDepositV1 {
    pub version: u16,
    pub pool_id: Byte32,
    pub asset_id: Byte32,
    pub denomination: u128,
    pub commitment: Byte32,
    pub refund_lock_hash: Byte32,
    pub refund_since: u64,
    pub capacity_reserve: u64,
}

impl StagingDepositV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        let fields = decode_table::<8>(data)?;
        Ok(Self {
            version: read_u16(fields[0])?,
            pool_id: read_array(fields[1])?,
            asset_id: read_array(fields[2])?,
            denomination: read_u128(fields[3])?,
            commitment: read_array(fields[4])?,
            refund_lock_hash: read_array(fields[5])?,
            refund_since: read_u64(fields[6])?,
            capacity_reserve: read_u64(fields[7])?,
        })
    }

    pub fn to_bytes(self) -> Vec<u8> {
        let version = self.version.to_le_bytes();
        let denomination = self.denomination.to_le_bytes();
        let refund_since = self.refund_since.to_le_bytes();
        let capacity_reserve = self.capacity_reserve.to_le_bytes();
        encode_table(&[
            &version,
            &self.pool_id,
            &self.asset_id,
            &denomination,
            &self.commitment,
            &self.refund_lock_hash,
            &refund_since,
            &capacity_reserve,
        ])
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StagingCellDataV1 {
    pub ct_commitment: Byte32,
    pub deposit: StagingDepositV1,
}

impl StagingCellDataV1 {
    pub fn from_slice(data: &[u8]) -> Result<Self, CodecError> {
        if data.len() <= CT_COMMITMENT_SIZE {
            return Err(CodecError::InvalidLength);
        }
        Ok(Self {
            ct_commitment: read_array(&data[..CT_COMMITMENT_SIZE])?,
            deposit: StagingDepositV1::from_slice(&data[CT_COMMITMENT_SIZE..])?,
        })
    }

    pub fn to_bytes(self) -> Vec<u8> {
        let deposit = self.deposit.to_bytes();
        let mut data = Vec::with_capacity(CT_COMMITMENT_SIZE + deposit.len());
        data.extend_from_slice(&self.ct_commitment);
        data.extend_from_slice(&deposit);
        data
    }
}

pub fn is_zero(value: &Byte32) -> bool {
    value.iter().all(|byte| *byte == 0)
}

pub fn is_canonical_fr(value_le: &Byte32) -> bool {
    for index in 0..32 {
        let value_byte = value_le[31 - index];
        let modulus_byte = FR_MODULUS_BE[index];
        if value_byte < modulus_byte {
            return true;
        }
        if value_byte > modulus_byte {
            return false;
        }
    }
    false
}

pub fn root_history_transition_is_valid(old: &PoolStateV1, new: &PoolStateV1) -> bool {
    let limit = old.config.root_history_size as usize;
    if new.accepted_roots.last() != Some(&new.commitment_root) {
        return false;
    }
    if old.accepted_roots.len() < limit {
        new.accepted_roots.len() == old.accepted_roots.len() + 1
            && new.accepted_roots[..old.accepted_roots.len()] == old.accepted_roots
    } else {
        new.accepted_roots.len() == limit
            && new.accepted_roots[..limit - 1] == old.accepted_roots[1..]
    }
}

fn read_array<const N: usize>(data: &[u8]) -> Result<[u8; N], CodecError> {
    data.try_into().map_err(|_| CodecError::InvalidLength)
}

fn read_u16(data: &[u8]) -> Result<u16, CodecError> {
    Ok(u16::from_le_bytes(read_array(data)?))
}

fn read_u32(data: &[u8]) -> Result<u32, CodecError> {
    Ok(u32::from_le_bytes(read_array(data)?))
}

fn read_u64(data: &[u8]) -> Result<u64, CodecError> {
    Ok(u64::from_le_bytes(read_array(data)?))
}

fn read_u128(data: &[u8]) -> Result<u128, CodecError> {
    Ok(u128::from_le_bytes(read_array(data)?))
}

fn decode_table<const N: usize>(data: &[u8]) -> Result<[&[u8]; N], CodecError> {
    let header_size = 4usize.checked_mul(N + 1).ok_or(CodecError::InvalidTable)?;
    if data.len() < header_size || read_u32(&data[..4])? as usize != data.len() {
        return Err(CodecError::InvalidTable);
    }
    let mut offsets = [0usize; N];
    for (index, offset) in offsets.iter_mut().enumerate() {
        let start = 4 + index * 4;
        *offset = read_u32(&data[start..start + 4])? as usize;
    }
    if offsets[0] != header_size {
        return Err(CodecError::InvalidTable);
    }
    let mut fields = [&[][..]; N];
    for index in 0..N {
        let start = offsets[index];
        let end = if index + 1 == N {
            data.len()
        } else {
            offsets[index + 1]
        };
        if start > end || end > data.len() {
            return Err(CodecError::InvalidTable);
        }
        fields[index] = &data[start..end];
    }
    Ok(fields)
}

fn encode_table(fields: &[&[u8]]) -> Vec<u8> {
    let header_size = 4 * (fields.len() + 1);
    let total_size = fields
        .iter()
        .fold(header_size, |size, field| size + field.len());
    let mut data = Vec::with_capacity(total_size);
    data.extend_from_slice(&(total_size as u32).to_le_bytes());
    let mut offset = header_size;
    for field in fields {
        data.extend_from_slice(&(offset as u32).to_le_bytes());
        offset += field.len();
    }
    for field in fields {
        data.extend_from_slice(field);
    }
    data
}

fn decode_byte32_vec(data: &[u8]) -> Result<Vec<Byte32>, CodecError> {
    if data.len() < 4 {
        return Err(CodecError::InvalidVector);
    }
    let count = read_u32(&data[..4])? as usize;
    let expected = count
        .checked_mul(32)
        .and_then(|size| size.checked_add(4))
        .ok_or(CodecError::InvalidVector)?;
    if data.len() != expected {
        return Err(CodecError::InvalidVector);
    }
    data[4..]
        .chunks_exact(32)
        .map(read_array)
        .collect::<Result<Vec<_>, _>>()
}

fn encode_byte32_vec(values: &[Byte32]) -> Vec<u8> {
    let mut data = Vec::with_capacity(4 + values.len() * 32);
    data.extend_from_slice(&(values.len() as u32).to_le_bytes());
    for value in values {
        data.extend_from_slice(value);
    }
    data
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;

    fn sample_state() -> PoolStateV1 {
        PoolStateV1 {
            config: PoolConfigV1 {
                version: VERSION,
                pool_id: [1; 32],
                asset_id: [2; 32],
                denomination: 100,
                tree_depth: TREE_DEPTH,
                root_history_size: 4,
                reserved: 0,
            },
            sequence: 0,
            commitment_root: [3; 32],
            nullifier_root: [0; 32],
            next_leaf_index: 0,
            outstanding_count: 0,
            outstanding_value: 0,
            frontier: vec![[0; 32]; TREE_DEPTH as usize],
            accepted_roots: vec![[3; 32]],
        }
    }

    #[test]
    fn pool_state_round_trip_uses_strict_molecule_table() {
        let state = sample_state();
        let bytes = state.to_bytes();
        assert_eq!(PoolStateV1::from_slice(&bytes), Ok(state));
    }

    #[test]
    fn pool_state_rejects_trailing_bytes() {
        let mut bytes = sample_state().to_bytes();
        bytes.push(0);
        assert_eq!(
            PoolStateV1::from_slice(&bytes),
            Err(CodecError::InvalidTable)
        );
    }

    #[test]
    fn field_modulus_is_not_canonical() {
        let mut modulus_le = FR_MODULUS_BE;
        modulus_le.reverse();
        assert!(!is_canonical_fr(&modulus_le));
        modulus_le[0] -= 1;
        assert!(is_canonical_fr(&modulus_le));
    }
}
