# Proposal Diagrams

These raster diagrams were generated locally from the target architecture documented in [`docs/architecture.md`](../architecture.md). They are retained here as standalone technical assets; the funding proposal and its packaging tools are intentionally not tracked.

Every diagram is labeled **TARGET ARCHITECTURE - NOT DEPLOYMENT EVIDENCE**. They explain the proposed system; they do not prove corrected-V1 deployment, transaction settlement, CT conservation, or security review.

| File | Purpose |
|---|---|
| `system-architecture.png` | Existing CKB application -> CCC -> PrivacyClient -> corrected V1 -> CKB/Pudge |
| `deposit-flow.png` | User-owned 100 CT staging and authoritative acceptance path |
| `withdrawal-flow.png` | Accepted note, local proof, atomic withdrawal, recipient CT, and subsequent spend |
| `state-vault-relationship.png` | PoolState/Vault sibling provenance and synchronized successor relationship |
| `sdk-integration.png` | Application-owned CCC Client/Signer and optional PrivacyClient boundary |
| `trust-boundary.png` | User-local, operational/non-authoritative, and CKB-authoritative boundaries |

Regenerate the PNG files from the local proposal tooling rather than hand-editing them so the technical diagrams remain aligned.
