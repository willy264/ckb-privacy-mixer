# Obscell: Reusable Privacy Infrastructure For CKB Applications

**Funding request:** **$15,000**

**ETA:** **4 months**

**Validation environment:** CKB Pudge testnet

**Primary reusable artifact:** Obscell Privacy SDK with CCC integration

## Summary

Obscell will make fixed-denomination privacy an explicit capability that an existing CKB application can add without replacing its CCC client, wallet connector, signer, or transaction infrastructure.

```text
CKB application -> CCC Client + Signer -> Obscell Privacy SDK -> corrected V1 -> CKB
```

The repository already contains an earlier mixer prototype and a current CCC-oriented interactive demo. The prototype supplies technical prior work: encrypted notes, Poseidon/Merkle code, browser Groth16 proving, Arkworks packing, CT experiments, CCC transaction construction, coordinator/relayer services, and contract tests. The current demo proves the intended developer/product boundary, but its privacy operations are visibly simulated.

The grant funds the correction and hardening required to turn that evidence into a reusable testnet primitive. It does not fund a generic wallet or unrelated feature expansion.

## Current Evidence And Honest Boundary

| Evidence | What exists | What is not claimed |
|---|---|---|
| Original Obscell V1 | Working prototype components and historical mixer UI | Protocol-correct on-chain authority or production security |
| CCC-oriented demo | Privacy opt-in, private-balance concept, and operation pipeline | Real shield/unshield settlement |
| Independent payment example | Separate workspace imports the public SDK root and injects its own fixture client/store/indexer/verifier | Live chain integration or settlement |
| Corrected-V1 foundation | Versioned circuit/source rules, canonical encodings, SDK and service boundaries/tests | Complete scripts, deployment, trusted setup, or Pudge E2E |

Existing legacy paths remain labeled `legacy-demo`; no old root, registry, deployment, or authority state will migrate into V1.

Current visual evidence is cataloged in [`docs/evidence`](evidence/README.md). Figures 1-4 document the historical and current simulated reference experiences. Figure 6 documents the independent SDK consumer under deterministic fixture adapters. Figure 5 is intentionally absent until the corrected-V1 Pudge runbook passes.

## Deliverables

1. Fresh Type-ID-backed PoolState, Vault, and StagingDeposit/refund CKB scripts.
2. Corrected withdrawal circuit binding pool, asset, fixed denomination/value, root, nullifier, recipient, action context, authorization, and state sequence.
3. CT conservation and mint/transfer witness hardening for the exact supported CT asset.
4. Cross-language canonical vectors across Circom, Rust, and TypeScript.
5. `createPrivacyClient({ client, deployment, prover, stateStore, services })` with injected CCC Client and operation-scoped Signer.
6. CCC deployment reader, transaction, signer, witness, and capacity adapters with no hidden client or private-key-string API.
7. Chain-derived coordinator and typed-intent fee-only relayer; Redis remains operational only.
8. Encrypted note state, crash/restart recovery, lifecycle and reorg rollback.
9. Reference application moved from simulation only after real V1 passes; second application consuming the same SDK.
10. Reproducible Pudge deployment/runbook and the full user-CT-to-recipient-CT flow, including subsequent recipient spend.
11. Independent security review preparation, adversarial tests, threat model, research, architecture, SDK docs, and release evidence.

## Four-Month Plan

| Month | Engineering work | Exit evidence |
|---|---|---|
| 1 | Freeze schemas/domains/action hash; CT audit/remediation; PoolState/Vault/Staging skeletons; corrected circuit and vectors | Rust/TS/Circom vectors agree; initialization/staging negative tests pass |
| 2 | Acceptance/refund/withdrawal scripts; canonical verifier; nullifier state; CT conservation and mutation tests | Complete ckb-testtool transitions reject asset/value/root/recipient/replay mutations |
| 3 | Chain scanner, restart/reorg rebuild, deterministic coordinator, typed relayer, CCC adapter, encrypted state | Redis-wipe rebuild and CCC adapter suites pass locally |
| 4 | Pudge deployment/E2E, recipient subsequent spend, browser proof benchmark, second integration, independent review and release docs | Runbook evidence and artifact manifest published; review status disclosed |

## Budget

| Workstream | Amount |
|---|---:|
| Protocol/core engineering and CKB scripts | $4,500 |
| Cryptographic circuit, prover, verifier, and reproducible artifacts | $2,500 |
| Privacy SDK and CCC integration | $2,500 |
| Independent security review and adversarial testing | $2,500 |
| Pudge deployment, infrastructure, and evidence | $1,000 |
| Research, documentation, diagrams, second integration, and release | $2,000 |
| **Total** | **$15,000** |

## Acceptance Criteria

The grant is complete only when a pre-existing user-owned supported CT cell is staged with a CCC signature, accepted into authoritative PoolState/Vault, synchronized as an accepted local note, proved locally, withdrawn through an atomically validated nullifier/Vault/recipient transition, and subsequently spent by the recipient through CCC. Replay, recipient mutation, wrong asset/value, stale state, excessive fee, typed relayer input, and malformed proof must fail. Deleting Redis and restarting services must rebuild the same protocol state from the canonical chain.

Evidence must include exact commands, source/artifact hashes, deployment outpoints, explorer-verifiable transactions and cells, confirmation policy, observed state/vault/nullifier deltas, recipient spend, negative results, environment versions, and real screenshots. No hash or screenshot will be fabricated.

## Security Position

The system remains testnet-first. Internal tests are not an audit. Independent review is an explicit grant workstream, and unresolved findings remain visible in the release limitations. Mainnet deployment and claims of production anonymity/security are excluded.

## Out Of Scope For V1

Arbitrary denominations, multiple private assets, private-to-private transfer, join-split, shielded change, multi-output proofs, advanced stealth addresses, mobile-specific proving/storage, governance, mainnet launch, and generalized private smart-contract calls are V2 research. They are not used to inflate this budget.

## Reviewer Question

The release should let a reviewer answer: did this grant produce a real, reusable CKB privacy primitive and SDK that another CCC application could realistically integrate? The decisive evidence is the cross-layer Pudge flow and the second SDK consumer, not the size of the wallet UI.
