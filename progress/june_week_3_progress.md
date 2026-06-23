# CKB Privacy Mixer - June Week 3 Progress Report

**Period:** June 17 - June 23, 2026  
**Focus:** Testing fixes, CI stabilization, and MVP demo preparation.

---

## Overview

This week focused on stabilizing the project for an MVP demo and review. The main work came from testing the full deposit and withdrawal flow, fixing build and CI issues, and syncing the Groth16 circuit fixtures with the current verifier contract. The goal was to make the current MVP reliable enough to share with reviewers while clearly identifying the remaining areas that need feedback, especially withdrawal UX and deposit note security.

---

## Key Accomplishments

### 1. Frontend Deployment Lockfile Fix

**Problem:** Vercel failed during dependency installation because `pnpm-lock.yaml` was not in sync with the root `package.json`.

**Cause:** The root package added `@ckb-ccc/core`, but the lockfile had not been regenerated. Since CI uses a frozen lockfile by default, the deployment failed before the frontend could build.

**Solution:** Regenerated the lockfile and verified that installation works with frozen lockfile mode.

**Verification:**

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm --filter frontend build
```

---

### 2. Restored Groth16 Verification Key Generation Script

**Problem:** The GitHub workflow failed during the "Regenerate Groth16 verification key" step because it tried to run a missing script:

```bash
pnpm --filter ckb-mixer-backend exec tsx ../scripts/generate-vk-rs.ts
```

**Cause:** The workflow expected a root-level `scripts/generate-vk-rs.ts`, but the file was not present.

**Solution:** Added the missing root script so CI can regenerate `contracts/zk-membership-type/src/vk.rs` from `circuits/verification_key.json`.

**Verification:**

```bash
pnpm --filter ckb-mixer-backend exec tsx ../scripts/generate-vk-rs.ts
pnpm --filter ckb-mixer-backend build
```

---

### 3. Synced Groth16 Fixtures With the Current Circuit

**Problem:** Contract tests were failing after the RISC-V contract build step. The build itself succeeded, but the test suite failed in the ZK membership and withdrawal integration tests.

**Failing areas:**

- `zk_membership_tests::test_zk_membership_valid_groth16_fixture`
- `zk_membership_tests::test_zk_membership_wrong_public_input_order_fails`
- `withdrawal_integration_tests::test_live_withdrawal_transaction_succeeds`
- `withdrawal_integration_tests::test_live_withdrawal_replay_fails`
- `withdrawal_integration_tests::test_live_withdrawal_invalid_membership_fails`

**Cause:** The current mixer circuit exposes 3 public inputs:

- Merkle root
- Nullifier hash
- Recipient hash

However, the old test fixture still used only 2 public inputs. Because of this, the verifier contract rejected the output data with `InvalidProofData` before it could reach the intended Groth16 verification checks.

**Solution:** Regenerated the Groth16 proof and public input fixtures against the current circuit, then updated the Rust test helpers to serialize all 3 public inputs instead of only 2.

**Files updated:**

| File | Change |
|---|---|
| `circuits/public.json` | Regenerated with root, nullifier hash, and recipient |
| `circuits/proof.json` | Regenerated against the current circuit artifacts |
| `tests/src/zk_membership_tests.rs` | Updated fixture serialization from 2 public inputs to 3 |
| `tests/src/withdrawal_integration_tests.rs` | Updated withdrawal fixture serialization from 2 public inputs to 3 |

---

### 4. Contract Test Suite Stabilized

After syncing the fixtures and test helpers, the full contract test suite passed.

**Command:**

```bash
cargo test --locked -p tests -j 1
```

**Result:**

```text
21 passed; 0 failed
```

This confirms that the pool, nullifier registry, ZK membership verifier, and withdrawal integration tests are now passing locally.

---

## Current MVP Capabilities

The MVP is now in a better state for demo and review. The current flow supports:

- JoyID wallet connection
- 4-participant pooled deposit flow
- Client-side note generation
- Password-protected note flow before deposit
- Local Groth16 withdrawal proof generation
- Relayer-assisted private withdrawal
- Nullifier tracking to prevent replay and double withdrawal
- Contract tests for pool, nullifier, withdrawal, and ZK membership verification

---

## Main Review Focus

The main area for external feedback is still the withdrawal UX and note security.

The deposit note contains the private secrets needed to withdraw. Because of that, the MVP avoids saving the note in localStorage and makes the user responsible for saving it securely. The current approach is more non-custodial, but it also creates a UX risk: if the user loses the note or password, they cannot withdraw.

Feedback is needed on:

- Whether the current note handling UX is acceptable for a privacy-focused MVP
- Whether there are better non-custodial ways to help users protect or recover their note
- Whether password-encrypted note handling should be improved before moving beyond MVP
- Whether the relayer withdrawal flow is clear and safe enough for reviewers to test
- Whether there are security concerns in the current public input and proof flow

---

## Files Modified This Week

| File | Change |
|---|---|
| `pnpm-lock.yaml` | Synced dependency lockfile for CI and Vercel |
| `scripts/generate-vk-rs.ts` | Added missing verification key generation script |
| `contracts/zk-membership-type/src/vk.rs` | Regenerated verification key output |
| `circuits/public.json` | Updated public signals fixture to match 3-input circuit |
| `circuits/proof.json` | Regenerated Groth16 proof fixture |
| `tests/src/zk_membership_tests.rs` | Updated ZK membership test helper for 3 public inputs |
| `tests/src/withdrawal_integration_tests.rs` | Updated withdrawal integration test helper for 3 public inputs |

---

## Next Steps

1. Share the MVP with reviewers and the CKBuilders community.
2. Demo the deposit-to-withdrawal flow on testnet.
3. Gather feedback on note handling, password encryption, and withdrawal UX.
4. Continue hardening the ZK verifier and relayer flow before treating the app as production-ready.
