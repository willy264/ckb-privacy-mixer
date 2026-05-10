# CKB Privacy Mixer

A privacy-mixer prototype for the Nervos CKB testnet built around three layers:

1. `contracts/`: Rust CKB contracts for the pool, nullifier registry, and Groth16 verifier.
2. `mixer-sdk/`: the canonical TypeScript protocol/runtime layer.
3. `frontend/`: the only supported web UI.

The repo now treats the root `src/` Vite app as legacy and unsupported. New product work should happen in `frontend/` and `mixer-sdk/`.

## Current Product Boundary

- Supported denomination: `100 CT`
- Deposit path: canonical note preparation and preview/demo session coordination
- Withdrawal path: browser-side Groth16 proof generation plus preview/live transaction assembly
- Live withdrawal authority: by default the nullifier registry is operator-controlled, so the connected JoyID wallet must own that registry lock for browser-side broadcast

## Tooling

- Rust contracts require nightly Cargo because the workspace uses `panic-immediate-abort`.
- Web work runs through the PNPM workspace:
  - `pnpm build`
  - `pnpm dev`
- Contract tests run with:
  - `cargo test --locked -p tests -j 1`

## Runtime Config

Copy `.env.example` to `.env` and fill the deployment pointers. The frontend will treat runtime as:

- `preview` when contracts are configured but live registry pointers are incomplete
- `live` when the nullifier registry is configured
- `disabled` when the required contract references are missing

Important env values:

- `MIXER_RUNTIME_MODE=preview|live|disabled`
- `MIXER_WITHDRAWAL_AUTHORITY=operator-registry-lock|self-custodied|coordinator`
- `NULLIFIER_REGISTRY_*` for live withdrawal preview/broadcast

## Notes

- The repo already contains Groth16 artifacts under `circuits/`.
- A true Aggron end-to-end deposit coordinator and real CT input sourcing are still separate work; the current deposit flow is a structured preview/demo path rather than a full on-chain multi-party coordinator.
