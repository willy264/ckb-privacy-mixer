# Changelog

All notable changes are documented here. The repository has not published a corrected-V1 release.

## Unreleased - Corrected V1 Foundation

### Added

- Versioned withdrawal circuit source with nine frozen public signals and level-separated Merkle hashing.
- Privacy SDK module boundaries, injected CCC dependency model, canonical field/proof handling, and foundation tests.
- Chain-authoritative V1 coordinator and typed-intent relayer interfaces with validation tests.
- Strict no-std V1 codecs plus fail-closed PoolState, Vault, and Staging covenant foundations with ckb-testtool coverage.
- Molecule V1 state/witness schema with a fixed 288-byte public-signal structure.
- Architecture, protocol, research, threat/trust/attack-surface, SDK, integration, deployment, Pudge, vector, proposal, evidence, and implementation documentation.
- Reproducible screenshot names for the current demo evidence set.

### Changed

- Reframed the root README around the reusable Obscell privacy SDK and evidence-based status.
- Explicitly labeled the original mixer and its deployments/artifacts as `legacy-demo`.
- Unsupported memory/preview submission paths fail rather than returning hash-shaped fabricated success values.
- Legacy SDK APIs moved to the explicit `mixer-sdk/legacy` export; the package root exposes corrected V1 only.

### Security

- Documented coordinator/Redis non-authority, stale-state and protected-field requirements, canonical Fr/Fq parsing, proof-point checks, CT conservation, and independent-review gates.

### Not Yet Included

- Deployable cryptographically connected PoolState/Vault transitions, corrected proof artifacts/verifier, nullifier SMT, CT remediation, production transaction/state adapters, chain scanner/reorg support, corrected-V1 Pudge deployment/E2E, recipient subsequent spend, and independent security review.
