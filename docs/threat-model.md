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

| Threat | Required control | Current status |
|---|---|---|
| Forged or unaccepted Merkle root | Pool script compares proof root with live/retained PoolState roots | Script pending |
| Double withdrawal | Atomic absent-to-spent nullifier update in PoolState | SMT/script pending |
| Recipient substitution | Proof auth tag plus script-recomputed recipient/action domains | Circuit foundation; script pending |
| Asset/value substitution | Immutable pool config, exact CT type, `value = denomination`, vault delta checks | SDK/circuit foundation; scripts pending |
| Vault inflation or underpayment | CT conservation/range proof plus PoolState/Vault arithmetic | CT remediation pending |
| Stale-state race | Exact PoolState/Vault outpoints and sequence; CKB input conflict; private-store checkpoint CAS | SDK/service/store foundation; scripts and persistent store pending |
| Relayer adds typed asset input/change | Rebuild transaction and allow untyped capacity only | Service validation foundation |
| Coordinator fabricates acceptance | Discover confirmed staging and validate transition on chain | Interface foundation; scanner/script pending |
| Redis loss changes truth | Rebuild from chain; Redis only queue/cache/lock | Interface foundation; rebuild pending |
| Non-canonical Fr/Fq malleability | Fixed 32-byte decoding and `< modulus` checks, no reduction | SDK/circuit rules; verifier hardening pending |
| Invalid/infinity/subgroup proof point | Canonical coordinate, nonzero, curve, subgroup validation | Verifier implementation/tests pending |
| Secret exfiltration | Local generation, authenticated encryption, no service/telemetry fields | Memory/CAS store foundation; encrypted persistent V1 store pending |
| Fake success/evidence | Typed lifecycle; hash only from submitter; committed only after chain observation | V1 services foundation; preserved legacy paths explicitly labeled |
| Reorg makes note incorrectly spendable | Checkpoint block hashes, rollback notes/roots/operations | Scanner pending |
| Frontend supply-chain compromise | Artifact pinning, CSP/reproducible build, offline verification | Pending |
| Timing/network correlation | Relayer option, operational guidance, no absolute anonymity claim | Partial; residual risk |
| Denial of service | Permissionless builders, refund timeout, bounded witnesses/state | Protocol implementation pending |

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
