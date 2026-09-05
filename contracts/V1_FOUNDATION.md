# Corrected V1 contract foundation

This directory contains an isolated source-level foundation. It is not a
deployable privacy pool and does not replace any legacy contract.

## Identity and data layout

- `pool_id` is the unique 32-byte Type-ID value in `PoolTypeArgsV1` and
  `PoolConfigV1`.
- `pool_type_hash` is the full CKB PoolState type-script hash pinned separately
  in Vault and staging lock args. It is not `pool_id` or `poolDomain`.
- `asset_id` is the exact CT type-script hash.
- Vault cell data remains owned by the CT type. The Vault covenant only reads
  its first 32-byte CT commitment; no plaintext amount is encoded.
- Staging cell data is the CT commitment followed immediately by one canonical
  Molecule `StagingDepositV1` table. Extra CT payload bytes are not supported by
  this V1 foundation layout.

`obscell-v1-types` implements strict encoding/decoding for the schema: exact
table field counts and offsets, exact fixed-vector lengths, no trailing bytes,
checked integer accounting, and canonical BN254 scalar encodings.

## Enforced now

- Type-ID creation shape and immutable pool/asset/denomination configuration;
- singleton PoolState/Vault transaction shape and pinned covenant code refs;
- depth/count/value/root-history bounds and checked arithmetic;
- sequence, staging identity, capacity reserve, and outpoint-order checks;
- withdrawal-shaped state updates are rejected;
- refunds require one exact asset input/output, a valid relative-block `since`
  at least equal to the committed threshold, the committed refund lock,
  unchanged CT commitment, and the capacity reserve. CKB consensus, rather
  than this script-only test harness, determines whether that `since` is mature.

## Fail-closed gates

PoolState genesis returns `UnsupportedInitialization` after structural checks
because the pool-specific Poseidon empty root is not derived on chain yet.
Every PoolState update returns `UnsupportedTransition` because exact Poseidon
frontier append, fixed-denomination CT verification, nullifier updates, action
binding, and corrected-V1 proof verification are not connected.

The ckb-testtool asset used by the foundation tests is an always-success
placeholder. Those tests demonstrate covenant identity and mutation rejection;
they are not evidence of CT conservation, proof verification, or deployability.
