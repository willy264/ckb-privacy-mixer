# Obscell withdrawal circuit V1

Status: source-and-vector foundation only. This circuit has not had an
independent cryptographic review, has no V1 trusted-setup artifacts, is not
wired to a V1 pool contract, and is not deployed on Pudge or any other network.

## Statement

The circuit has exactly nine public signals in this frozen order:

1. `poolDomain`
2. `assetDomain`
3. `denomination`
4. `value`
5. `root`
6. `nullifierHash`
7. `recipientDomain`
8. `actionHash`
9. `authTag`

Its private witnesses are `secret`, `nullifierSecret`, `pathElements[20]`, and
`pathIndices[20]`. Path bit zero places the current node on the left; bit one
places it on the right. Level zero is the leaf level, so the leaf index is the
little-endian bit composition:

```text
leafIndex = sum(pathIndices[level] * 2^level), level = 0..19
```

The constrained relations are:

```text
value = denomination

leaf = Poseidon(
  LEAF_TAG,
  poolDomain,
  assetDomain,
  denomination,
  secret,
  nullifierSecret
)

nullifierHash = Poseidon(
  NULLIFIER_TAG,
  poolDomain,
  nullifierSecret,
  leafIndex
)

authTag = Poseidon(AUTH_TAG, secret, recipientDomain, actionHash)

node[level] = Poseidon(
  MERKLE_NODE_TAG,
  poolDomain,
  level,
  left,
  right
)
```

Including the numeric level in every node hash prevents a node from one tree
level being reused at another level under the same pool domain. Including the
pool domain prevents the same path from being reused between pools.

## Frozen tags

Tags are the unsigned little-endian integer encodings of these ASCII strings.
All are canonical BN254 scalar-field elements.

| Constant | ASCII label | Decimal field element |
| --- | --- | ---: |
| `LEAF_TAG` | `obscell/v1/leaf` | `531589708827954721157172160707650159` |
| `NULLIFIER_TAG` | `obscell/v1/nullifier` | `653086504777925466883665219146239842194554053231` |
| `AUTH_TAG` | `obscell/v1/auth` | `542360932573758878346893891871138415` |
| `MERKLE_EMPTY_TAG` | `obscell/v1/merkle-empty` | `11633062593140167895871423674073808488326486526749008495` |
| `MERKLE_NODE_TAG` | `obscell/v1/merkle-node` | `37935372653573014929958344014081385067853607695770223` |

The canonical empty-tree rule is:

```text
zero[0] = Poseidon(MERKLE_EMPTY_TAG, poolDomain)
zero[level + 1] = Poseidon(
  MERKLE_NODE_TAG,
  poolDomain,
  level,
  zero[level],
  zero[level]
)
```

The depth-20 empty root is `zero[20]`. This rule is consumed by off-circuit
tree construction; a withdrawal still supplies all 20 siblings explicitly.

## Consensus boundary

Circom inputs are field elements by construction, but their external wire
encoding still needs consensus rules. V1 uses unsigned 32-byte little-endian
integers and requires every public input to be strictly less than the BN254
scalar modulus. Proof coordinates use the same byte order and must be strictly
less than the BN254 base-field modulus. Decoders must reject, rather than
reduce, non-canonical values.

The circuit alone cannot establish that a root or action is authoritative. The
future V1 pool script must derive `poolDomain`, `assetDomain`, `denomination`,
`value`, `root`, `recipientDomain`, and `actionHash` from canonical live
transaction and pool state, then compare all nine signals in the frozen order.
It must also enforce the nullifier and vault state transitions. Until that
contract and new proving artifacts exist, this source is not a withdrawal
deployment.

## Reproducible checks

Prerequisites are Circom `2.2.3`, Node.js, and the dependencies in
`circuits/package.json`. The test rejects any other Circom version. Install the
compiler from the official repository at the commit behind tag `v2.2.3`:

```text
cargo install --git https://github.com/iden3/circom.git --rev ad44e915a12bb047b05745c2884aad9cc8326bc6 --locked circom
circom --version
```

The version output must be exactly `circom compiler 2.2.3`.

From the repository root:

```text
pnpm install --frozen-lockfile
pnpm --filter circuits test
```

The test compiles into an operating-system temporary directory, recomputes the
committed Poseidon vector independently with `circomlibjs`, checks the R1CS
witness, verifies the public wire order, and confirms that changing any one of
the nine public signals or using a non-boolean path index makes the witness
invalid. It does not create a Groth16 setup or claim proof-system security.

## Local Groth16 Measurement

`benchmark/measure-groth16.mjs` measures a proof using explicit caller-supplied
WASM, zkey, and verification-key paths. It does not generate, download, or
endorse setup material. The 2026-09-04 disposable Windows x64 run used the
19,220-constraint circuit, generated and verified one proof in 1,430.74 ms and
15.70 ms respectively, and reported 637,692 KiB process max RSS. The 256-byte
Arkworks proof ABI is distinct from the 722-byte JSON representation observed
in that run. The insecure benchmark setup was deleted; CKB-VM cycles and other
proof systems remain unmeasured.
