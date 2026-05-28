# CKB Privacy Mixer

A privacy-mixer prototype for the Nervos CKB testnet built around three layers:

1. `contracts/`: Rust CKB contracts for the pool, nullifier registry, and Groth16 verifier.
2. `mixer-sdk/`: the canonical TypeScript protocol/runtime layer.
3. `frontend/`: the only supported web UI.

The repo now treats the root `src/` Vite app as legacy and unsupported. New product work should happen in `frontend/` and `mixer-sdk/`.

## Current Product Boundary

- Supported denomination: `100 CT`
- Deposit path: backend-driven live CT minting on Pudge with coordinator-backed deposit pool/session state
- Withdrawal path: browser-side Groth16 proof generation plus live transaction assembly
- Live withdrawal authority: permissionless direct registry updates by default, with relayer/coordinator submission available as optional UX

## Tooling

- Rust contracts require nightly Cargo because the workspace uses `panic-immediate-abort`.
- Web work runs through the PNPM workspace:
  - `pnpm build`
  - `pnpm dev`
- Contract tests run with:
  - `cargo test --locked -p tests -j 1`

## Runtime Config

Copy `.env.example` to `.env` and fill the deployment pointers. The frontend will treat runtime as:

- `live` when the nullifier registry is configured
- `disabled` when the required contract references are missing

Important env values:

- `MIXER_RUNTIME_MODE=live|disabled`
- `MIXER_WITHDRAWAL_AUTHORITY=direct|operator-registry-lock|self-custodied|coordinator`
- `NULLIFIER_REGISTRY_*` for live withdrawal preparation/broadcast
- `DEPOSIT_POOL_TARGET_PARTICIPANTS` for coordinator-backed deposit pool sizing

## Notes

- The repo already contains Groth16 artifacts under `circuits/`.
- The active deposit flow is a real live CT mint path, but it is still not a fully shared multi-party on-chain deposit settlement transaction.
