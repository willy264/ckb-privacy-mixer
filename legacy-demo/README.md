# Legacy Demo

This label covers the original Obscell mixer/prototype. It is preserved as historical and research evidence; it is not corrected protocol V1.

The implementation remains in its original locations so existing work and history are not erased:

- `frontend/src/legacy/LegacyMixerApp.tsx` and the `?view=legacy` route
- legacy components and hooks under `frontend/src/components/` and `frontend/src/hooks/`
- `mixer-sdk/src/operations/`, `mixer-sdk/src/providers/`, and legacy utility exports
- `backend/src/coordinator/`, `backend/src/deposit/`, and `backend/src/relayer/`
- `contracts/mixer-pool-type`, `contracts/nullifier-type`, and `contracts/zk-membership-type`
- the original `circuits/mixer.circom` and its existing proving artifacts

## Boundary

The legacy path demonstrates useful techniques: Poseidon initialization, depth-20 Merkle paths, browser Groth16 proving, Arkworks proof packing, encrypted note recovery, CCC transaction construction, address parsing, capacity handling, and operation progress UI.

It does **not** establish the corrected-V1 guarantees. Its coordinator-held commitment set is not an authoritative on-chain root; its flat nullifier registry and proof-receipt construction do not atomically bind PoolState, Vault, asset, value, recipient, state sequence, and CT conservation.

Legacy roots, nullifiers, deployments, registry contents, and authority assumptions must never be imported into corrected V1. Corrected V1 uses new versioned identities and starts from a fresh genesis state.

Tracked legacy artifact hashes and reproducibility limits are recorded in [ARTIFACTS.md](ARTIFACTS.md).
