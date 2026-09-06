# Project Progress Summary: April 2026

> **Historical legacy-prototype report:** Completion, deployment, and "production-ready" statements below record the April report and were not independently re-verified for corrected V1. They are not corrected-V1 deployment or security evidence. See `docs/status.md` for current status.

**Projects:** CKB Privacy Mixer & CKB Token SDK

### Overview
Throughout April, the core infrastructure for a zero-knowledge, CoinJoin-based privacy mixer on the Nervos CKB blockchain was successfully designed, developed, and deployed to the Pudge Testnet. The work spanned smart contract development in Rust, cryptographic zero-knowledge circuit design, and the creation of a robust TypeScript SDK for transaction coordination.

### Key Milestones Achieved

#### 1. Core Smart Contract Development (Rust)
*   **Mixer Pool Type:** Developed and stabilized the core validation logic for fixed-denomination (100 CT) CoinJoin transactions. The contract ensures that inputs and outputs perfectly balance without revealing sender-receiver links, utilizing Obscell's `stealth-lock`.
*   **Nullifier Registry:** Implemented the `nullifier-type` contract to manage an on-chain, append-only registry of spent deposit notes. This acts as the double-spend protection mechanism during the withdrawal phase.
*   **Optimization:** Aggressively optimized the Rust binaries using `panic="immediate-abort"` and LTO, reducing the contract sizes to fit well within CKB capacity limits.

#### 2. Zero-Knowledge Proving System
*   **Circuit Design:** Transitioned from a mock verifier to a production-ready **Groth16 / Circom** backend.
*   **On-Chain Verification:** Developed the `zk-membership-type` contract to verify Groth16 proofs natively on CKB. The contract validates Merkle membership and nullifier derivation against public inputs directly on-chain.
*   **In-Browser Proving:** Integrated `snarkjs` with the frontend SDK to allow users to generate withdrawal proofs locally in their browsers without leaking their secrets to a backend server.

#### 3. TypeScript SDK & Integration
*   **Session Coordination:** Built the `mixer-sdk` to manage MixSessions, aggregate participants, and safely shuffle inputs/outputs.
*   **Live Providers:** Engineered a provider abstraction (`AggronWithdrawalProvider`) to fetch live contract states, resolve the nullifier registry over JSON-RPC, and assemble raw, signable CKB transactions via Lumos.

#### 4. Testnet Deployment
*   **Atomic Deployment:** Refactored deployment scripts to execute multi-binary deployments in a single atomic transaction. This prevented CKB capacity consumption bugs and saved testnet funds.
*   **Live Infrastructure:** Successfully deployed all three mixer contracts (`mixer-pool`, `nullifier`, `zk-membership`) to the Aggron/Pudge Testnet.
*   **Bootstrapping:** Initialized the live `nullifier-registry` cell on-chain, preparing the network to process end-to-end ZK withdrawals.

### Next Steps (May 2026)
With the backend, cryptography, and smart contracts 100% live on the testnet, the immediate focus shifts to **Frontend Live Integration**. The next phase involves connecting Web3 wallets (e.g., JoyID), building the local "Vault" for managing encrypted deposit notes, and wiring the UI to the live testnet SDK.

### Summary of Logs
**Total Weekly Progress Logs published for April:** 4
