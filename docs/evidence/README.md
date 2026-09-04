# Screenshot Evidence

Only screenshots captured from a reproducible running build belong here. A concept screen cannot be captioned as chain evidence.

| Figure | Expected file | Caption / claim |
|---|---|---|
| 1 | `figure-1-legacy-mixer.png` | Historical original mixer UI, explicitly labeled legacy prototype |
| 2 | `figure-2-ccc-demo.png` | Current CCC-oriented application workbench and persistent simulation boundary |
| 3 | `figure-3-private-balance.png` | Current local privacy opt-in/private-balance simulation; no transaction submitted |
| 4 | `figure-4-developer-protocol.png` | Current target architecture/developer view; not live chain state |
| 5 | `figure-5-pudge-e2e.png` | Reserved for verified corrected-V1 Pudge state/transaction evidence; currently absent |
| 6 | `figure-6-second-consumer.png` | Independent `examples/payment-app` consumer importing the public `mixer-sdk` entry point; deterministic fixture only, with no live settlement |

`pnpm --filter frontend capture:evidence` captures Figures 1-4 and writes `manifest.json`. The separate `pnpm --filter obscell-payment-example capture:evidence` command captures Figure 6 and writes `figure-6-second-consumer.json` with its browser, mode, request/submission counts, size, and SHA-256. Figure 5 must remain absent until the exact Pudge runbook passes. These images prove rendered integration/UI boundaries only; none is chain evidence.

![Historical original mixer prototype](figure-1-legacy-mixer.png)

*Figure 1. Historical legacy mixer interface, preserved as prototype evidence.*

![CCC-oriented Obscell simulation](figure-2-ccc-demo.png)

*Figure 2. Current reference experience with its simulation boundary visible.*

![Simulated private balance](figure-3-private-balance.png)

*Figure 3. Deterministic local privacy opt-in and private-balance state; no transaction was submitted.*

![Corrected V1 architecture view](figure-4-developer-protocol.png)

*Figure 4. Target corrected-V1 protocol/architecture view; it is not live chain state.*

![Independent PrivacyClient consumer](figure-6-second-consumer.png)

*Figure 6. Standalone payment example consuming the public PrivacyClient with injected fixture adapters; zero transactions are submitted.*
