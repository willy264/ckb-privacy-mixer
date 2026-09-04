# Corrected Protocol V1

**Status:** Normative design and source-level foundation. No V1 deployment or independent review exists yet. Deployment is forbidden until every gate in this document is implemented and tested.

## Scope

V1 supports one CT asset and one fixed denomination per pool, one commitment per staging cell, one-note withdrawal, one recipient CT output, depth-20 Merkle membership, and optional fee-only relaying. Arbitrary values, private-to-private transfer, join-split, shielded change, and advanced stealth are outside V1.

## Identities

- `pool_id`: the unique 32-byte Type-ID value carried in the PoolState type-script args.
- `asset_id`: the exact 32-byte CT type script hash accepted by the pool.
- `poolDomain`: the field-domain hash of the full canonical PoolState type script; unlike `pool_id`, it binds the deployed code hash and hash type as well as the Type-ID args.
- `PoolStateCell`: exactly one live cell using the pool's V1 type script and identity.
- `VaultCell`: exactly one sibling cell using the exact CT type and a V1 vault covenant bound to `pool_id`.
- `StagingDepositCell`: a CT cell under the V1 staging covenant whose data commits to the target pool and refund conditions.

Code hashes, Type-IDs, and genesis state are new. Legacy deployments cannot be upgraded into or consumed by V1.

## Canonical Encoding

The Molecule schema is `schemas/obscell_v1.mol`.

1. All structures use the exact declared V1 shape; unknown versions, reserved bits, trailing bytes, wrong vector sizes, and non-minimal encodings fail.
2. `Uint*` values are fixed-width unsigned little-endian and must pass checked arithmetic.
3. Fr and Fq values are exactly 32 bytes little-endian at the contract/proof ABI.
4. Fr values must be `< 21888242871839275222246405745257275088548364400416034343698204186575808495617`.
5. Fq values must be `< 21888242871839275222246405745257275088696311157297823662689037894645226208583`.
6. Decoders reject values at or above the modulus. They never call a modulo-reducing constructor on attacker-controlled bytes.
7. SDK `FieldHex` uses a 32-byte big-endian hexadecimal numeric representation. Explicit conversion is required at the little-endian ABI boundary.

## Pool State

`PoolConfigV1` is immutable. It requires `version = 1`, `tree_depth = 20`, `reserved = 0`, a positive denomination, and a bounded `root_history_size`. `frontier` contains exactly 20 canonical Fr values. `accepted_roots` has exactly the configured bounded length policy and includes the current root.

The accounting invariant is:

```text
outstanding_value = denomination * outstanding_count
next_leaf_index = total accepted commitment count
next_leaf_index <= 2^20
```

The pool-specific empty tree is deterministic:

```text
zero[0] = Poseidon(MERKLE_EMPTY_TAG, poolDomain)
zero[level + 1] = Poseidon(MERKLE_NODE_TAG, poolDomain, level, zero[level], zero[level])
emptyRoot = zero[20]
```

The live Vault's CT value/commitment must agree with PoolState accounting under the CT conservation proof. PoolState data alone cannot mint or authorize CT.

## Domain Separation

Circuit tags are lowercase ASCII labels interpreted as unsigned little-endian integers:

- `obscell/v1/leaf`
- `obscell/v1/nullifier`
- `obscell/v1/auth`
- `obscell/v1/merkle-empty`
- `obscell/v1/merkle-node`

The remaining frozen V1 tags are:

- `obscell/v1/action`
- `obscell/v1/pool-domain`
- `obscell/v1/asset-domain`
- `obscell/v1/recipient-domain`
- `obscell/v1/recipient-commit`
- `obscell/v1/recipient-ct`

Script domains use the pool, asset, and recipient tags above. Let `B` be the canonical CKB Molecule `Script` bytes produced by the `ckb-molecule-script-v1` schema. Split `B` in order into non-padded chunks `C_i` of at most 31 bytes and interpret each chunk as an unsigned little-endian integer. Then:

```text
s[0] = Poseidon(domainTag, byteLength(B))
s[i + 1] = Poseidon(domainTag, s[i], i, LE(C_i))
scriptDomain = s[chunkCount]
```

The byte length and chunk index make boundaries and trailing zero bytes unambiguous. Every chunk is below `2^248`, so no modulo reduction occurs. Pool, asset, and recipient use distinct tags.

## Circuit Statement

The public signal order is frozen:

```text
poolDomain
assetDomain
denomination
value
root
nullifierHash
recipientDomain
actionHash
authTag
```

Private witnesses are `secret`, `nullifierSecret`, `pathElements[20]`, and `pathIndices[20]`.

```text
value = denomination

leaf = Poseidon(
  LEAF_TAG, poolDomain, assetDomain, denomination, secret, nullifierSecret
)

leafIndex = sum(pathIndices[level] * 2^level), level = 0..19

nullifierHash = Poseidon(
  NULLIFIER_TAG, poolDomain, nullifierSecret, leafIndex
)

authTag = Poseidon(AUTH_TAG, secret, recipientDomain, actionHash)

node[level] = Poseidon(
  MERKLE_NODE_TAG, poolDomain, level, left, right
)
```

Every `pathIndices` value is boolean. Level zero is the leaf level. Path bit zero places the current value left; bit one places it right.

## Protected Action

Withdrawal output positions are fixed: successor PoolState is output `0`, successor Vault is output `1`, and recipient CT is output `2`. Untyped fee change, if any, begins after the protected outputs.

The withdrawal action binds the following values through a hierarchical Poseidon hash. `vaultInputAmount` and `vaultOutputAmount` are the logical fixed-denomination accounting values derived from PoolState; the CT script separately proves the confidential commitment conservation relation.

```text
identityHash = Poseidon(
  ACTION_TAG, 2, poolDomain, assetDomain, denomination, value
)

stateHash = Poseidon(
  ACTION_TAG, root, nullifierHash, currentSequence, nextSequence
)

payoutHash = Poseidon(
  ACTION_TAG,
  recipientDomain,
  recipientCtCommitmentHash,
  recipientCtDataHash,
  2,
  recipientOutputCapacity,
  vaultInputAmount,
  vaultOutputAmount
)

actionHash = Poseidon(ACTION_TAG, identityHash, stateHash, payoutHash)
```

The action therefore binds:

- action kind/version;
- pool and asset domains;
- denomination and value;
- current accepted root;
- nullifier hash;
- current state sequence (successor is constrained to current + 1);
- current and successor Vault accounting;
- recipient lock domain;
- exact recipient CT output data/commitment domain;
- recipient output capacity reserve;
- fixed protocol output index `2`.

`recipientCtCommitmentHash` and `recipientCtDataHash` use the byte sponge above with their dedicated tags. The Pool script derives this context from actual live inputs and outputs, recomputes `actionHash`, and compares it with the public signal. Client-supplied protected fields are never authoritative. Fee-only inputs/change may vary only outside this protected set and must be untyped.

## Initialization

Initialization creates one PoolState and one Vault under fresh V1 identities. The tree uses the V1 empty-root sequence, frontier is empty, sequence/count/value/index are zero, and Vault CT value is zero. Type-ID creation rules and a deployment manifest bind the pool to exact script/circuit/CT versions.

## Staging

The user starts with a pre-existing supported CT cell. CCC constructs a transaction that the user's operation-scoped signer approves. It creates a `StagingDepositV1` output with exact pool/asset/denomination/commitment, refund-lock hash, relative timeout, and capacity reserve. Any CT change is user-controlled and exists only in this staging transaction.

Staging is not a private balance. A note becomes accepted/spendable only after the staging transaction and its PoolState/Vault acceptance are canonically confirmed.

## Acceptance

Acceptance consumes the current PoolState, sibling Vault, and one or more confirmed staging cells. It produces exactly one successor PoolState and Vault. Staging inputs are deterministically ordered by outpoint. For each staging input, the script verifies identity/value/data and appends the exact commitment. Sequence increases by one for the whole transaction, root/frontier/index and root history update deterministically, nullifier root is unchanged, and Vault/count/value increase by the accepted total.

Any party may construct acceptance. Concurrent builders naturally conflict on the singleton PoolState/Vault inputs. Service locks are optimizations, not consensus.

## Refund

After `refund_since`, the committed refund owner may consume an unaccepted staging cell and reproduce the exact CT asset/value under the committed refund lock. Refund does not consume or modify PoolState or Vault. Before the timeout or with changed asset/value/recipient, it fails.

## Withdrawal

Withdrawal consumes the current PoolState and Vault plus optional untyped fee cells. It proves the frozen statement against a current or retained accepted root. It changes the nullifier from absent to spent, increments sequence, preserves commitment frontier/index, decrements count/value and Vault CT by exactly one denomination, and creates exactly one recipient-controlled CT output using the pool asset and capacity reserve.

The recipient must then be able to spend that output through an ordinary CCC-compatible signer. A transaction is invalid if recipient, asset, value, action, state sequence, vault delta, output index/data, root, nullifier, or proof changes.

## Proof Verification

The verifier accepts exactly nine canonical Fr inputs and one versioned proof. Every G1/G2 coordinate is canonical Fq, points at infinity are rejected, curve membership is checked, and correct subgroup membership is checked before pairings. The verifying key is pinned by deployed code/manifest. Existing legacy artifacts are incompatible.

## Confirmation And Reorg Policy

Clients and services distinguish `queued`, `validated`, `submitted`, and `committed`. Only canonical chain observation can produce `committed`. The deployment chooses a confirmation depth. Index checkpoints include block number and hash; a mismatch rolls state, notes, and operations back to the common ancestor and replays canonical events.

## Deployment Gates

1. Molecule code generation and Rust/TypeScript round-trip vectors.
2. Complete PoolState, Vault, staging/refund, proof, nullifier, and CT scripts.
3. Cross-language domain/action/Merkle/proof vectors.
4. Complete mutation and CT-inflation tests.
5. Corrected-workload proof-system benchmark and documented selection.
6. Reproducible circuit setup/artifact hashes and verifier generation.
7. Independent review findings triaged.
8. Full Pudge runbook including recipient spend and Redis rebuild.
