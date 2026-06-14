# Project Progress Summary: May 2026 (Week 3)
**Project:** CKB Privacy Mixer

### Overview
This week focused on correcting the gap between the product surface and the actual protocol state. Earlier UI and backend flows still relied on preview-era assumptions for deposits, while withdrawals were already partially live. The work this week hardened the runtime so fake preview notes are rejected, aligned the app with the current **Pudge** testnet naming, stabilized the backend environment loading, and began the first real implementation steps for a genuine on-chain CT deposit pipeline.

### Key Milestones Achieved

#### 1. Frontend Runtime & UX Hardening
*   **App Build Recovery:** Reworked the frontend app shell so `frontend/src/App.tsx` builds cleanly again after the preview-deposit removal.
*   **Pudge Testnet Labeling:** Updated user-facing network naming from `Aggron` to `Pudge` in the frontend UI and withdrawal messages.
*   **Honest Deposit Status:** Removed the broken silent deposit behavior. The deposit button now responds, but the UI explicitly communicates that the real CKB CT deposit path is not finished yet rather than fabricating notes.
*   **Live-Only Withdrawal Validation:** The frontend withdrawal prep now explicitly rejects old preview/mock notes (`0xpreview_*`, `0x_mock_*`, `runtimeMode=preview`) so users are not misled into thinking those artifacts are usable on-chain.

#### 2. Backend Environment & Service Stabilization
*   **Unified Env Loading:** Added `backend/src/env.ts` and imported it from standalone backend entry points so coordinator/relayer services consistently load both repo-level `.env` and backend-specific `.env`.
*   **Backend Build Recovery:** Fixed backend TypeScript build issues and normalized the relayer integration path so the backend compiles reliably again.
*   **Relayer Contract Update:** Reworked the relayer API shape to accept a prepared live withdrawal transaction instead of the old preview-style proof-only payload.

#### 3. Deposit Pipeline De-Mocking
*   **Preview Deposit Removal in SDK:** Disabled the SDK’s old `joinMix()` preview session fabrication path. The SDK now fails fast instead of inventing mock sessions, commitments, signatures, or tx hashes.
*   **Frontend/SDK Boundary Cleanup:** Moved the repo away from treating preview note generation as if it were a valid production deposit flow.
*   **Note Safety:** Existing preview notes can still be opened as files, but they are now correctly blocked from live withdrawal preparation.

#### 4. Real On-Chain CT Deposit Groundwork
*   **Rust Mint Proof Helper:** Added `tools/ct-mint-helper`, a real host-side Rust helper that generates:
    - Pedersen commitments
    - zero/non-zero blinding factors
    - Bulletproof range proofs
*   **Backend Deposit Scaffolding:** Added new backend deposit modules under `backend/src/deposit/`:
    - `lumos.ts`
    - `obscell.ts`
    - `bootstrap-ct-info.ts`
    - `mint-ct.ts`
*   **Host vs Contract Toolchain Separation:** Corrected the Cargo configuration so host-side Rust tools can compile normally while CKB contract builds still retain the explicit `build-std` path.

### What Was Verified
*   `pnpm --filter frontend build`
*   `pnpm --filter mixer-sdk build`
*   `pnpm --filter ckb-mixer-backend build`
*   `cargo build -p ct-mint-helper`

### Current Status
The repo is now much more honest and technically stable than before:
*   live withdrawal infrastructure is substantially closer to real execution
*   fake preview deposit paths are no longer treated as valid production behavior
*   real CT deposit prerequisites are now being implemented instead of deferred

However, the **full real deposit pipeline is still not complete**.

### Confirmed Remaining Blocker
When attempting the live `ct-info` bootstrap step on-chain, the transaction fails with `ct-info-type` error code `15` (`InvalidTypeId`). This means the current bootstrap transaction shape or script-args construction does not yet match the deployed `ct-info-type` contract’s expected genesis format.

### Exact Next Steps
1. Fix `backend/src/deposit/bootstrap-ct-info.ts` and `backend/src/deposit/obscell.ts` so `ct-info` genesis matches the deployed contract’s expected args/state transition shape.
2. Successfully bootstrap a live `ct-info` state cell on Pudge.
3. Make `backend/src/deposit/mint-ct.ts` succeed against the deployed Obscell contracts.
4. Generate a real note from the actual minted CT output.
5. Wire the frontend deposit button to that real deposit path.
