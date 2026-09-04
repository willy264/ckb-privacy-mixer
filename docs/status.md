# Implementation Status

**As of:** 2026-09-04

`Implemented` means code exists and a listed local test has run. It does not mean deployed, audited, or production-ready.

| Requirement | State | Evidence / gate |
|---|---|---|
| Legacy implementation preserved and isolated | Implemented | `legacy-demo/README.md`, `?view=legacy`, and `mixer-sdk/legacy`; the package root is V1-only |
| CCC-oriented reference experience | Implemented simulation | `frontend/src/demo/`; browser verification |
| Independent public-SDK consumer | Implemented deterministic fixture | `examples/payment-app`; unit/browser checks; no live settlement claim |
| Injected CCC Client and operation-scoped Signer | Foundation implemented | `mixer-sdk/src/ccc/`, `createPrivacyClient` tests |
| Strict V1 field/proof encodings | Foundation implemented | SDK canonical encoding tests and verifier parser tests |
| Frozen nine-signal circuit source | Foundation implemented | versioned source under `circuits/`; no new trusted setup claimed |
| Typed relayer intent and protected reconstruction | Foundation implemented, not live-wired | `backend/src/v1/` tests |
| Chain-derived deterministic coordinator plan | Foundation implemented, scanner pending | `backend/src/v1/coordinator.ts` validates full snapshots/staging and caps deterministic batches at 16 |
| Atomic private-state sync commit | Foundation implemented, persistent store pending | Store-level checkpoint compare-and-swap rejects stale commits across clients sharing a store; only a memory implementation ships |
| PoolStateCell | Fail-closed structural foundation, not deployable | Strict codec and transaction-shape tests exist; genesis and state transitions return unsupported until Poseidon/SMT/CT/proof rules are connected |
| VaultCell covenant and CT accounting | Fail-closed structural foundation, not deployable | Paired PoolState/shape checks exist; authoritative acceptance and withdrawal remain blocked on CT conservation and PoolState transitions |
| StagingDepositCell and refund | Structural foundation, not deployed | Covenant validates staging metadata; the tested refund branch is structural only and uses a placeholder asset fixture |
| Nullifier SMT | Codec/design foundation only | Canonical absence/update proof format and cryptographic script transition required |
| Authoritative on-chain Merkle frontier/root history | Structural invariants only | Poseidon empty-root, append, and proof/update logic are intentionally unsupported in the script |
| Deployable corrected V1 proving/verifying key | Not available | One insecure disposable benchmark setup was deleted; reproducible ceremony/build and reviewed artifact hashes remain required |
| Proof-system benchmark on corrected workload | Partial local measurement | Disposable Groth16/snarkjs proof measured; CKB-VM verification and alternative systems remain unmeasured |
| Real corrected-V1 Pudge E2E | Not run | All 20 runbook assertions remain open |
| Recipient subsequent CT spend | Not run | Requires real Pudge recipient output |
| Redis wipe/rebuild and reorg test | Interface only | Production state verifier/scanner, checkpoint implementation, and test required |
| Independent security review | Not performed | Planned grant deliverable; local tests are not an audit |

No transaction hashes, deployments, confirmations, balance values, or security-review results are asserted by this status page.
