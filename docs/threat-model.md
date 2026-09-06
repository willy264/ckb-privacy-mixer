# Threat Model

**Scope:** Corrected fixed-denomination Obscell protocol V1 on CKB Pudge. The legacy demo is evidence, not part of the trusted V1 design. This is an internal threat model, not an independent audit.

## Security Objectives

1. Only the owner of an accepted note can authorize its withdrawal.
2. One accepted note yields at most one fixed-denomination payout.
3. The payout preserves pool, CT asset, value, recipient, and protected transaction context.
4. PoolState, Vault, commitment root, and nullifier state transition atomically.
5. Off-chain services cannot invent protocol state or redirect/fund the payout.
6. Note and nullifier secrets remain within user-controlled encrypted client state.
7. Stale, replayed, malformed, and non-canonical inputs fail closed.
8. Applications can accurately distinguish planned, submitted, and committed operations.

## Assets And Adversaries

Assets are Vault CT, user withdrawal authority, note secrets, state availability, proof integrity, and honest evidence. Adversaries include malicious depositors/withdrawers, a compromised coordinator or relayer, a dishonest indexer/RPC, a compromised frontend origin, proof/circuit attackers, CT issuers, and passive network/chain observers.

## Threats

The controls below describe requirements for the completed protocol. The status column prevents a target control from being mistaken for current protection.

| Threat or failure | Required rejecting/recovery layer | Current status |
|---|---|---|
| Replayed withdrawal or nullifier reuse | Circuit binds a pool/index-derived nullifier; PoolState proves an atomic SMT absent-to-spent transition | Circuit foundation; SMT/script pending |
| Wrong or unaccepted Merkle root | Pool script derives the permitted current/retained roots from canonical PoolState | Script pending |
| Wrong CT asset | Immutable pool configuration plus exact staging, Vault, and recipient CT type checks | Structural checks; CT completion pending |
| Wrong denomination or value | Circuit checks `value = denomination`; scripts derive configured value and exact Vault/output delta | Circuit foundation; script/CT completion pending |
| Recipient substitution | Circuit authorization tag binds recipient/action; Pool script recomputes both from the actual output/transaction | Circuit and SDK foundation; script pending |
| Action-hash or typed-intent mutation | Canonical action derivation, proof binding, relayer reconstruction, byte-level transaction inspection | SDK/service foundation; non-fixture Pudge inspector/script pending |
| Malformed proof or public encoding | Exact proof/public ABI, canonical Fr/Fq ranges, strict field count/order, no modular reduction | SDK/Rust parser tests; corrected verifier pending |
| Invalid, infinity, off-curve, or wrong-subgroup proof point | On-chain verifier performs canonical-coordinate, non-infinity, curve, and subgroup checks before pairing | Legacy verifier hardening tests; corrected verifier pending |
| Stale PoolState/Vault | Exact outpoints and sequence, ordinary CKB input conflict, client-store checkpoint CAS | SDK/service/store foundation; live script/reorg evidence pending |
| PoolState/Vault mismatch | Both scripts require the exact sibling pair and synchronized successor sequence/accounting | Structural foundation; successful transitions pending |
| Vault lookalike or false provenance | Pinned PoolState type hash, pool ID, asset ID, code refs, unique input/output shape | Structural foundation; deployment evidence pending |
| Fake CT mint or forged identity | Versioned issuance authority and exact CT type identity | CT remediation pending |
| CT inflation, underpayment, or conservation failure | CT range/conservation proof plus exact PoolState/Vault arithmetic and recipient output | CT remediation pending |
| Unauthorized staging acceptance | Resolve a canonically confirmed staging cell and validate all committed fields in the atomic acceptance transition | Covenant/service foundation; scanner and transition pending |
| Premature or redirected refund | Relative `since`, committed refund lock, unchanged CT commitment/value/capacity | Structural refund path tested with placeholder asset; real CT evidence pending |
| Relayer network-fee manipulation or typed fee input/change | User network-fee ceiling, transaction reconstruction, untyped CKB-capacity-only fee inputs and change | Service validation tests; non-fixture Pudge inspector pending |
| Coordinator fabrication or race | Chain discovery, deterministic outpoint order, singleton input conflict; losing worker re-resolves | Interface/planner foundation; live competing-worker evidence pending |
| Redis loss changes protocol truth | Redis remains queue/cache/lock only; scanner rebuilds roots/nullifiers/operations from canonical chain | Interface foundation; clean rebuild pending |
| Service restart or uncertain broadcast | Typed lifecycle, locally derived canonical hash, retained nullifier lock, chain reconciliation | Local lifecycle tests; Pudge-capable hasher/worker pending |
| Chain reorganization | Block-hash checkpoints, rollback to common ancestor, replay canonical events, demote notes/operations | Scanner/recovery pending |
| Encrypted note corruption or loss | Authenticated encryption, versioned backup/recovery, corruption tests, no service copy | Legacy AES-GCM and V1 abstraction; durable V1 store pending |
| Secret exfiltration to service/logs | Local generation/proving; service DTOs omit secrets; telemetry rules and leak tests | Typed interfaces exist; persistent-store and leak-test completion pending |
| Recipient output cannot be spent | Exact recipient output construction followed by a mandatory spend with the recipient's independent CCC signer | Pudge acceptance gate |
| Fake success or fabricated evidence | Typed operation lifecycle; `committed` only from canonical observation; manifests/runbook disclose evidence class | V1 service foundation and honest UI labels; release evidence pending |
| Wallet/browser compromise | Least-secret API, authenticated storage, CSP/reproducible build, user guidance | Least-secret corrected-V1 API and honest labels exist; CSP and clean-release reproducibility remain pending, and a malicious signer/origin is outside full protocol protection |
| Timing, network, and anonymity-set correlation | Fixed notes, optional relayer, operational guidance, explicit privacy limitations | Residual risk; no absolute anonymity claim |
| Denial of service | Permissionless candidate builders, refund timeout, bounded state/witnesses/batches | Protocol implementation pending |

## Privacy Properties And Non-Properties

The intended property is unlinkability between one accepted fixed-denomination staging deposit and one later recipient payout within the available anonymity set, subject to timing, network, service, wallet, and CT metadata leakage. V1 does not hide that the pool asset and denomination are used. It does not provide private-to-private transfers, shielded change, arbitrary amounts, IP-layer anonymity, malicious-browser protection, or protection after note-secret compromise.

## Review Gates

- Independent circuit and CKB-script review.
- Reproducible proving/verifying artifacts and manifest hashes.
- CT issuance/conservation/range-proof review.
- Complete negative and mutation tests.
- Pudge flow including recipient subsequent spend, replay, mutation, stale state, reorg, and clean service rebuild.
- Removal of all fabricated success paths and secret-bearing logs.

Supporting documents: [trust model](security/trust-model.md), [attack surface](security/attack-surface.md), [assumptions](security/security-assumptions.md), and [protocol invariants](security/protocol-invariants.md).
