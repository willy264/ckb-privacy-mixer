# Trust Model

## Trusted For Correctness

- CKB consensus and canonical-chain selection.
- The exact deployed V1 script binaries and circuit verifying key whose hashes match the reviewed manifest.
- Correct cryptographic assumptions for Poseidon, BN254/Groth16 if selected, Blake2b/CKB hashing, CT commitments, and range proofs.
- User-controlled execution environment for generating and encrypting note secrets.

## Not Trusted For Protocol Authority

- Coordinator: may omit, reorder, delay, or propose invalid staging acceptance; scripts must reject invalid plans.
- Relayer: may censor, delay, overcharge, mutate, or submit stale requests; intent and scripts bind protected fields.
- Indexer/RPC: may lie or lag; clients require canonical block/transaction confirmation and can change providers.
- Redis/database: may be deleted or corrupted; it stores operational state only.
- Reference frontend: convenience software, not consensus. Advanced users must be able to validate artifacts and transactions independently.

## User Responsibilities

Users must protect encrypted note backups and passwords, verify the intended recipient/network/pool in wallet approval, and avoid treating `submitted` as `committed`. Loss of both note secrets and recovery state can make funds unrecoverable. Disclosure of secrets can allow theft.

## Service Compromise Outcomes

With correct scripts, service compromise may cause censorship, timing leakage, denial of service, duplicate work, or bad UX. It must not create an accepted commitment, mark a nullifier spent without payout, change the recipient, mint Vault value, or authorize withdrawal. These claims remain design goals until on-chain tests pass.
