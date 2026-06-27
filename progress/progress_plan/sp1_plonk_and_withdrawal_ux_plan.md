# SP1/PLONK Research and Withdrawal UX Improvement Plan

**Date:** June 24, 2026  
**Status:** Planned  
**Scope:** Post-MVP improvement plan for proof-system architecture and non-custodial withdrawal-note UX.

---

## Context

During the MVP review request, a reviewer pointed out that Groth16 requires a circuit-specific trusted setup and suggested evaluating SP1/PLONK, especially the optimized SP1 verifier for CKB-VM.

This feedback is useful, but it addresses the proof-system layer rather than the full withdrawal-note UX problem. The project now needs two related work tracks:

1. **Proof-system improvement:** Research whether SP1/PLONK is a better long-term replacement for the current Groth16 verifier.
2. **Withdrawal-note UX improvement:** Improve how users save, protect, recover, and use encrypted notes without exposing plaintext secrets to a backend, relayer, or remote prover.

---

## Goals

- Keep the current Groth16 implementation stable for MVP review.
- Evaluate SP1/PLONK as a future replacement for the circuit-specific Groth16 setup.
- Confirm whether SP1 proving can be done privately enough for mixer withdrawals.
- Improve the withdrawal-note UX without introducing custodial storage.
- Reduce the chance that users lose access to funds because they lost the note or password.
- Keep plaintext `secret` and `nullifierSecret` fully client-side.

---

## Non-Goals

- Do not replace Groth16 immediately before MVP review.
- Do not send plaintext notes, secrets, nullifiers, or witnesses to the backend.
- Do not store withdrawal notes in localStorage by default.
- Do not make the relayer responsible for note recovery.
- Do not claim production security until the verifier and note flows are audited.

---

## Track 1: SP1/PLONK Research

### Why This Matters

The current Groth16 verifier depends on a circuit-specific trusted setup. This means that meaningful circuit changes require regenerated proving and verification artifacts. SP1/PLONK may improve the long-term trust model and make future verifier upgrades easier.

### Tasks

1. **Study the optimized SP1 verifier for CKB-VM**
   - Review the Nervos forum post and linked repository.
   - Confirm supported SP1 version.
   - Confirm verifier cycle cost on CKB-VM.
   - Confirm proof format and verification input format.

2. **Compare Groth16 vs SP1/PLONK for this mixer**
   - Compare trusted setup requirements.
   - Compare proof size.
   - Compare on-chain verifier cycles.
   - Compare prover runtime and memory requirements.
   - Compare browser/local proving feasibility.
   - Compare complexity of integrating with the current CKB transaction structure.

3. **Evaluate private proving feasibility**
   - Determine whether the user can generate SP1 proofs locally.
   - Determine whether browser proving is realistic.
   - Determine whether native desktop/mobile proving would be required.
   - Determine whether remote proving can be used without exposing witness secrets.
   - Identify whether witness encryption, client-side proving, or a trusted execution setup would be required.

4. **Map the current circuit logic into SP1**
   - Represent membership verification logic in Rust.
   - Model inputs:
     - Merkle root
     - Nullifier hash
     - Recipient hash
     - Private secret
     - Private nullifier secret
     - Merkle path elements
     - Merkle path indices
   - Confirm that the public output matches the current withdrawal public inputs.

5. **Build a proof-of-concept only after research**
   - Create a minimal SP1 program for membership verification.
   - Generate a test proof.
   - Verify the proof using the CKB-VM optimized verifier.
   - Compare results against the current Groth16 test fixture.

### Acceptance Criteria

- A written comparison exists for Groth16 vs SP1/PLONK.
- The team knows whether SP1 proving can remain private for users.
- A migration recommendation is documented:
  - stay on Groth16 for now,
  - migrate to SP1/PLONK,
  - or keep Groth16 while hardening the verifier first.
- No implementation migration starts until proving privacy is understood.

---

## Track 2: Withdrawal Note UX and Security Improvement

### Why This Matters

The withdrawal note contains the private data needed to withdraw funds. If the user loses the note or password, the frontend cannot reconstruct the proof and the funds may become inaccessible. If plaintext note data leaks, someone else may be able to withdraw.

The MVP already avoids backend note custody and localStorage note persistence. The next step is to make the self-custody UX clearer and safer.

### Tasks

1. **Improve note-save confirmation**
   - Require the user to confirm they saved the encrypted note before deposit submission.
   - Add a lightweight verification step, such as asking the user to paste the encrypted note back before continuing.
   - Make it clear that the app cannot recover the note or password.

2. **Improve password guidance**
   - Show password strength feedback.
   - Warn against reused or weak passwords.
   - Explain that losing the password means losing access to the encrypted note.
   - Keep guidance short and action-focused.

3. **Add optional encrypted note backup export**
   - Let users copy the encrypted note.
   - Let users download the encrypted note only as an optional action.
   - Consider a QR export option for offline backup.
   - Keep plaintext note data out of downloads and storage.

4. **Improve interrupted-deposit recovery**
   - Preserve the current pending recovery note pattern.
   - Make the difference between a pending recovery note and finalized withdrawal note clearer.
   - Add status labels:
     - Pending deposit note
     - Finalized withdrawal note
     - Imported encrypted note
   - Explain when each note can be used.

5. **Research wallet/passkey-based encryption**
   - Evaluate whether JoyID, WebAuthn, or passkeys can encrypt/decrypt the note locally.
   - Confirm whether signing APIs expose stable key material or only signatures.
   - Avoid designs where the backend can trigger note decryption.
   - Avoid designs that depend on a signature format that may change.

6. **Evaluate optional user-controlled backup**
   - Research encrypted backup options where only ciphertext leaves the device.
   - Consider user-controlled cloud storage as an optional feature.
   - Require clear warnings that the app cannot recover lost passwords.
   - Avoid any centralized plaintext note recovery path.

7. **Improve withdraw import flow**
   - Validate note structure before password attempt.
   - Show clearer errors for:
     - invalid note text,
     - wrong password,
     - pending note that is not finalized,
     - note secrets that do not match commitment,
     - note already withdrawn.
   - Keep proof generation local.

### Acceptance Criteria

- Users must explicitly confirm note backup before submitting a deposit.
- The UI clearly explains that encrypted note plus password are both required.
- Plaintext `secret` and `nullifierSecret` are never saved to localStorage or backend storage.
- The relayer only receives proof data required for withdrawal, not plaintext note secrets.
- Wrong-password and invalid-note errors are understandable.
- Pending and finalized note states are visually distinct.

---

## Security Questions To Answer

- Can SP1 proofs be generated locally without requiring unrealistic user hardware?
- If remote proving is needed, how can witness secrecy be preserved?
- Is password-only note encryption enough for MVP users?
- Should passkeys be used for local encryption, or only as an optional convenience?
- Can encrypted cloud backup be offered without creating false recovery expectations?
- What exact data does the relayer receive during withdrawal?
- Can the recipient binding prevent withdrawal front-running in both Groth16 and SP1 versions?

---

## Proposed Order of Work

1. Finish MVP review using the current Groth16 implementation.
2. Document Groth16's circuit-specific trusted setup as an MVP limitation.
3. Improve note-save confirmation and password guidance.
4. Improve note import and error handling in the withdrawal flow.
5. Research SP1/PLONK feasibility and private proving constraints.
6. Decide whether to build an SP1 proof-of-concept.
7. If SP1 is feasible, plan a separate migration milestone.

---

## Review Message Summary

The response to reviewers should separate the two concerns clearly:

- SP1/PLONK may improve the long-term proof-system trust model by avoiding Groth16's circuit-specific trusted setup.
- It does not automatically solve note storage, note recovery, or witness secrecy.
- The project will keep Groth16 for MVP review while researching SP1/PLONK and improving the withdrawal-note UX.

---

## Expected Benefit

This plan improves the project in two ways:

1. **Better cryptographic roadmap:** The project can move toward a proof system with a stronger long-term setup story and better CKB-VM alignment.
2. **Safer user experience:** Users get clearer note backup, password, import, and recovery flows without giving custody of their secrets to the app backend or relayer.
