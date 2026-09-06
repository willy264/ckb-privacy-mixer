# Deployment Guide

## Current State

There is no corrected-V1 deployment. Existing environment variables and deployment scripts refer to legacy prototype contracts. Do not combine them with V1 manifests or describe them as V1.

## V1 Manifest

A deployment is valid only with a checked-in sanitized manifest containing:

- schema/protocol version and git commit;
- network name and genesis hash;
- PoolState, state lock, Vault lock, staging/refund lock, CT, and verifier code hashes;
- code-cell and Type-ID outpoints, hash types, and dep types;
- pool ID, asset script, denomination, tree depth, root-history policy, and refund policy;
- genesis PoolState/Vault outpoints and exact decoded state;
- circuit source/R1CS/WASM/ZKey/verifying-key SHA-256 hashes;
- compiler, Rust toolchain, Cargo lock, Node, PNPM, Circom, snarkjs, and CCC versions;
- deployment transaction hashes only after independent chain verification.

Private keys, passwords, API credentials, note secrets, or funded-wallet configuration must never appear in the manifest.

## Required Sequence

1. Build all binaries and circuit artifacts from a clean checkout with pinned tools.
2. Run cross-language, contract, SDK, service, frontend, and adversarial tests.
3. Compare release hashes with a second clean build.
4. Deploy code cells with a dedicated testnet deployment signer.
5. Create fresh V1 Type-IDs and zero-state PoolState/Vault; never reuse legacy state.
6. Decode every created cell and verify code/type/lock/data/capacity against the candidate manifest.
7. Run the Pudge acceptance procedure before marking the manifest validated.
8. Publish only sanitized config and explorer links.

## Environment Policy

The application supplies its CCC client. V1 network/deployment settings come from an explicit manifest object, not hidden SDK environment reads. User signers are operation-scoped. Coordinator has no owner, relayer, or user private key. Relayer holds only a limited hot key for untyped CKB fees. Issuance/deployment authority is offline or isolated and never participates in normal deposits.

## Rollback

V1 scripts are immutable. A flawed version is abandoned under a new version/identity; protocol state is not silently reinterpreted. Testnet users must use the documented refund/emergency procedure supported by that version. A new deployment cannot import old roots/nullifiers unless a separately reviewed migration protocol explicitly proves equivalence; no such V1 migration exists.
