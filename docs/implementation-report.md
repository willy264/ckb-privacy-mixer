# Implementation Report

**Cutoff:** 2026-09-04 source-level foundation. This is not the final Pudge completion report.

## 1. What Existed Before

The repository contained legacy mixer, CT, Circom/Groth16, encrypted-note, CCC, coordinator, relayer, frontend, deployment, and ckb-testtool work. It also contained an honest CCC-oriented interactive simulation and dated audit/research reports.

## 2. What Changed

- Added an explicit `legacy-demo` boundary without deleting original code.
- Reframed the README around reusable privacy infrastructure and evidence-based status.
- Added corrected-V1 SDK/protocol/circuit, fail-closed CKB covenant, and service foundations with explicit unsupported-live behavior.
- Added typed service validation for chain state, protected fields, fee isolation, deterministic acceptance, and operation lifecycle.
- Added architecture, protocol, research, security, proposal, deployment, Pudge, vector, evidence, and test documentation.

## 3. What Was Preserved

The legacy UI/route, generated proving artifacts, contract crates, explicit `mixer-sdk/legacy` package subpath, coordinator/relayer, deployment scripts, encrypted note UX, and progress history remain available. Some legacy source was hardened, but the historical generated proving artifacts were not regenerated or relabeled as corrected V1. The package root exports only corrected-V1 APIs.

## 4. Protocol Changes

The target moves authority from coordinator/registry records to singleton PoolState and Vault transitions, with user-owned staging deposits, fixed identity/value, sequence, root history, nullifier state, CT accounting, recipient binding, replay/stale protection, and proof validity enforced atomically. Strict versioned Rust codecs, partial cross-language decoding/validation, and structural PoolState, Vault, and Staging covenants now exist. Pool genesis, acceptance, and withdrawal deliberately return unsupported after structural validation until their cryptographic and CT rules are connected; they are not deployable protocol implementations.

## 5. Circuit Changes

A versioned source freezes nine public signals, local secrets/path witnesses, fixed-denomination equality, pool/asset-bound leaf, position-bound nullifier, recipient/action auth tag, and pool/level-separated Merkle nodes. Legacy generated proving artifacts remain unchanged; no V1 setup/deployment is claimed.

## 6. CT Changes

The conservation model and required tests are specified. CT issuance/transfer/range-proof/witness/RNG remediation is not yet implemented, so V1 Vault deployment remains blocked.

## 7. SDK Architecture

The public `PrivacyClient` is separated from protocol, crypto, Merkle, note, prover, services, validation, and CCC responsibilities. It receives an injected CCC Client and operation-scoped Signer. Deployment validation binds network identity through genesis hash and chain checks. Sync requires both an indexer and an independent state verifier, then conditionally commits the verified snapshot and note updates through the store's atomic checkpoint compare-and-swap. The included memory store provides only process-local development behavior; a production encrypted persistent store is not included. Unavailable settlement operations fail explicitly rather than fabricating results.

## 8. CCC Integration

The boundary uses installed CCC-native client/signer/transaction types. Wallet connector and JoyID concerns stay in the application. Network/deployment checks and transaction/capacity/signer responsibilities are isolated for testability.

## 9. Coordinator Changes

An isolated V1 interface reads complete PoolState/Vault snapshots and staging records from a chain reader, validates canonical encodings, accounting, current-root ordering, CT script identity, refund covenant fields, and pool/asset/denomination agreement, orders outpoints deterministically, caps a batch at 16, and passes it to an acceptance planner. A non-fixture, Pudge-capable scanner/reorg implementation remains open.

## 10. Relayer Changes

An isolated V1 relayer accepts the same strict wire intent emitted by the SDK, resolves state through injected interfaces, orchestrates an injected planner that derives protected fields and reconstructs a candidate, caps fees, rejects typed fee inputs or recipient mutation, requires an independent inspector, and records `queued`, `validated`, `submitted`, `committed`. It requires the injected submitter to return a locally derived canonical transaction hash, which the relayer persists before broadcast rather than trusting an RPC response; it retains the operational nullifier lock when an RPC timeout or mismatched response leaves submission outcome uncertain. No non-fixture chain reader, inspector, builder, hasher, submitter, or reconciliation worker is included, and it is not wired to the legacy endpoint.

## 11. Frontend And Demo

The current default demo and legacy route were preserved. Simulation labels remain mandatory. A standalone `examples/payment-app` workspace now consumes only the public `mixer-sdk` entry point and injects its own CCC-shaped client, state store, indexer, and verifier fixtures; it does not reuse `DemoPrivacyClient` or claim live settlement. Replacing either fixture/demo client with live V1 remains blocked on the Pudge acceptance criteria.

## 12. Research Documentation

`docs/research.md` records the original design, audit findings, corrected design, proof alternatives, CCC boundary, rejected options, limitations, and future work without rewriting history.

## 13. Architecture Diagrams

`docs/architecture.md` contains system, deposit, withdrawal, trust-boundary, and SDK diagrams. Six generated original-color raster counterparts under `docs/diagrams/` are embedded in the black-and-white Word proposal and explicitly labeled as target architecture, not deployment evidence. Off-chain services are shown as replaceable rather than authoritative.

## 14. Screenshots

Capture scripts and hash-cataloged local reference-demo and separate-consumer captures are cataloged under `docs/evidence/`. Their manifests identify a dirty worktree and are not clean-release attestations. Final Pudge flow Figure 5 remains absent and will not be substituted with concept screens.

## 15. Tests

The dated rerun results are in `docs/test-report.md`. V1 tests cover the nine-signal circuit relation, canonical proof parsing, strict SDK encodings and state rules, shared relayer wire data, backend chain/refund checks, deterministic batches, lifecycle/fee isolation, and structural covenant failures/refund. They do not establish deployable PoolState transitions or CT security.

## 16. Pudge Evidence

None for corrected V1. `docs/pudge-runbook.md` defines the required evidence and explicitly rejects hash-only completion.

## 17. Security Review Status

No independent review has occurred. Threat/trust/attack-surface/assumption/invariant documents prepare the review boundary; they are not an audit report.

## 18. Known Limitations

See `docs/known-limitations.md`. The principal blockers are completing authoritative CKB transition logic, CT remediation, nullifier SMT, V1 proof artifacts/verifier, non-fixture state verification/scanning, and real Pudge execution.

## 19. Remaining Work

Connect and adversarially test the fail-closed scripts and CT rules, complete independently recomputed cross-language hash/state vectors, benchmark CKB verification and alternatives, generate reviewed artifacts, implement scanner/storage/reorg behavior, wire Pudge-capable non-fixture SDK/services, complete Pudge, prove recipient spend, then move the demo to real execution.

## 20. Reproduction

Local commands and results are in `docs/test-report.md`. Build and validate the reviewer-facing Word document from the authoritative Markdown with `python scripts/build-grant-proposal-docx.py`; the output is `Obscell_CKB_Community_DAO_Proposal_15K_Grant_Ready.docx`. Exact deployment/E2E commands cannot be honest until the missing scripts and manifest exist; that gap is explicit in the runbook.
