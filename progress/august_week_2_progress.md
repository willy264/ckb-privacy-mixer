# Obscell Privacy Mixer - August Week 2 Progress Report

**Period:** August 8-14, 2026
**Focus:** Completing and rehearsing the existing `100 CT` Pudge deposit-to-withdrawal demo.
**Status:** Demo implementation and validation in progress. Public SDK extraction remains paused.

---

## Overview

The Obscell demo did not start from an empty repository this week. The project already contains a working prototype spread across the frontend, mixer SDK, backend coordinator and relayer, Circom circuit, CKB contracts, and CT helper tools.

The Week 2 work was to turn those existing pieces into one controlled and repeatable demo path:

```text
four JoyID participants
        ->
four 100 CT prototype deposits
        ->
shared deposit round and signatures
        ->
finalized encrypted notes
        ->
browser Groth16 proof
        ->
direct and relayed withdrawal tests
        ->
nullifier replay rejection
```

The protocol audit changed how this demo is described. The current flow can demonstrate the existing prototype mechanics, but it cannot yet be presented as a protocol-correct public privacy SDK. In particular, the current coordinator-generated Merkle set is not an authoritative on-chain pool root, and the current withdrawal scripts do not fully bind the deposited CT asset, value, recipient, proof, and nullifier into one enforced state transition.

For that reason, Week 2 is focused on finishing, testing, and documenting the current Pudge demo honestly. The larger protocol remediation and SDK extraction remain separate follow-up work.

---

## Demo Goal

The immediate goal is a repeatable live walkthrough in which:

1. Four controlled users connect with JoyID on Pudge.
2. Each browser generates its own `secret`, iiiiiiiiiiiiiiiiiiiu`nullifierSecret`, and Poseidon commitment.
3. Each user saves an encrypted pending note before submitting anything.
4. The current backend deposit service creates the `100 CT` staging input used by the prototype round.
5. The coordinator waits until four participants are registered.
6. Every participant signs the same shared finalization transaction.
7. The coordinator merges the witnesses, broadcasts the transaction, and returns a finalized note to each participant.
8. A participant imports and decrypts the note locally.
9. The browser reconstructs the current prototype Merkle proof and generates the Groth16 proof.
10. One note is exercised through the direct withdrawal path.
11. A second note is exercised through the relayer path.
12. Reusing a spent nullifier is rejected.

The demo is successful only when the transaction hashes, participant states, encrypted-note recovery, proof generation, withdrawal result, and replay rejection can all be shown from a clean start.

---

## Existing Implementation Baseline

The demo is being completed from the following code that already exists.

| Area | What is already implemented | Main files | Work still needed for the demo |
|---|---|---|---|
| Browser note creation | Random note secrets, Poseidon commitment, pending-note preparation | `frontend/src/utils/app-helpers.ts`, `mixer-sdk/src/utils/crypto.ts` | Rehearse four independent notes and confirm no secret reaches backend logs |
| Encrypted recovery note | PBKDF2-SHA256 and AES-GCM note encryption, JSON import/export, password-based recovery | `frontend/src/vault.ts`, `frontend/src/hooks/useDepositFlow.ts`, `frontend/src/hooks/useWithdrawalFlow.ts` | Test browser close/reload and recovery from the saved pending note |
| Live prototype deposit | Backend deposit service and CT mint helper path on Pudge | `backend/src/deposit/service.ts`, `backend/src/deposit/mint-ct.ts`, `tools/ct-mint-helper/` | Verify runtime configuration, owner wallet funding, and four clean staging outputs |
| Four-participant pool | Pool creation, participant registration, threshold tracking, Redis/file fallback state | `backend/src/coordinator/deposit-pool.ts`, `backend/src/coordinator/server.ts` | Run a full four-user round repeatedly and test coordinator restart behavior |
| Shared round signing | Unsigned finalization transaction, JoyID signing, signature submission, witness merge | `backend/src/coordinator/deposit-finalizer.ts`, `frontend/src/utils/deposit-flow.ts` | Confirm all four wallets sign the same transaction hash and final witness merge broadcasts |
| Finalized note recovery | Participant status polling, finalized note endpoint, recovery by commitment | `backend/src/coordinator/server.ts`, `backend/src/relayer/server.ts`, `frontend/src/relayer.ts` | Verify pending and finalized recovery after a browser restart |
| Merkle and Groth16 proof | Depth-20 Merkle helper, browser `snarkjs` proving, proof packing | `circuits/mixer.circom`, `circuits/mixer_js/`, `mixer-sdk/src/utils/merkle.ts`, `mixer-sdk/src/utils/proof.ts`, `mixer-sdk/src/utils/prover.ts` | Verify artifact URLs, proof generation time, public inputs, and local proof checks with a finalized live note |
| Direct withdrawal | Registry-state resolution, proof preparation, transaction assembly and broadcast | `mixer-sdk/src/operations/withdraw.ts`, `frontend/src/withdrawal.ts`, `frontend/src/hooks/useWithdrawalFlow.ts` | Retest against the currently deployed Pudge cells and record the accepted transaction |
| Relayed withdrawal | Relay request, Redis-backed 24-hour job status, relayer-funded submission path | `backend/src/relayer/server.ts`, `backend/src/relayer/relay.ts`, `frontend/src/relayer.ts` | Retest submission, polling, failure reporting, and independently verify the resulting transaction |
| Contract checks | Current pool, nullifier, and Groth16 verifier contracts with ckb-testtool coverage | `contracts/`, `tests/` | Run the current suite and capture the exact limitations exposed by the audit |

These components are implementation inputs for the demo. Their presence does not close the protocol-correctness findings.

---

## Demo Transaction Flow

### 1. Runtime and deployment preflight

Before opening the frontend, the demo operator prepares one verified runtime configuration for all processes.

The preflight covers:

- Pudge RPC URL and network identity.
- CT-info and CT-token deployment outpoints and script fields.
- stealth-lock deployment values used by the current finalizer.
- nullifier-registry deployment outpoint and authority mode.
- circuit WASM and ZKey URLs.
- coordinator and relayer base URLs.
- four funded JoyID accounts.
- funded backend deposit and relayer accounts.
- `DEPOSIT_POOL_TARGET_PARTICIPANTS=4` or the matching coordinator setting.

Completion evidence:

- `pnpm build` passes.
- `pnpm --filter ckb-mixer-backend build` passes.
- `pnpm test:contracts` passes for the current prototype contracts.
- coordinator and relayer health endpoints respond.
- every configured deployment cell resolves on Pudge.
- the frontend reports live mode instead of disabled runtime.

### 2. Prepare four private notes

Each participant opens a separate browser profile or device and connects a different JoyID account.

For every participant, the frontend:

1. Generates `secret` and `nullifierSecret` in the browser.
2. Derives the Poseidon commitment.
3. Builds the pending note with the intended `100 CT` denomination.
4. Encrypts it with the user's note password.
5. Requires the encrypted text to be saved before deposit submission.

Completion evidence:

- four distinct commitments are displayed or recorded by participant ID.
- four encrypted pending-note files are stored outside browser memory.
- server logs contain commitments and operation IDs only, never either private secret or the note password.

### 3. Create and register the four deposits

The current `/deposit` path asks the backend to create the live CT staging cell used by the prototype. The participant is then registered in the coordinator pool through `/deposit/prepare` and the participant registration endpoints.

The operator confirms for each participant:

- mint/deposit transaction hash,
- staging outpoint,
- participant ID,
- pool/session ID,
- denomination,
- status transition from `pending` to `minted` or `registered`.

The fourth accepted participant should move the pool to `ready`.

This step currently depends on the backend-controlled CT mint path. It demonstrates the existing deposit machinery; it is not yet the audited target flow where a user-owned CT cell enters an authoritative privacy pool.

### 4. Sign and finalize the shared round

Once the pool reaches four participants:

1. The frontend polls the pool until it becomes `ready`.
2. Each participant fetches `/deposit/pools/:poolId/unsigned-tx`.
3. The operator confirms that all four users received the same transaction hash and protocol cell ordering.
4. JoyID signs the transaction for each participant.
5. Each witness payload is submitted to `/deposit/pools/:poolId/sign`.
6. The coordinator merges all four witness groups.
7. The final transaction is broadcast to Pudge.
8. The pool moves to `complete`, and each participant moves to `finalized`.

Completion evidence:

- all four participant signatures are recorded against one round hash.
- one finalization transaction is accepted by Pudge.
- its inputs match the four recorded staging outpoints.
- its outputs and participant output-index mapping match the finalized coordinator response.
- the transaction hash is saved in the demo evidence log.

### 5. Recover finalized encrypted notes

After finalization, each browser polls its participant note endpoint. The returned public finalization data is combined with the secrets retained in the user's pending note, then encrypted again as the finalized withdrawal note.

The recovery rehearsal includes two paths:

- normal completion without closing the browser,
- closing the browser after staging, reopening it, importing the encrypted pending note, recovering by commitment, and continuing to finalized status.

Completion evidence:

- the finalized note contains the expected session, participant, commitment, final transaction outpoint, denomination, and local private secrets.
- recomputing the commitment from the recovered secrets matches the accepted commitment.
- the finalized encrypted note can be imported and decrypted with the original password.
- an incorrect password fails without exposing plaintext.

### 6. Generate the browser withdrawal proof

The participant imports a finalized encrypted note and selects the withdrawal recipient. The current SDK reconstructs the prototype commitment set, builds the depth-20 path, derives the nullifier, and calls `snarkjs.groth16.fullProve` with the deployed WASM and ZKey.

Completion evidence:

- the UI reaches `proof-ready`.
- proof generation completes in a measured amount of time on the demo browser.
- the packed proof length and encoding match the current Rust verifier ABI.
- the displayed Merkle root, nullifier, leaf index, and registry snapshot are saved with the evidence log.
- a locally altered proof or public input is rejected.

The root used here is still reconstructed from coordinator-held commitments. The audit established that it is not yet an authoritative on-chain pool root, so the demo must not describe this proof as validating a protocol-correct deposit state.

### 7. Exercise direct withdrawal first

The first finalized note uses the direct path because it removes relayer availability from the initial withdrawal test.

The frontend prepares the current registry/proof transaction, asks the connected signer to authorize the required direct submission, broadcasts it, and waits for chain confirmation.

Completion evidence:

- prepared transaction JSON is available for inspection.
- the transaction references the expected current registry cell.
- Pudge accepts the transaction.
- the successor registry data contains the note's nullifier.
- the frontend reports submission only after receiving the real transaction hash.

### 8. Exercise relayed withdrawal

A second finalized note is sent through `POST /relay`. The frontend records the returned job ID and polls `GET /relay/:jobId` until the current job status becomes `broadcast` or `failed`. Because the relayer does not expose a confirmed state, the wallet then checks the returned transaction hash against Pudge independently.

Completion evidence:

- the relay request contains the intended proof bundle and no private note secrets.
- the relayer funds only its expected transaction costs.
- the relayer returns a real transaction hash.
- the wallet independently resolves that hash and verifies the resulting registry state.
- stopping the relayer does not prevent the separate direct path from remaining available.

### 9. Demonstrate replay rejection

After one withdrawal confirms, the same note is prepared or submitted again against the new live registry state.

The second attempt must fail because the nullifier is already present. The demo records the script or preparation error and verifies that no second accepted state transition is created.

This negative test demonstrates the current exact-byte registry behavior. It does not close the audit finding around canonical field aliases or bind the registry update to a real asset payout.

---

## Active Workstreams

| Workstream | Current position | Remaining action | Completion signal |
|---|---|---|---|
| Runtime configuration | Environment fields and runtime modes exist | Produce one sanitized Pudge demo environment and verify every outpoint | All services start without fallback or missing-contract errors |
| Four-user deposit | Threshold and signing flow exist | Complete the same round several times with four isolated JoyID users | Repeated accepted finalization transactions with four valid signatures |
| Restart recovery | Pending/finalized recovery APIs exist | Test browser, coordinator, and relayer restart boundaries | No note is lost and status resumes from saved identifiers |
| Browser proof | Current artifacts and prover are wired | Generate from a live finalized note and record timing | `proof-ready` result and local verification |
| Direct withdrawal | Builder and broadcast controls exist | Retest with current live deployment | Confirmed Pudge transaction and updated registry |
| Relayed withdrawal | Relay API and polling exist | Retest funding, status, and failure paths | Confirmed relay transaction independently verified by wallet |
| Replay test | Nullifier registry rejects an existing raw entry | Submit the same note twice | First transition accepted, second rejected |
| Demo evidence | No single evidence bundle exists yet | Capture hashes, outpoints, timings, logs, and screenshots | One shareable rehearsal record from clean start to replay rejection |

---

## Ordered Rehearsal Procedure

The demo should be run in this order so failures are isolated before live presentation:

1. Rotate the committed test key and verify that no funded environment uses it.
2. Build the SDK, frontend, and backend.
3. Run the current contract tests.
4. Resolve all configured Pudge deployment cells and artifact URLs.
5. Start Redis, coordinator, relayer, and frontend with clean demo state.
6. Fund and verify the four JoyID participant accounts.
7. Generate and save four encrypted pending notes.
8. Submit four deposits and record every staging transaction/outpoint.
9. Confirm that the pool reaches the four-participant threshold.
10. Sign the shared round from all four JoyID sessions.
11. Confirm and record the finalization transaction.
12. Recover and save every finalized encrypted note.
13. Close one browser and prove note recovery from the saved pending backup.
14. Generate a Groth16 proof for the first finalized note.
15. Complete and confirm a direct withdrawal.
16. Generate a proof for a second note and complete the relayed withdrawal.
17. Repeat the first note and record nullifier replay rejection.
18. Restart coordinator and relayer, then verify completed jobs and note recovery remain explainable.
19. Repeat the full run once without manual database edits or debug transaction files.

---

## Demo Failure Recovery

| Failure | How the current demo resumes |
|---|---|
| Pool does not reach four participants | Check pool/session IDs, remove cancelled entries, and use four controlled accounts rather than waiting for public users |
| Participant signs a different round | Discard the round, rebuild one unsigned transaction, and verify the shared hash before collecting any new signature |
| Browser closes after deposit | Import the saved encrypted pending note, recover the session by commitment, and continue polling/signing |
| Coordinator restarts | Restore from Redis-backed state and verify the staging outpoints are still live before rebuilding; in-memory fallback is not treated as reliable recovery |
| Finalization transaction is rejected | Keep the encrypted pending notes, inspect the exact shared transaction and witnesses, confirm inputs remain live, then rebuild the round |
| Finalized note cannot be used | Recompute its commitment from local secrets and compare the finalization/session metadata before attempting proof generation |
| Browser proof fails | Verify circuit artifact URLs, finalized commitment set, leaf index, public inputs, and browser memory before regenerating |
| Direct withdrawal becomes stale | Resolve the latest live registry cell and rebuild the transaction/proof context as required by the current builder |
| Relayer disappears | Query the chain independently; if nothing committed, use the direct path with a freshly prepared transaction |
| Transaction is reorged | Return the UI to pending, re-resolve live inputs and registry state, and do not retain a local-only success flag |

---

## Validation Checklist

The current demo is ready to present when all of the following have evidence:

- [ ] SDK, frontend, and backend builds pass from a clean checkout.
- [ ] Current contract tests pass with the recorded binaries.
- [ ] All Pudge deployment pointers and circuit artifacts resolve.
- [ ] Four separate JoyID users create and save encrypted pending notes.
- [ ] Four live prototype deposits enter one coordinator session.
- [ ] Every participant signs the same shared transaction hash.
- [ ] One shared finalization transaction confirms on Pudge.
- [ ] All four finalized notes are recoverable and re-encrypted locally.
- [ ] Browser restart recovery works from a pending note.
- [ ] Groth16 proof generation succeeds from a finalized note.
- [ ] One direct withdrawal confirms.
- [ ] One relayed withdrawal confirms and is independently verified.
- [ ] A repeated nullifier is rejected.
- [ ] Coordinator and relayer restart behavior is demonstrated.
- [ ] No note password, `secret`, or `nullifierSecret` appears in backend logs or evidence files.
- [ ] Transaction hashes, outpoints, participant states, timings, and screenshots are collected in one rehearsal record.

---

## Known Prototype Limitations

The demo must be presented with these limitations visible:

- The active deposit path uses a backend-controlled `OWNER_PRIVATE_KEY` mint flow. It does not yet start from an independently user-owned CT cell.
- The coordinator stores the Poseidon commitments and supplies the commitment set used for the Merkle root. That root is not anchored in an authoritative on-chain pool state.
- The CT Pedersen commitment placed in a finalized output is not cryptographically tied to the Poseidon privacy commitment used by the proof.
- The current Groth16 statement and scripts do not atomically bind root legitimacy, CT asset, denomination, value, nullifier update, recipient lock, and payout.
- The flat nullifier registry compares raw bytes and is not a canonical field-element state structure.
- The current stealth output and recipient-spend behavior are still prototype code.
- Redis/file state improves restart behavior but is not protocol authority.
- The four-participant live round and relayer path still require repeated Pudge rehearsal.
- The hard-coded private key in `mixer-sdk/test-ccc.cjs` must be treated as compromised, rotated or swept if funded, and removed before a public demo build.
- Current circuit artifacts, deployment pointers, and code hashes are prototype-specific and must not be presented as the remediated public protocol.
- The demo provides no guaranteed anonymity set and should not be described as anonymous, production-ready, or a protocol-correct public SDK.

These findings block public SDK extraction and production claims. They do not prevent the team from demonstrating the current prototype mechanics as long as the limitations are stated accurately.

---

## Current State

The major pieces of the demo are already present in code:

- encrypted browser note creation and import,
- live Pudge CT mint/deposit support,
- four-participant coordinator state,
- JoyID shared-round signing,
- finalization transaction construction,
- finalized-note recovery,
- browser Groth16 proving,
- direct withdrawal preparation,
- relayer submission and polling,
- nullifier replay checks.

The remaining work is integration and evidence work rather than a new SDK extraction. The priority is to make the existing flow repeatable from clean state, fix demo-blocking runtime failures, verify every on-chain result, and document the audit boundaries during the walkthrough.

---

## Next Steps

1. Remove or rotate the compromised test key before using funded demo accounts.
2. Produce one verified and sanitized Pudge runtime configuration.
3. Run the build and current contract-test preflight.
4. Complete the first controlled four-user deposit round and record all hashes/outpoints.
5. Test pending-note and finalized-note recovery after browser restart.
6. Complete a direct withdrawal from a live finalized note.
7. Complete a relayed withdrawal from a second note.
8. Record the replay-rejection test.
9. Repeat the full flow after coordinator and relayer restarts.
10. Assemble the transaction evidence, screenshots, timings, and honest limitations into the final demo script.
11. After the prototype demo is stable, resume the accepted protocol-correctness remediation before any public SDK extraction.

---

## Summary

August Week 2 is about completing the demo that is already under construction, not proposing a new product architecture.

The practical path is to stabilize the current four-participant `100 CT` Pudge flow, prove that encrypted note recovery works, exercise browser proof generation, validate both withdrawal submission modes, demonstrate nullifier replay rejection, and capture evidence from a clean rehearsal.

The audit findings remain important boundaries. The current demo can show how the existing Obscell prototype operates, but protocol remediation is still required before the project can claim authoritative privacy-pool state or expose a public privacy SDK.
