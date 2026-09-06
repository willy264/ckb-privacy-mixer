# Obscell Documentation

| Document | Purpose |
|---|---|
| [Status](status.md) | Evidence-based implementation matrix |
| [Architecture](architecture.md) | System, flow, trust-boundary, and SDK diagrams |
| [Proposal diagram assets](diagrams/README.md) | Rendered target diagrams embedded in the Word proposal |
| [Protocol V1](protocol-v1.md) | Consensus statement and state-machine specification |
| [Research](research.md) | Architecture evolution, alternatives, and decisions |
| [Threat model](threat-model.md) | Assets, actors, threats, mitigations, and assumptions |
| [SDK](sdk.md) | Public API and module responsibilities |
| [Integration guide](integration-guide.md) | Add Obscell to an existing CCC application |
| [Pudge runbook](pudge-runbook.md) | Reproducible testnet acceptance procedure |
| [Deployment](deployment.md) | Versioned deployment and manifest rules |
| [Test vectors](test-vectors.md) | Cross-language vector contract |
| [Test report](test-report.md) | Commands and results actually executed |
| [Known limitations](known-limitations.md) | Current blockers and out-of-scope work |
| [Grant proposal](grant-proposal.md) | $15,000 / four-month grant scope |
| [Grant-ready Word proposal](../Obscell_CKB_Community_DAO_Proposal_15K_Grant_Ready.docx) | Black-and-white reviewer-facing DOCX in the official 13-section structure, with original-color evidence and diagrams |
| [Implementation report](implementation-report.md) | Before/after account and remaining work |
| [Screenshot evidence](evidence/README.md) | Captures and what each one proves |

Normative language (`MUST`, `MUST NOT`, `SHOULD`) is used only in the protocol and deployment specifications. Dated progress reports under `progress/` remain historical records and may describe superseded designs.

Regenerate and validate the Word proposal from its authoritative Markdown source with `python scripts/build-grant-proposal-docx.py`. After Word refreshes and repaginates the file, `python scripts/build-grant-proposal-docx.py --finalize-page-count N` can cache Word's verified total for non-Word previewers.
