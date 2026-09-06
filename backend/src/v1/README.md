# Corrected V1 Service Boundary

This directory is an isolated, tested foundation. It is not connected to the legacy HTTP/Waku routes and cannot submit a corrected-V1 transaction until the fail-closed PoolState/Vault/Staging foundations are completed, deployed, and backed by production adapters.

- `validation.ts`: strict typed withdrawal intent, canonical Fr/Fq and refund encodings, retained-root/stale-state, pool/asset/value, recipient/action, fee, and untyped fee-input checks.
- `relayer.ts`: resolves chain state, derives protected fields, reconstructs rather than trusts a client transaction, requires an independent inspector, derives the canonical transaction hash before broadcast, retains nullifier locks when submission outcome is uncertain, and tracks queued/validated/submitted/committed.
- `coordinator.ts`: reads untrusted confirmed-staging observations, quarantines malformed/wrong-pool/duplicate entries, and orders up to 16 valid acceptance inputs deterministically.
- `types.ts`: explicit chain snapshot, intent, plan, operation, and staging contracts.

Implementations of `V1RelayerChainReader` and `V1CoordinatorChainReader` must obtain truth from canonical CKB cells and checkpointed chain history. Redis may implement `V1OperationStore`, but that store is duplicate protection and progress only. A Redis wipe must not change pool roots, Vault value, commitments, nullifiers, or whether a note is accepted.

The legacy `backend/src/coordinator/deposit-pool.ts` remains prototype code. Do not adapt its Redis/file commitment list into a V1 chain reader.

No production `V1TransactionInspector` or submitter/hasher is included yet. Those adapters must decode the actual CCC transaction and CT witness/data and derive its canonical hash locally, rather than echoing planner metadata or trusting an RPC response. Consequently this V1 relayer foundation is not live-wirable or safe to submit transactions until the adapters and corrected scripts exist.
