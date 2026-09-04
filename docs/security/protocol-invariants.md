# Protocol Invariants

1. Exactly one live PoolState and sibling Vault exist for a V1 pool identity.
2. Pool ID, asset ID/type, denomination, tree depth, and protocol version are immutable.
3. Every accepted state transition consumes the current PoolState/Vault pair and produces exactly one valid successor pair.
4. Every transition increments the sequence by exactly one.
5. Acceptance consumes only confirmed staging cells for the same pool/asset/denomination and appends each exact staged leaf once in deterministic input order.
6. Acceptance increases Vault CT and outstanding accounting by the exact accepted denomination total; it does not change nullifier state.
7. Refund leaves PoolState and Vault unchanged and returns the unchanged CT asset after the committed timeout to the committed refund lock.
8. Withdrawal uses a currently accepted root, proves the frozen nine-signal statement, and changes one nullifier from absent to spent.
9. Withdrawal preserves the commitment frontier/root and decreases Vault/outstanding value by exactly one denomination.
10. Withdrawal creates one exact recipient-controlled output with the pool CT type/value and committed capacity reserve.
11. The action hash binds state sequence, root, nullifier, pool/asset/value, recipient, recipient CT data, protocol output index, and Vault delta.
12. Relayer-added inputs and change are untyped capacity only and are excluded only where the action schema explicitly permits fee variability.
13. Every Fr/Fq integer is canonical; malformed values are rejected rather than reduced.
14. Proof points are canonical, non-infinity, on-curve, and in the correct subgroup.
15. A submitted transaction is not a committed operation until observed in the canonical chain under the configured confirmation/reorg policy.
