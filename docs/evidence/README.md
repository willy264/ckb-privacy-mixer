# Evidence Catalog

This directory separates rendered product/integration evidence from blockchain evidence. A screenshot is never enough to prove transaction settlement, protocol correctness, or security.

## Evidence classes

| Class | Meaning |
|---|---|
| **HISTORICAL** | Preserved earlier implementation or interface; useful as prior-work evidence, not corrected-V1 authority |
| **SIMULATION** | Deterministic local UX/integration behavior; no live privacy settlement is implied |
| **LOCAL TEST** | Behavior exercised by source-controlled tests in a stated environment |
| **TESTNET EVIDENCE** | Actual CKB execution with reproducible commands, transaction/cell data, block context, decoded transitions, and confirmations |
| **INDEPENDENT REVIEW** | A named external review with a disclosed scope, findings, and disposition |

Figures 1-4 were captured by `pnpm --filter frontend capture:evidence`. Figure 6 was captured separately by `pnpm --filter obscell-payment-example capture:evidence`. Their machine-readable metadata is in [`manifest.json`](manifest.json) and [`figure-6-second-consumer.json`](figure-6-second-consumer.json).

## Figure register

| Figure | File / state | Class | Source and recorded version | What it demonstrates | What it does **not** demonstrate |
|---|---|---|---|---|---|
| **1 - Previous prototype** | [`figure-1-legacy-mixer.png`](figure-1-legacy-mixer.png) | HISTORICAL + local capture | `frontend/scripts/verify-demo.mjs`, legacy route; recorded commit `73d85a8f9b7330dbeb265dba281ff1bb3c218dcb`, dirty worktree, 2026-09-04 | The earlier mixer interface and preserved starting point | Corrected protocol, authoritative roots, live settlement, or production security |
| **2 - Current CCC demo** | [`figure-2-ccc-demo.png`](figure-2-ccc-demo.png) | SIMULATION | Current reference application; same recorded commit/capture run | Privacy opt-in, CCC/application ownership boundary, persistent simulation labels | A shield transaction, signer use, proof execution, or chain confirmation |
| **3 - Private-balance flow** | [`figure-3-private-balance.png`](figure-3-private-balance.png) | SIMULATION | Deterministic `DemoPrivacyClient`; same recorded commit/capture run | The intended shield/private-note/private-balance interaction and stage labels | A real balance, accepted commitment, proof, transaction, or anonymity property |
| **4 - Protocol view** | [`figure-4-developer-protocol.png`](figure-4-developer-protocol.png) | SIMULATION / design visualization | Target protocol view; same recorded commit/capture run | User CT -> Staging -> PoolState/Vault -> proof/nullifier -> recipient CT design and explicit non-chain boundary | Deployed cells, a valid state transition, proof verification, or recipient payout |
| **5 - Corrected-V1 Pudge E2E** | **Intentionally absent** | TESTNET EVIDENCE pending | Must be produced only by the completed [`pudge-runbook.md`](../pudge-runbook.md) at a clean release commit | When added, it must accompany real staging, acceptance, withdrawal, decoded deltas, recipient CT, and recipient subsequent-spend evidence | A mockup, fixture, isolated hash, or mempool response can never satisfy this figure |
| **6 - Separate consumer** | [`figure-6-second-consumer.png`](figure-6-second-consumer.png) | SIMULATION / LOCAL TEST | `examples/payment-app/scripts/verify-example.mjs`; recorded commit `73d85a8f9b7330dbeb265dba281ff1bb3c218dcb`, dirty worktree, 2026-09-04 | A separate applicant-authored workspace imports the public `mixer-sdk` entry point and injects its own fixture client/store/indexer/verifier; verifier records zero fetch/XHR data requests and zero submissions | Third-party adoption, a live CCC adapter, deployed protocol, private payment, or chain settlement |

## Captures

![Historical original mixer prototype](figure-1-legacy-mixer.png)

*Figure 1. Previous Obscell prototype, preserved as historical/reference evidence and not presented as corrected V1.*

![CCC-oriented Obscell simulation](figure-2-ccc-demo.png)

*Figure 2. Current application-facing demo with its local simulation boundary visible.*

![Simulated private balance](figure-3-private-balance.png)

*Figure 3. Deterministic local privacy opt-in and private-balance state; no transaction was submitted.*

![Corrected V1 protocol view](figure-4-developer-protocol.png)

*Figure 4. Target corrected-V1 protocol visualization; it is not live chain state.*

> **Figure 5 is intentionally absent pending verified corrected-V1 Pudge E2E evidence.**

![Separate PrivacyClient consumer](figure-6-second-consumer.png)

*Figure 6. Standalone payment example consuming the public `PrivacyClient` with injected fixture adapters; zero transactions are submitted.*

## Integrity and provenance

Together, the two JSON manifests record browser version, capture time, command, byte length, SHA-256, network/submission counts, Git commit, and dirty-worktree status; the reference-demo manifest also records its viewport. The Figure 6 capture script fixes desktop/mobile viewports even though its manifest does not contain a separate viewport key. The current PNG byte lengths and hashes match those manifests. These local manifests are useful drift checks, but they are not externally anchored attestations and must not be described as tamper-proof provenance.

Before a grant release, recapture from a clean, immutable release commit and publish the commit ID plus CI/run links. Figure 5 additionally requires the transaction/cell evidence, decoded state transitions, block hashes/heights, confirmation policy, tool versions, and artifact hashes defined by the Pudge runbook. No private keys, note secrets, nullifier secrets, passwords, or plaintext backups may appear in evidence.
