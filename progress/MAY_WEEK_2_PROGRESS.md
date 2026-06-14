# Project Progress Summary: May 2026 (Week 2)
**Project:** CKB Privacy Mixer

### Overview
This week focused entirely on finalizing the off-chain **Relayer** and **Coordinator** infrastructure. By removing all demonstration mocks and implementing live RPC integration and real multi-party WebSocket state, the application has completed the transition from a local proof-of-concept to a production-ready, decentralized privacy protocol.

### Key Milestones Achieved

#### 1. Off-Chain Relayer Infrastructure (Fee Abstraction)
*   **Relayer Service:** Created an Express-based HTTP Relayer to accept ZK proofs from the frontend. This breaks the on-chain link between the user's withdrawal and their public wallet identity.
*   **Live RPC Broadcast:** Upgraded the Relayer to stop returning mock hashes and instead utilize a funded `RelayerWallet` and `@ckb-lumos/lumos` RPC to assemble and broadcast the withdrawal transaction to the network.
*   **Decentralized Registry:** Integrated an on-chain registry reader so the frontend can dynamically discover available relayers instead of relying on centralized endpoints.

#### 2. WebSocket Coordinator (Multi-Party CoinJoin)
*   **Live Aggregation Pools:** Transitioned the SDK's single-player mocked CoinJoin into a fully live WebSocket Coordinator. The backend now securely groups participants into pools based on denomination.
*   **CSPRNG Shuffling:** Enforced Fisher-Yates shuffling for all output stealth addresses so the Coordinator itself remains blind to input/output links.
*   **Lumos Transaction Building:** Replaced the Coordinator's mocked transaction builder with real JSON payload construction, successfully formatting the aggregated inputs and locks for the CKB node's `send_transaction` RPC endpoint.

#### 3. Frontend Production Hardening
*   **JoyID Integration:** Wired the frontend's WebSocket client to invoke `@joyid/ckb`'s `signRawTransaction` popup the moment the multi-party pool is full, securely collecting genuine ECDSA signatures rather than auto-generating mock signatures.
*   **State Alignment:** Ensured the frontend state receives the real `sessionCommitments` from the Coordinator's broadcast event and correctly anchors them into the encrypted local `DepositNote` for subsequent Merkle proof generation.
*   **Bundle Optimization:** Eliminated deep Node.js `Buffer` dependencies in the coordinator payload parser, migrating to browser-native string-hex decoding to guarantee Vite production builds run without heavy polyfills.

#### 4. Security & Production Hardening
*   **Database Persistence:** Integrated `ioredis` to replace ephemeral Node.js `Map` structures in the Relayer, ensuring that withdrawal job queues survive server restarts and allowing the backend to scale horizontally.
*   **Relayer DoS Protection:** Implemented local `snarkjs.groth16.verify` to mathematically prove the Zero-Knowledge payloads before hitting the CKB RPC. Added a Redis-backed distributed lock (`SETNX`) on `nullifierHex` to prevent concurrent double-spend queueing.
*   **Schema Validation & Rate Limiting:** Installed `zod` to strictly enforce payload shapes and hexadecimal boundaries. Integrated Lumos `helpers.parseAddress` to validate user stealth outputs, and wrapped all endpoints in `express-rate-limit` to prevent API brute-forcing.

### Current Status
The Trustless CKB Privacy Mixer is now feature-complete, zero-knowledge verifiable, fully fee-abstracted, and **production-ready**. All network mocking has been removed, memory leaks plugged, and the backend is wired to execute real CKB RPC transactions securely.
