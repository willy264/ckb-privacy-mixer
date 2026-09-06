# Obscell

Obscell is an experimental CKB privacy protocol and SDK. Its north-star integration is:

```text
CKB application -> CCC Client + Signer -> Obscell Privacy SDK -> protocol scripts -> CKB
```

CCC owns connectivity, wallet approval, signing, transaction primitives, RPC, and indexer access. Obscell owns fixed-denomination private notes, commitments, Merkle state, nullifiers, proofs, privacy operation planning, and protocol validation.

## Current Status

This repository contains two deliberately separate tracks:

| Track | State | What it proves |
|---|---|---|
| `legacy-demo` | Historical prototype, preserved | Browser proving, encrypted-note recovery, CT experiments, coordinator/relayer mechanics, and CKB transaction construction |
| Corrected protocol V1 | Fail-closed foundation under implementation | Versioned protocol statement, strict encodings, injected-CCC SDK boundary, structural CKB covenants, and chain-authoritative service interfaces |
| Default web experience | Interactive simulation | How an existing CCC application can opt into Obscell without changing its wallet foundation |
| Independent payment example | Deterministic SDK fixture | A separate application imports the public package and injects its own CCC/state boundaries; no live settlement |
| Pudge end-to-end V1 | Not yet demonstrated | No corrected-V1 deployment, recipient CT spend, or Redis rebuild evidence is claimed |
| Independent security review | Not yet performed | Tests in this repository are not an audit |

The current deployed/prototype flow is not protocol authority for corrected V1. In particular, coordinator or Redis state must not be treated as an authoritative Merkle root, nullifier set, or vault balance.

See [implementation status](docs/status.md), [known limitations](docs/known-limitations.md), and the [legacy boundary](legacy-demo/README.md) before evaluating claims.

## Repository Map

- `contracts/`: legacy CKB scripts plus versioned corrected-V1 script work.
- `circuits/`: preserved legacy circuit/artifacts and versioned corrected-V1 circuit sources.
- `mixer-sdk/`: reusable privacy SDK and CCC adapter; legacy mixer exports are isolated at `mixer-sdk/legacy`.
- `backend/`: legacy coordinator/relayer plus isolated chain-authoritative V1 interfaces.
- `frontend/`: CCC-oriented reference experience; privacy actions remain visibly simulated.
- `examples/payment-app/`: independent public-SDK consumer using deterministic local adapters; no live settlement.
- `tests/`: CKB contract tests.
- `docs/`: architecture, protocol, SDK, security, test, deployment, and grant evidence.
- [`progress/`](progress/README.md): dated research and implementation history. These files are evidence of evolution, not current protocol claims or independently re-verified deployment evidence.

## Local Verification

Prerequisites are Node.js, PNPM, Rust/Cargo, and a Chromium-compatible browser for the demo test.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:contracts
pnpm --filter obscell-payment-example test:browser
pnpm --filter frontend test:demo
```

Individual checks and environment requirements are recorded in [the test report](docs/test-report.md). Contract builds use the pinned toolchain in `rust-toolchain.toml`.

Regenerate the explicitly simulated screenshot evidence and its hashes with:

```bash
pnpm --filter frontend capture:evidence
pnpm --filter obscell-payment-example capture:evidence
```

The evidence boundary and reserved, currently absent Pudge Figure 5 are documented in [the evidence catalog](docs/evidence/README.md).

## Run The Reference Demo

```bash
pnpm dev
```

The default page is the CCC-oriented application concept. Its privacy operations are deterministic local simulations and make no privacy transaction submission. The historical mixer is available at `?view=legacy` and is labeled as a prototype.

## Documentation

- [Architecture](docs/architecture.md)
- [Protocol V1 specification](docs/protocol-v1.md)
- [Research and design record](docs/research.md)
- [Threat model](docs/threat-model.md)
- [SDK guide](docs/sdk.md)
- [CCC integration guide](docs/integration-guide.md)
- [Pudge runbook](docs/pudge-runbook.md)
- [Deployment guide](docs/deployment.md)
- [Test vectors](docs/test-vectors.md)
- [Implementation report](docs/implementation-report.md)

Grant proposal and funding materials are maintained locally and are intentionally not tracked in this repository.

Obscell is testnet-first research software. Do not use it to protect assets of value.
