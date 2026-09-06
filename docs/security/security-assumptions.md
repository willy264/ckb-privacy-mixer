# Security Assumptions

1. CKB consensus and script execution behave according to the pinned network version.
2. Deployed code hashes and outpoints match a reviewed, reproducibly built V1 manifest.
3. Poseidon parameters are identical across Circom, TypeScript, and any Rust/on-chain implementation.
4. The selected proof system and curve remain secure, and setup toxic waste is not available to an attacker.
5. Proof verification performs canonical Fr/Fq decoding and complete point validation.
6. CT commitments and range proofs are sound, and mint authority cannot be invoked during ordinary pool transitions.
7. At least one honest RPC/indexer path is available to a client that needs independent verification.
8. A user's browser/runtime and backup password are not compromised while secrets are generated or used.
9. Fixed denomination reduces amount linkage but does not eliminate timing, network, wallet, or pool-size correlation.
10. Coordinators and relayers may be fully malicious; safety cannot depend on their databases or honesty.

Any changed assumption requires a protocol version or an explicit review finding, not a silent configuration change.
