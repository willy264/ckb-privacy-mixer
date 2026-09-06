# Known Limitations

1. Corrected V1 has source-level PoolState, Vault, and StagingDeposit covenant foundations, but none is deployed. Pool genesis, acceptance, and withdrawal intentionally fail closed until Poseidon state updates, nullifier SMT updates, CT conservation, and proof verification are connected. The positive refund test is structural and uses a placeholder asset fixture.
2. Existing Groth16 artifacts belong to the legacy three-public-input circuit. They are not valid for corrected V1.
3. The corrected circuit has not completed a reproducible trusted setup or Pudge verification.
4. The current CT contracts require issuance, transfer, witness-ABI, canonical commitment, conservation, range-proof, and verifier-RNG review before they can secure a V1 vault.
5. The legacy coordinator and Redis/file state are operational prototype state, not protocol authority.
6. The legacy relayer accepts a prepared transaction shape. Corrected V1 typed-intent validation is isolated and has no non-fixture Pudge chain reader, transaction builder, transaction-byte inspector, canonical transaction hasher, submitter, or reconciliation worker for uncertain broadcasts.
7. A non-fixture CKB state decoder/verifier and chain scanner with checkpointed block hashes, rollback, clean rebuild, and confirmation policy are not implemented. SDK sync refuses to commit indexer observations without an injected independent state verifier and uses an atomic checkpoint compare-and-swap to reject stale concurrent commits. No encrypted persistent store implementation ships; application stores must preserve that atomicity across all clients/processes sharing their database.
8. Nullifier storage is currently a legacy flat registry; the corrected SMT transition is not implemented.
9. No corrected-V1 Pudge transaction, recipient CT output, recipient subsequent spend, replay rejection, stale-state rejection, or Redis rebuild has been demonstrated.
10. One disposable local snarkjs Groth16 proof was generated and verified for sizing. It was not a secure setup. Corrected CKB-VM verification, verifier cycles/binary size, PLONK-family, and STARK/zkVM benchmarks have not run.
11. The SDK foundation exposes unavailable capabilities honestly; it cannot settle shield/refund/unshield until protocol adapters and deployments exist.
12. The default frontend is a deterministic concept simulation. Its balances, operations, roots, and proof lifecycle are not chain evidence.
13. The code has not received an independent security audit. It is testnet-first and unsuitable for assets of value.
14. V1 intentionally excludes arbitrary denominations, multi-asset notes, shielded change, private-to-private transfer, join-split, multi-output proofs, advanced stealth addressing, governance, and mainnet deployment.
15. The current CCC transaction materializer validates the selected pool, distinct expected PoolState/Vault inputs, protected action hash, and actual recipient CT output. It is not a complete withdrawal builder or validator: successor Vault/state outputs, nullifier/proof witnesses, cell deps, capacities, and resolved fee-input types still require the non-fixture Pudge transaction inspector and on-chain scripts.
