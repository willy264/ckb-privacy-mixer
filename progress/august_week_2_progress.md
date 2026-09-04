# Obscell Privacy Mixer - August Week 2 Progress Report

> **Historical status (superseded September 4, 2026):** The statements below describe the August 8-14 legacy-prototype work and its then-current plan. Corrected V1 now has a public SDK and fail-closed source-level circuit, contract, and service foundations, but it still has no deployable protocol transition set or corrected-V1 Pudge evidence. See `docs/status.md` and `docs/known-limitations.md` for current status.

**Period:** August 8-14, 2026
**Focus:** Completing and rehearsing the existing `100 CT` Pudge demo while converting the protocol audit into the next implementation phase.
**Status:** Demo validation is in progress. The remediation plan is complete; protocol implementation and public SDK extraction have not started.

---

## Overview

The Obscell demo did not start from an empty repository this week. The project already contains implemented prototype components spread across the frontend, mixer SDK, backend coordinator and relayer, Circom circuit, CKB contracts, and CT helper tools.

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

For that reason, the live Week 2 work remains focused on finishing, testing, and documenting the current Pudge demo honestly. The audit has also been converted into an approved, correctness-first implementation sequence for the phase that follows the demo. Public SDK extraction remains blocked until that sequence and its tests are complete.

---

## Demo Goal

The immediate goal is a repeatable live walkthrough in which:

1. Four controlled users connect with JoyID on Pudge.
2. Each browser generates its own `secret`, `nullifierSecret`, and Poseidon commitment.
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
- `COORDINATOR_MIN_PARTICIPANTS=4` or the matching coordinator setting.

Completion evidence:

- `pnpm build` passes.
- `pnpm --filter ckb-mixer-backend build` passes.
- `pnpm test:contracts` passes for the current prototype contracts.
- the relayer health endpoint and coordinator session endpoints respond.
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

The fourth registered participant should move the coordinator pool to `ready`.

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
8. The coordinator records the pool as `complete` and participants as `finalized` at submission time.
9. The operator independently waits for and records the transaction's Pudge confirmation.

Completion evidence:

- all four participant signatures are recorded against one round hash.
- one finalization transaction returns a real hash and is independently confirmed on Pudge.
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
- recomputing the commitment from the recovered secrets matches the coordinator-recorded privacy commitment.
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
- the transaction is independently confirmed on Pudge.
- the successor registry data contains the note's nullifier.
- the frontend reports submission only after receiving the real transaction hash.

### 8. Exercise relayed withdrawal

A second finalized note is sent through `POST /relay`. The frontend records the returned job ID and polls `GET /relay/:jobId` until the current job status becomes `broadcast` or `failed`. Because the relayer does not expose a confirmed state, the wallet then checks the returned transaction hash against Pudge independently.

Completion evidence:

- the relay request contains the intended proof bundle and no private note secrets.
- the relayer's complete CKB contribution is measured. Because the prototype withdrawal has no vault input, this currently includes recipient-output capacity and must not be described as fee-only behavior.
- the relayer returns a real transaction hash.
- the wallet independently resolves that hash and verifies the resulting registry state.
- stopping the relayer does not prevent the separate direct path from remaining available.

### 9. Demonstrate replay rejection

After one withdrawal confirms, the same note is prepared or submitted again against the new live registry state.

The second attempt must be rebuilt against the live successor registry and fail because the exact nullifier is already present. The demo records the nullifier-script or preparation error and verifies that no second accepted state transition is created.

This negative test demonstrates the current exact-byte registry behavior. It does not close the audit finding around canonical field aliases or bind the registry update to a real asset payout.

---

## Active Workstreams

| Workstream | Current position | Remaining action | Completion signal |
|---|---|---|---|
| Runtime configuration | Environment fields and runtime modes exist | Produce one sanitized Pudge demo environment and verify every outpoint | All services start without fallback or missing-contract errors |
| Four-user deposit | Threshold and signing flow exist | Complete the same round several times with four isolated JoyID users | Repeated independently confirmed finalization transactions with four valid signatures |
| Restart recovery | Pending/finalized recovery APIs exist | Test browser, coordinator, and relayer restart boundaries against one controlled backing store | Saved identifiers can resume the controlled rehearsal without treating Redis/file fallback as protocol recovery |
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
| Direct withdrawal becomes stale | Refresh the configured registry successor from chain data, update the runtime reference, and rebuild; the current provider does not discover successors by type identity |
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
- Finalized-note recovery retains the participant's earlier CT blinding metadata even though the finalizer creates a new output commitment, so recipient CT spendability is not established by the current note.
- The current Groth16 statement and scripts do not atomically bind root legitimacy, CT asset, denomination, value, nullifier update, recipient lock, and payout.
- The current withdrawal consumes no finalized CT output or vault and creates no recipient CT output. Its fee payer supplies the capacity used by the untyped recipient cell.
- The flat nullifier registry compares raw bytes and is not a canonical field-element state structure.
- The current stealth output and recipient-spend behavior are still prototype code.
- Redis/file state improves restart behavior but is not protocol authority.
- The four-participant live round and relayer path still require repeated Pudge rehearsal.
- The hard-coded private key in `mixer-sdk/test-ccc.cjs` must be treated as compromised, rotated or swept if funded, and removed before a public demo build.
- Current circuit artifacts, deployment pointers, and code hashes are prototype-specific and must not be presented as the remediated public protocol.
- The demo provides no guaranteed anonymity set and should not be described as anonymous, production-ready, or a protocol-correct public SDK.

These findings block public SDK extraction and production claims. They do not prevent the team from demonstrating the current prototype mechanics as long as the limitations are stated accurately.

---

## Protocol Remediation Plan Produced

The repository-wide audit was converted into a reviewed implementation plan during this reporting period. This is planning progress, not an implementation claim: no protocol-remediation code or public SDK extraction has started yet.

The main conclusion is that the corrected protocol must be implemented as a new, versioned deployment beside the current `legacy-demo`. Existing coordinator roots and nullifiers cannot be migrated as authoritative V1 state.

### Current implementation classification

| Classification | Current code | Decision |
|---|---|---|
| Reusable mechanics | Poseidon initialization, fixed-depth Merkle scaffolding, browser Groth16 proving and proof packing, CT commitment arithmetic, note encryption, CCC transaction mechanics, HTTP polling, and UI recovery controls | Preserve and adapt only after canonical V1 encodings and vectors are frozen |
| Correct only for the legacy relation | The depth-20 circuit, pinned Groth16 verifier, raw append-only nullifier checks, and isolated contract tests | Keep as legacy fixtures; they do not establish an authoritative asset flow |
| Incomplete protocol code | Current CT contracts, coordinator finalizer, registry-backed withdrawal, deployment discovery, note synchronization, and relayer policy | Redesign around live PoolState and Vault transitions |
| Unsafe or demo-only | Backend-funded mint deposit, coordinator-root authority, process-local spent set, fabricated hashes/signatures, placeholder stealth addresses, zero-secret migration, static state outpoints, debug transaction dumps, and the committed test key | Quarantine from V1 and remove unsafe paths before public distribution |
| Public SDK surface | `MixerClient`, current deposit/withdraw methods, private-key parameters, internally created public-testnet clients, and JoyID-specific types | Do not publish; replace only after protocol test gates pass |

### Protocol-correct V1 target

The smallest corrected state model is:

```text
PoolStateCell
    -> immutable pool, network, CT asset, denomination, circuit, and script identities
    -> current Merkle root, frontier, and recent-root history
    -> nullifier SMT root
    -> next leaf index, outstanding note count, and CT vault balance

VaultCell
    -> exact configured CT type
    -> aggregate privacy-held CT commitment
    -> privacy vault covenant lock

StagingDepositCell
    -> user-funded fixed-denomination CT
    -> privacy leaf and pool identity
    -> refund lock and relative timeout
```

The authoritative state and vault are sibling outputs from the same transaction. Every update must consume the matching `(transaction, output 0)` state and `(transaction, output 1)` vault and recreate them in the same positions. This prevents a lookalike vault from being substituted for the real privacy-held asset.

### Required transaction changes

1. **User staging deposit:** the connected CCC signer spends user-owned CT into one exact `100 CT` staging cell. Optional CT change returns to the user. The staging covenant binds the Pool Type-ID, full CT type-script hash, denomination, privacy leaf, refund script, timeout, and fixed capacity reserve `R`.
2. **Deposit acceptance:** a permissionless builder atomically consumes live PoolState, the sibling Vault, and one or more staging cells. The scripts verify every staging commitment, append the exact staged leaves in input order, update frontier/root/history, increase outstanding count/value, and add the CT commitments and capacity reserves to the successor Vault.
3. **Refund:** after the relative timeout, an unaccepted staging cell can be copied unchanged to its committed refund lock. PoolState and Vault remain untouched.
4. **Withdrawal:** the transaction consumes live PoolState and Vault plus untyped fee cells. It produces successor state, successor vault, one exact recipient CT output, and untyped fee-payer change. The nullifier SMT changes from absent to spent, count and balance decrease by one denomination, and CT conservation proves that the recipient payout came from the Vault.
5. **Change:** user CT change exists only while creating the staging deposit. A V1 privacy note is fixed denomination and is fully consumed, so there is no shielded change note or join-split in this phase.

Each staging cell carries the capacity reserve later needed for its recipient CT output. Acceptance moves `R` into the Vault; withdrawal moves `R` to the recipient. This makes the relayer a fee payer rather than the source of the payout.

### Circuit V2 work

The new circuit freezes nine public signals in this order:

```text
poolDomain
assetDomain
denomination
value
root
nullifierHash
recipientDomain
actionHash
authTag
```

Its private witnesses are `secret`, `nullifierSecret`, `pathElements[20]`, and `pathIndices[20]`. The required constraints are:

```text
value = denomination
leaf = Poseidon(LEAF_TAG, poolDomain, assetDomain, denomination, secret, nullifierSecret)
leafIndex = bits(pathIndices)
nullifierHash = Poseidon(NULLIFIER_TAG, poolDomain, nullifierSecret, leafIndex)
authTag = Poseidon(AUTH_TAG, secret, recipientDomain, actionHash)
```

The circuit verifies a level-domain-separated Merkle path. The Pool script recomputes the pool, asset, recipient, and action domains from canonical transaction data. The action hash covers the state sequence, accepted root, nullifier, exact CT asset and value, recipient lock, recipient CT commitment/data, and protocol output index. Arbitrary fee inputs and fee change are excluded from the authorized action.

Field and proof encodings must be canonical and rejected when they are greater than or equal to their modulus. The verifier must not reduce attacker-provided values modulo the field, and all proof points require complete curve and subgroup validation.

### Contract work

The implementation phase adds a Type-ID-backed `privacy-pool-type-v1`, `privacy-state-lock-v1`, `privacy-vault-lock-v1`, and `privacy-deposit-lock-v1`. Vault and staging cells keep the exact CT asset type and use privacy covenant locks because one CKB cell cannot carry two type scripts.

The Pool type becomes the transaction-level authority. It invokes the pinned Groth16 verifier, validates current or retained roots, checks the nullifier SMT transition, binds the actual recipient CT output, and checks state/count/vault arithmetic. The standalone proof-receipt cell and flat nullifier registry leave the active V1 path.

The CT token and CT-info contracts also require a versioned, tagged witness ABI for `Transfer`, `Mint`, and refund `Preserve` actions. CT mint identity, conservation, range proofs, canonical commitment encodings, and witness placement require dedicated tests. The current transaction-hash-derived Bulletproof verification RNG is an explicit cryptographic-review blocker. CT minting remains issuance infrastructure outside normal privacy deposits, and placeholder stealth is outside V1.

### Backend and frontend work

| Layer | Required implementation | Completion evidence |
|---|---|---|
| Chain scanner | Discover the live PoolState/Vault pair by Type-ID, index staging/acceptance/refund/withdrawal transactions, checkpoint block hashes, and roll back on reorg | Deleting Redis and replaying the chain reconstructs the same state |
| Coordinator | Accept or discover staging outpoints, verify them against chain data, and build deterministic permissionless acceptance transactions | `accepted` is reported only after the successor state/vault are confirmed |
| Relayer | Accept a typed withdrawal intent, resolve current state itself, rebuild or fully validate protected fields, enforce fee policy, and add only untyped CKB inputs/change | Relayer CT balance is unchanged by withdrawal |
| Service storage | Use Redis for queues, idempotency, and cache rather than roots or nullifier authority | Service restart cannot change protocol truth |
| Reference wallet | Use JoyID only to obtain an injected CCC signer; create staging deposits, track acceptance, prove locally, and submit direct or relayed withdrawals through the SDK | Frontend no longer constructs protocol transactions directly |
| Private state | Preserve encrypted-note UX, remove zero-secret migration, track confirmation/reorg lifecycle, and save the recipient CT opening | Resulting recipient CT can be recovered and subsequently spent |

### CCC and SDK boundary

CCC integration will live inside `mixer-sdk/src/ccc/` after the transaction specification and tests are stable:

```text
ccc/deployment.ts   network, deployment, code-hash, and circuit validation
ccc/reader.ts       live PoolState, Vault, staging, and recipient cell reads
ccc/transaction.ts  canonical protocol plan -> ccc.Transaction
ccc/signer.ts       injected signer, fee completion, signing, and broadcast
ccc/capacity.ts     occupied-capacity, reserve, fee, and change rules
```

The SDK accepts an injected `ccc.Client` and a `ccc.Signer` for operations that require user authorization. It must not accept private-key strings, instantiate its own public-testnet client, or depend on React, JoyID, `import.meta.env`, or a specific wallet connector.

The first honest fixed-denomination API is expected to have this shape after the protocol gates pass:

```ts
const privacy = createPrivacyClient({ client, deployment, prover, stateStore, services });

privacy.getCapabilities();
privacy.sync({ poolId });
privacy.listNotes({ poolId });
privacy.getPrivateBalance({ poolId });
privacy.shield({ poolId, signer });
privacy.refund({ operationId, signer });
privacy.unshield({ noteId, recipient, submission });
privacy.getOperation(operationId);
```

The selected pool fixes asset and denomination, so `shield` and `unshield` do not accept arbitrary values. Private balance counts only chain-confirmed, accepted, locally owned, unspent notes. Capability flags must report private transfers, arbitrary values, shielded change, multi-output join-split, and advanced stealth as unsupported.

React components, JoyID connector setup, notifications, branding, password prompts, server processes, Redis operations, relayer fee keys, deployment tooling, circuit ceremonies, artifact hosting, explorer links, analytics, and product disclosures remain outside the SDK. The SDK may define interfaces for these services without owning their operational authority.

### Tests required before SDK extraction

- Cross-language vectors for canonical integers, fields, hashes, domains, leaves, nullifiers, action/auth tags, Merkle updates, public signals, Molecule structures, scripts, and proof encoding.
- Circuit mutation tests showing that each public signal fails independently when changed.
- Complete `ckb-testtool` transactions for initialization, staging, acceptance, refund, and withdrawal.
- Negative contract tests for wrong pool, root, asset, denomination, value, recipient, output index, nullifier, state sequence, vault, capacity reserve, witness carrier, proof point, and field encoding.
- CT inflation, mint-spoofing, malformed range-proof, unauthorized vault, and fee-payer asset-isolation tests.
- Backend clean-sync, empty-Redis rebuild, reorg rollback, stale state, competing coordinator, confirmation-threshold, and no-secret-persistence tests.
- CCC adapter tests for network mismatch, live-cell replacement, input grouping, witness placement, capacity, fee completion, signer rejection, protected-output mutation, and broadcast failure.
- Private-state tests for encryption, wrong passwords, atomic updates, crash recovery, note lifecycle, reorg rollback, and rejection of zero-secret migration.
- A Pudge test that checks actual cell types, data, state transitions, vault deltas, nullifier state, and recipient spendability rather than recording transaction hashes alone.

No SDK layer is complete until the consensus-critical invariants have contract tests and the cross-language vectors agree.

### Implementation order

1. Freeze the current deployment as `legacy-demo`; rotate or sweep the exposed test key and remove unsafe examples during implementation.
2. Freeze canonical Molecule schemas, domain tags, field/integer encodings, script serialization, action hash, witness grouping, and deployment manifest.
3. Remediate CT-info/CT-token issuance, transfer, range-proof, and witness behavior.
4. Implement PoolState, state lock, Vault lock, staging/refund lock, initialization, acceptance, and withdrawal contracts.
5. Implement Circuit V2 in parallel once the canonical encodings are frozen.
6. Produce Rust, TypeScript, and Circom vectors and complete contract integration tests.
7. Implement the chain scanner, deterministic acceptance coordinator, and fee-only relayer.
8. Complete the one-note protocol-correct Pudge flow, then repeat it with a relayer.
9. Introduce internal `protocol/`, `core/`, `services/`, `ccc/`, `sdk/`, and `internal/` boundaries inside `mixer-sdk`.
10. Expose `PrivacyClient`, refactor the frontend into its reference consumer, and only then build the small CCC privacy-mode demonstration.

### First architecture-proving milestone

```text
user-owned 100 CT
    -> owner-signed StagingDepositCell
    -> confirmed PoolState/Vault acceptance
    -> authoritative on-chain Merkle root
    -> browser Circuit V2 proof
    -> nullifier SMT update
    -> Vault decreases by 100 CT
    -> recipient-controlled 100 CT output
    -> recipient subsequently spends that CT
```

The milestone also requires replay, recipient mutation, wrong asset/value, and stale-state rejection, plus a successful service rebuild after deleting Redis. It requires one note, one CT asset, one fixed denomination, and a standard recipient lock. It does not require the current four-user round, arbitrary denominations, private transfers, join-split, shielded change, or advanced stealth.

---

## Week 2 Demo State

The major pieces of the prototype demo are already present in code:

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

The remaining demo work is integration and evidence work rather than SDK extraction. The immediate priority is to make the existing flow repeatable from clean state, fix demo-blocking runtime failures, verify every on-chain result, and document the audit boundaries during the walkthrough. In parallel, the audit and implementation sequencing are now complete enough for protocol remediation to become the next engineering phase.

---

## Next Steps

### Complete the existing demo evidence

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

### Begin the approved next phase

1. Freeze the legacy deployment and canonical V1 encodings.
2. Start CT contract remediation and the PoolState/Vault/Staging contract work.
3. Implement Circuit V2 against the frozen domains and encodings.
4. Require cross-language vectors and full transaction tests before adapting services.
5. Prove the one-note user-CT-to-recipient-CT flow on Pudge.
6. Extract internal SDK boundaries only after that milestone passes.
7. Add the CCC adapter and `PrivacyClient`, then refactor the frontend into the reference wallet.

---

## Summary

August Week 2 remains centered on completing the demo that is already under construction. The additional planning result is a repository-backed implementation sequence for correcting the protocol after the demo, not a claim that the new architecture is already implemented.

The practical path is to stabilize the current four-participant `100 CT` Pudge flow, prove that encrypted note recovery works, exercise browser proof generation, validate both withdrawal submission modes, demonstrate nullifier replay rejection, and capture evidence from a clean rehearsal.

The audit findings remain hard boundaries. The current demo can show how the existing Obscell prototype operates, while the accepted next phase now has a concrete target: user-owned CT enters staging, confirmed acceptance updates authoritative PoolState and Vault cells, Circuit V2 authorizes a bound withdrawal, the nullifier SMT and Vault update atomically, and the recipient receives spendable CT. Public SDK and CCC-facing API work begins only after that path is tested on-chain.
