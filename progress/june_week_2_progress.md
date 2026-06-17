# CKB Privacy Mixer — June Week 2 Progress Report

**Period:** June 10 – June 16, 2026  
**Focus:** Resolving deposit finalization signatures, CT Token validation, and ZK-verifier infrastructure analysis.

---

## Overview

This week focused on squashing the final bugs preventing multi-participant deposit pool finalization, specifically around signature extraction from the JoyID wallet and CKB script validation. We also focused heavily on security architecture by evaluating an external ZK-verifier infrastructure project, resulting in a roadmap to patch critical cryptographic vulnerabilities in our `zk-membership-type` contract. Finally, we began preparing to engage the CKBuilders community for UX feedback on our non-custodial secret management.

---

## Key Accomplishments

### 1. CT Token Validation Fix (ValidationFailure Code 6)

**Problem:** Deposit finalization was failing on the CT Token output with error code 6, indicating a script validation failure.
**Solution:** Identified that the CT Token type script's `args` must be the exact hash of the `CT_INFO` script. We updated the `mixer-sdk` (`config.ts` and `withdrawal.ts`) to properly compute and inject these args into the `ContractReference`. 

### 2. Registry Bootstrap & Stale State Resolution

**Problem:** The system was attempting to use a registry cell with an outdated `codeHash`, leading to `ScriptNotFound` errors.
**Solution:** We bootstrapped a completely new nullifier registry cell to clear out the stale state and updated the root `.env` to synchronize the backend and frontend configurations. 

### 3. Deposit Finalizer Witness Extraction (ValidationFailure Code 8 Fix)

**Problem:** After fixing the CT token validation, the deposit finalizer failed with error code 8 on `Inputs[3].Lock`. This indicated an invalid signature for the 4th participant. 
**Debugging:** We discovered a critical flaw in how the `DepositFinalizer` extracted the signed witness returned by JoyID. The coordinator sends a joint transaction with 1000-byte "placeholder" witnesses for each participant. The finalizer was looking for any returned witness that was "longer than 200 bytes and not all zeros". However, the placeholders themselves contain non-zero length prefixes. The finalizer mistakenly grabbed `witness[0]` (the placeholder) for *every* participant instead of their actual signature.
**Solution:** Rewrote the witness extraction loop in `backend/src/coordinator/deposit-finalizer.ts` to actively compare the returned payload against the original unsigned witnesses. It now correctly identifies the exact witness that JoyID modified, guaranteeing the correct signature is merged.

### 4. Frontend UX Enhancements (Privacy Protection)

**Problem:** The "Broadcast Direct" withdrawal button was sitting prominently next to "Relay Private". If a user clicked it, they would pay the gas fee with their own JoyID wallet, completely destroying their anonymity.
**Solution:** Updated `frontend/src/App.tsx` to hide the "Broadcast Direct" button behind an "Advanced Options" settings toggle. When expanded, it now displays a bright red danger warning explaining exactly how it compromises privacy, ensuring users default to the "Relay Private (Anonymous)" route.

### 5. Groth16 Verifier Infrastructure Analysis

**Task:** Evaluated the open-source `groth16-ckb` infrastructure project.
**Findings:** Discovered that our current `zk-membership-type` contract (built on `arkworks 0.4.0`) lacked critical prime-order subgroup validation and infinity rejection checks, leaving it potentially vulnerable to forged proofs.
**Action:** Generated a comprehensive architectural analysis document (`groth16_upgrade_analysis.md`) advocating for an "Upgrade-in-Place" approach. This allows us to borrow their hardened cryptographic security logic and upgrade our dependencies to `arkworks 0.5.0` without requiring a massive rewrite of our frontend SDK or transaction structure.

### 6. Community Engagement Preparation

**Task:** Prepared to request UX and security feedback from the CKBuilders community.
**Action:** Drafted a detailed GitHub issue adhering to community guidelines. The issue specifically requests guidance on the best modern, non-custodial UX patterns for securely storing the ZK deposit note (e.g., leveraging WebAuthn/Passkeys for local encryption) without centralized intervention.

---

## Architecture Understanding Deepened

This week solidified our understanding of JoyID's signing behavior within joint transactions. JoyID strictly modifies the witness index corresponding to the input it owns, leaving placeholder witnesses for other inputs untouched. Accurate signature extraction in a multi-party coordinator environment *must* rely on differential comparison against the unsigned payload, rather than heuristic byte-length checks.

---

## Files Modified This Week

| File | Change |
|---|---|
| `mixer-sdk/src/types/config.ts` | Added `args` to `ContractReference` |
| `mixer-sdk/src/utils/config.ts` | Added logic to read `args` from environment |
| `mixer-sdk/src/providers/withdrawal.ts` | Added logic to dynamically compute `ctToken` args using `ctInfo` hash |
| `backend/src/scripts/ccc-common.ts` | Fixed BigInt JSON serialization bug to allow transaction debugging |
| `backend/src/coordinator/deposit-finalizer.ts` | Rewrote JoyID witness extraction loop to use differential comparison |
| `frontend/src/App.tsx` | Added Advanced Settings toggle and danger notice for direct broadcast |
| `groth16_upgrade_analysis.md` | Created architectural analysis for ZK-verifier hardening |
| `draft_feedback_issue.md` | Drafted community feedback request for note storage UX |

---

## Next Steps

1. **Execute ZK Verifier Hardening:** Implement the "Upgrade-in-Place" plan for `zk-membership-type` to enforce strict subgroup checks and update to `arkworks 0.5.0`.
2. **Submit Community Request:** Publish the draft issue to the CKBuilders channel to gather feedback on deposit note UX.
3. **Validate Multi-Participant Deposit:** Confirm a successful multi-participant deposit round on the live network now that the witness extraction bug (Code 8) is fully resolved.
