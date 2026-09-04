# Pudge End-To-End Runbook

**Status:** Acceptance procedure only. It has not yet passed for corrected V1.

## Preconditions

- Clean checkout at the release commit and a verified V1 deployment manifest.
- Tool versions matching the manifest; all local tests pass.
- Two independently controlled CCC-compatible user signers plus isolated fee/deployment accounts.
- A pre-existing user-owned CT cell of the exact pool asset and denomination.
- Empty service databases/Redis and saved canonical genesis checkpoint.
- Screen recording/evidence directory contains no private keys, plaintext notes, or passwords.

## Reproduction Commands

Exact deploy/E2E commands remain blocked until V1 scripts and harness exist. The release must replace this statement with checked-in commands; operators must not adapt legacy `deploy-*` or backend-mint commands and call the result V1.

The stable local preflight is:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:contracts
```

## Required Scenario

For every step, record wall-clock UTC time, tool/process, real transaction hash/outpoint if produced, block number/hash, decoded relevant cells, and result.

1. Locate and decode a pre-existing user-owned supported CT cell.
2. Build a staging transaction through the SDK/CCC adapter.
3. Approve it with the user's injected CCC signer.
4. Observe canonical staging confirmation.
5. Show coordinator discovery from chain data, not an API registration claim.
6. Build deterministic acceptance from the live PoolState/Vault pair.
7. Observe confirmed successor PoolState/Vault.
8. Verify the exact staged commitment appears in the authoritative root/frontier transition.
9. Sync the local note from chain events and mark it accepted only now.
10. Generate the withdrawal proof locally and record time/peak memory/artifact hashes without secrets.
11. Verify recipient, action, root, nullifier, and state are bound in the typed intent.
12. Submit and observe Pool script proof verification.
13. Decode the nullifier absent-to-spent transition.
14. Verify Vault decreases by exactly one denomination and preserves the CT type/conservation proof.
15. Decode one exact recipient-controlled CT output.
16. Spend that CT output with the recipient's normal CCC signer and confirm it.
17. Resubmit the same withdrawal and record deterministic replay rejection.
18. Mutate the recipient and record rejection without broadcasting an unsafe transaction where local/script test evidence suffices.
19. Build against the prior PoolState/Vault and record stale-state rejection/input conflict.
20. Stop services, delete only their verified operational Redis/database state, restart from genesis checkpoint, and compare rebuilt roots/nullifiers/operations with chain state.

## Additional Negative Evidence

Wrong pool, asset, denomination, value, root, action, sequence, vault delta, recipient CT data/index, proof point, field encoding, fee asset, and fee ceiling must each fail independently. A competing coordinator test must show at most one acceptance commits; the loser re-resolves current state. A reorg test must show checkpoint rollback before notes or operations return to spendable/committed.

## Completion Rule

A returned transaction hash, mempool acceptance, coordinator status, or screenshot alone is not completion. All 20 assertions must have chain-decoded evidence and the release test report must link it. Secrets are redacted, but public cells and hashes must remain independently verifiable.
