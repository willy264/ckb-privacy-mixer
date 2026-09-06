# Research And Design Record

**Status:** Living engineering record, updated 2026-09-05. It describes the repository honestly; it is not a security audit or deployment report.

## 1. Problem Statement

CKB applications already have connectivity, transaction, and signer infrastructure through CCC. Requiring every application to understand note secrets, Merkle paths, proof ABIs, nullifiers, CT conservation, coordinators, and relayers prevents privacy from becoming reusable infrastructure. Obscell's goal is a privacy-specific SDK that consumes injected CCC primitives and hides those internals without weakening on-chain enforcement.

## 2. CKB Privacy Landscape And Research

CKB's Cell Model separates ownership in lock scripts from state-transition rules in type scripts. Type scripts execute for both consumed and created script groups, which is the basis for an authoritative singleton PoolState transition. Type ID provides a unique immutable reference for that state. Primary references are the [CKB transaction structure RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md), [genesis script list](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0024-ckb-genesis-script-list/0024-ckb-genesis-script-list.md), and [CKB RFC 0002](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0002-ckb/0002-ckb.md).

The local `obscell-source/` checkout supplied CT-token, CT-info, stealth-lock, simulator, and deployment research. It is gitignored external source, not silently vendored corrected-V1 code. Its techniques require protocol-specific review before reuse.

The repository's earlier landscape and CCC research remains in `progress/august_week_1_research_report.md`. This document supersedes its protocol recommendations where the later audit found authority or binding gaps.

## 3. Original Obscell V1

The original prototype combined fixed `100 CT` cells, browser-generated secret material, encrypted recovery notes, a coordinator-backed four-party round, a depth-20 Poseidon tree, browser Groth16 proving, a flat nullifier registry, and direct or relayed withdrawal submission. This was real implementation work and is preserved under the `legacy-demo` label.

## 4. Original Architecture

```text
frontend/JoyID
  -> backend-assisted CT mint and participant registration
  -> Redis/file-backed deposit round
  -> shared finalization transaction
  -> coordinator commitment list
  -> browser reconstruction and legacy proof
  -> standalone proof output + flat nullifier update
```

Useful work included CCC transaction building, address handling, witness merging, proof packing, local AES-GCM note encryption, recovery flows, and contract test scaffolding.

## 5. Audit Findings

1. Coordinator-held commitments produced the effective Merkle set; no authoritative PoolState root existed on chain.
2. The pool, proof receipt, nullifier registry, vault asset/value, and recipient payout were not one atomically enforced state transition.
3. The legacy circuit exposed only root, nullifier, and recipient; asset, denomination/value, pool identity, action context, and state sequence were absent.
4. The legacy circuit binds a chosen recipient scalar into its proof, but the transaction builder can independently choose/override the payout lock. No script derives the public recipient value from the actual output, so end-to-end recipient binding is incomplete.
5. The verifier reduced field and curve-coordinate bytes modulo their fields and checked curve membership without complete canonical, infinity, and subgroup rejection.
6. The backend minted CT in the public deposit request path using owner authority rather than consuming a pre-existing user-owned CT cell.
7. Legacy relayer input was a prepared transaction-shaped object, allowing too much client control and offering no robust fee/asset isolation boundary.
8. Redis and file persistence were used for round truth. A clean rebuild from canonical chain history was not available.
9. Some memory/preview helpers returned hash-shaped fabricated identifiers. These must fail explicitly instead.

## 6. Why The Original Design Was Insufficient

A membership proof is only useful if its root is protocol-authoritative. A nullifier is only anti-replay if its transition is inseparable from a valid payout. A confidential asset is only conserved if the exact vault decrement and exact recipient CT output are checked in the same transaction. The prototype demonstrated component mechanics, but an attacker could target the missing relationships between components.

## 7. Corrected V1

Corrected V1 has three authoritative cell roles:

- `PoolStateCell`: immutable pool/asset/denomination identity, sequence, Merkle state/root history, nullifier state commitment, and accounting counters.
- `VaultCell`: exact CT type, commitments/value accounting, and capacity reserves covenanted to the PoolState transition.
- `StagingDepositCell`: user-signed commitment to pool, asset, fixed denomination, leaf, refund lock, and timeout before acceptance.

Each pool starts under a fresh V1 identity. Legacy roots, registries, deployments, and operator assumptions are never migrated.

## 8. Protocol State Machine

```text
user CT --user CCC signature--> confirmed staging
confirmed staging + live PoolState + live Vault --acceptance--> successor PoolState + Vault
expired staging --refund signer/since--> unchanged CT returned to refund lock
accepted note + proof + live PoolState + live Vault --withdrawal--> successor state/vault + recipient CT
```

Every PoolState transition increments `sequence` exactly once. A transaction built against an already consumed PoolState/Vault pair loses the CKB input race and is stale. Services report acceptance/withdrawal as committed only after observing canonical confirmation.

## 9. Cryptographic Design

The withdrawal circuit freezes nine public signals in this order: `poolDomain`, `assetDomain`, `denomination`, `value`, `root`, `nullifierHash`, `recipientDomain`, `actionHash`, `authTag`.

Private witnesses are `secret`, `nullifierSecret`, `pathElements[20]`, and `pathIndices[20]`. Required relations are:

```text
value = denomination
leaf = Poseidon(LEAF_TAG, poolDomain, assetDomain, denomination, secret, nullifierSecret)
leafIndex = sum(pathIndices[i] * 2^i)
nullifierHash = Poseidon(NULLIFIER_TAG, poolDomain, nullifierSecret, leafIndex)
authTag = Poseidon(AUTH_TAG, secret, recipientDomain, actionHash)
```

Merkle nodes also include a node tag, pool domain, and numeric level. External Fr/Fq values use fixed-width canonical encoding and are rejected if out of range; decoders do not reduce malformed input modulo a field. Proof points require canonical coordinates, non-infinity, curve, and subgroup checks.

## 10. CT Conservation Model

The pool is fixed to one exact CT type and denomination. Acceptance moves one staged CT denomination plus its output-capacity reserve into the Vault. Withdrawal moves exactly one denomination and reserve from the Vault to one recipient-controlled output with the same CT type. The relayer may add only untyped CKB fee inputs and untyped change; its CT balance cannot fund or receive the payout.

CT scripts must independently enforce issuance identity, transfer conservation, canonical commitments, range proofs, and a versioned witness ABI. Corrected V1 cannot be deployed before the current CT verifier/RNG and mint-authority findings are resolved.

## 11. Nullifier Model

The nullifier includes pool identity, the private nullifier secret, and the leaf index. Including the index prevents one secret from ambiguously authorizing multiple positions; including the pool prevents cross-pool reuse. V1 targets a sparse-Merkle commitment in PoolState with a proven absent-to-spent update. A flat ever-growing registry remains legacy-only.

## 12. Merkle Model

The tree depth is fixed at 20. Leaves are already domain-separated commitments. Each internal node binds the pool and level. PoolState owns the frontier, next leaf index, current root, and a bounded root-history policy. Clients and indexers reconstruct paths from confirmed chain events, but only a root accepted by live PoolState can authorize withdrawal.

## 13. Proof-System Comparison

One disposable local Groth16 measurement has run against the corrected 19,220-constraint circuit. It is useful sizing evidence, not a production setup or a CKB-VM benchmark. PLONK-family and STARK/zkVM candidates have not been integrated, so the comparison remains incomplete and no final production choice is claimed.

| Candidate | Expected strengths | Costs / open questions | Current decision |
|---|---|---|---|
| Groth16 / BN254 | Small proof, existing Circom and Arkworks work, predictable verifier | Circuit-specific trusted setup, verifier hardening, new artifact ceremony | Provisional V1 baseline, not final until measured |
| PLONK-family | More reusable setup and easier circuit evolution in some stacks | Larger/complex verifier and uncertain CKB-VM integration in this repo | Benchmark candidate |
| STARK / zkVM (including SP1-style approaches) | Transparent or general computation options | Proof/verifier size, CKB cycles, memory, toolchain, and browser proving risk | Research candidate, not V1 dependency |

The benchmark must use the actual corrected depth-20 workload and record proving wall time, peak memory, proof size, verifier binary size, CKB-VM cycles, setup assumptions, artifact reproducibility, deployment steps, and maintenance/toolchain risk. Groth16 remains V1 only if that evidence is favorable.

| Required measurement | Groth16 | PLONK-family | STARK / zkVM |
|---|---|---|---|
| Proof generation time | 1,430.74 ms, local Node/snarkjs | Not measured | Not measured |
| Peak prover memory/resources | 637,692 KiB process max RSS; 4,375 ms user CPU, 422 ms system CPU | Not measured | Not measured |
| CKB-VM verification cycles | Not measured for corrected verifier | Not measured | Not measured |
| Proof/verifier binary size | 256-byte Arkworks ABI; disposable zkey 8,920,196 bytes, WASM 3,801,703 bytes, VK JSON 2,725 bytes; no corrected CKB verifier binary | Not measured | Not measured |
| Deployment complexity | New circuit-specific artifacts/verifier expected | Candidate integration not built | Candidate integration not built |
| Trusted setup | Circuit-specific setup expected for Groth16 | Depends on selected scheme/setup | Usually transparent, candidate-specific |
| Maintainability | Existing Circom/Arkworks knowledge, hardened ABI still required | Toolchain/CKB support unvalidated | Toolchain/browser/CKB support unvalidated |
| Reproducibility | Legacy setup is incomplete; V1 procedure pending | Pending | Pending |
| CKB-VM compatibility | Legacy verifier runs; corrected cost/security pending | Unproven in this repository | Unproven in this repository |

The measurement ran on Windows x64 with Node `25.8.1`, snarkjs `0.7.6`, Circom `2.2.3`, and source SHA-256 `573B18DF964D3A3055E3A657ACEFD97AE0D26256565677E0539D5F7BDD6267C9`. The proof verified locally in 15.70 ms using snarkjs. The power-15 setup was generated without a secure contribution ceremony and deleted afterward; its output must never be deployed. The checked-in measurement helper is `circuits/v1/benchmark/measure-groth16.mjs`.

## 14. CCC Integration Research

CCC exposes `Client`, `Signer`, and `Transaction` as separate core primitives. Its current guidance constructs outputs with `Transaction.from`, completes capacity and fees through a signer, and broadcasts through `signer.sendTransaction`. A signer owns a client, but Obscell still accepts the application-selected client explicitly so deployment/network validation occurs before signing. Sources: [CCC quick start](https://docs.ckbccc.com/en/docs/getting-started/quick-start), [Signer concept](https://docs.ckbccc.com/en/docs/concepts/signer), and [CCC source](https://github.com/ckb-devrel/ccc).

The SDK therefore receives an injected `ccc.Client`; methods requiring wallet authority receive an operation-scoped `ccc.Signer`. JoyID, connector React, signer selection, and wallet UI remain outside the SDK.

## 15. SDK Architecture

`PrivacyClient` coordinates capability checks, chain sync, local notes, protocol validation, and service boundaries. A typed prover interface and proof ABI exist, but no callable corrected-V1 proof workflow is exposed and the capability remains unavailable. Internal modules separate `core`, `protocol`, `crypto`, `merkle`, `nullifier`, `notes`, `prover`, `ccc`, `services`, and `validation`. The public API exposes fixed-pool operations instead of raw witnesses or arbitrary value selection. Verified sync results use a store-level atomic checkpoint compare-and-swap, so two clients sharing state cannot silently overwrite a newer snapshot; durable encrypted storage and cross-process atomicity remain application responsibilities.

## 16. Coordinator And Relayer Trust Model

The coordinator discovers confirmed staging cells, resolves the current Type-ID PoolState/Vault pair, deterministically orders inputs, and proposes acceptance. Competing coordinators are resolved by ordinary CKB input conflicts. The relayer accepts a typed intent, resolves current state itself, recomputes protected fields, rebuilds the transaction, enforces a fee ceiling, and adds only untyped capacity.

Redis is queue/cache/lock state only. Restart or deletion may require replaying work, but cannot erase or alter commitments, roots, nullifiers, or balances.

## 17. Threat Model

Primary attackers are malicious users, coordinators, relayers, indexers, RPC providers, compromised web origins, and observers correlating time/network metadata. Protected assets include CT conservation, withdrawal authorization, note secrets, protocol liveness, and accurate application claims. The detailed model is in `docs/threat-model.md`.

## 18. Testing Strategy

The target strategy layers tests across Circom, Rust/CKB, TypeScript SDK, services, CCC adapters, encrypted state, browser UI, and Pudge. The current suite covers the corrected circuit relation, strict field/proof parsing, SDK state/encoding boundaries, shared SDK/backend wire data, service mutation/liveness checks, and fail-closed covenant structure. Rust tests also harden the legacy verifier's canonical coordinate, infinity, curve, and subgroup rejection. Current V1 contract tests do **not** exercise successful PoolState initialization, acceptance, withdrawal, nullifier update, or CT conservation: those branches deliberately reject until the cryptographic transition logic is connected. Complete independently recomputed cross-language vectors, mutation coverage, and Pudge tests remain deployment gates.

## 19. Pudge Validation Plan

The decisive test begins with a pre-existing user-owned supported CT cell and ends with the recipient spending the withdrawn CT through CCC. It also requires replay, recipient mutation, stale state, and Redis-wipe rebuild failures/successes. Exact evidence requirements are in `docs/pudge-runbook.md`. A transaction hash alone is not sufficient evidence.

## 20. Rejected Alternatives

- **Coordinator as root authority:** rejected because service compromise or data loss would change protocol truth.
- **Backend mint as deposit:** retained only as historical demo machinery; rejected for normal V1 deposits because it exposes issuance authority and is not user-funded shielding.
- **Standalone proof-receipt output:** rejected because proof validity was not atomic with state, vault, nullifier, and payout.
- **Flat nullifier list:** rejected for unbounded growth and weak composition with PoolState.
- **Trusting client action fields:** rejected; the Pool script must derive them from actual inputs/outputs.
- **Relayer-supplied payout CT:** rejected; the Vault is the only privacy asset source.
- **Hidden testnet clients/private-key SDK API:** rejected because it bypasses application network and signer control.
- **Migrating legacy state:** rejected because identities and assumptions differ.
- **Arbitrary amounts/join-split in V1:** rejected to keep the first reviewable protocol fixed-denomination and one-note.

## 21. Limitations

Corrected V1 currently has source-level and fail-closed covenant foundations but no deployable cryptographically connected on-chain transition set, trusted setup, non-fixture Pudge state verifier/scanner, or real Pudge end-to-end evidence. See `docs/known-limitations.md`. Nothing in this repository should be described as production-secure.

## 22. Future V2 Work

Only after V1 review and testnet evidence: arbitrary denominations, multiple assets, private-to-private transfer, multi-input/multi-output join-split, shielded change, advanced recipient privacy/stealth, decentralized service discovery, additional proof systems, mobile-specific storage/proving, governance, and mainnet readiness. These items are explicitly outside the $15,000 V1 scope.
