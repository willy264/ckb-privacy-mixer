# Cross-Language Test Vectors

## Purpose

Consensus-critical values must be computed identically by Circom, Rust/CKB scripts, and TypeScript. A vector is accepted only when it records its schema version, input representation, byte order, exact output, and consuming tests. Copying one implementation's output without an independent recomputation is not cross-language validation.

## Canonical Rules

- SDK numeric display: lowercase `0x` plus exactly 64 big-endian hex digits for Fr/Fq.
- Contract/proof ABI: exactly 32 little-endian bytes.
- Molecule integers: fixed-width little-endian.
- JSON-RPC quantities/outpoint indices: canonical minimal hexadecimal (`0x0`, never `0x00`).
- Proof order: G1 A(x,y), G2 B(x.c1,x.c0,y.c1,y.c0) according to the pinned ABI, then G1 C(x,y); every coordinate is canonical Fq.
- Public signal order: pool, asset, denomination, value, root, nullifier, recipient, action, auth.

## Required Vector Sets

| Set | Inputs and expected outputs | Languages required |
|---|---|---|
| Field/Fq | zero, one, modulus minus one; reject modulus, modulus plus one, short/long/mixed-case | Rust, TypeScript |
| Domain tags | exact ASCII label, integer, BE display, LE ABI bytes | Circom, Rust, TypeScript |
| Script domains | canonical Molecule Script bytes, chunks, recurrence states, result; one-byte mutations | Rust, TypeScript |
| Leaf | pool/asset/denomination/secrets -> commitment | Circom, Rust, TypeScript |
| Nullifier | pool/nullifier secret/index -> nullifier hash | Circom, Rust, TypeScript |
| Auth | secret/recipient/action -> auth tag | Circom, Rust, TypeScript |
| Merkle | empty values, leaves, per-level nodes, frontier, path bits, root | Circom, Rust, TypeScript |
| Action/output | every protected transaction field -> output domain/action hash | Rust, TypeScript |
| State | PoolState/Staging Molecule values -> bytes and decoded object | Rust, TypeScript |
| Proof ABI | nine Fr values and proof points -> exact witness bytes | Rust, TypeScript |

## Current Fixtures

- `circuits/v1/test-vectors/withdrawal.json`: source-level withdrawal relation and public-order vector.
- `mixer-sdk/test-vectors/script-domains.json`: canonical CCC Script bytes, domain sponge recurrence, mutations, and trailing-zero separation.
- `mixer-sdk/test-vectors/withdrawal-action.json`: protected action tree, exact output-capacity/index binding, and mutation field list.
- `mixer-sdk/test-vectors/withdrawal-intent-wire.json`: exact SDK-to-relayer JSON representation, consumed by both SDK and backend tests. Its repeated proof bytes are a format fixture, not a valid or generated Groth16 proof.
- `mixer-sdk/test/`: TypeScript consumers for the circuit, script-domain, and action fixtures.
- `tests/src/v1_circuit_vectors.rs`: independent Rust validation of domain-tag bytes, field canonicality, signal order, and the 288-byte public ABI.
- Legacy `circuits/public.json` and `circuits/proof.json`: legacy three-input proof fixtures only; they are prohibited as V1 vectors.

These fixtures are useful frozen test inputs, but they do not yet satisfy the complete cross-language matrix above. In particular, Rust does not independently recompute every Poseidon leaf/nullifier/auth/Merkle/action/script-domain value or a corrected proof. Not every fixture has a deterministic checked-in generator, source hash, and tool-version record.

## Mutation Matrix

Every valid withdrawal vector must be cloned with exactly one changed field: root, pool, asset, denomination, value, nullifier, recipient, action, auth, state sequence, Vault input/output, recipient CT data/index/capacity, proof coordinate, and proof length. Tests must show where it fails: parser, circuit, plan validation, or CKB script. A test that fails for an unrelated malformed transaction does not prove the targeted invariant.

## Deployment Gate: Generation And Review

Before deployment, vector generation scripts must be deterministic and checked in. Generated JSON must include tool versions and source hashes, and CI must regenerate into a temporary directory and diff checked-in files. A reviewer must also verify at least one vector independently rather than trusting a generator and consumer from the same module. That complete regeneration/review workflow is not implemented or claimed by the current foundation.
