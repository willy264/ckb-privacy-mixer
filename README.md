# CKB Privacy Mixer 🛡️

A standalone, trustless CoinJoin-like protocol built on the **Nervos CKB** testnet. It leverages the existing deployed [Obscell](https://github.com/quake/obscell) privacy infrastructure to break the on-chain link between senders and receivers.

## Project Architecture

This repository contains the unique logic required for the mixer operation:
1. **`contracts/`**: The Rust smart contract (`mixer-pool-type`) that verifies CoinJoin invariants (fixed denominations, anonymity sets). 
2. **`mixer-sdk/`**: A TypeScript protocol SDK for negotiating mixer sessions and building transactions.
3. **`frontend/`**: The React/Vite web interface.
4. **`tests/`**: Simulated integration tests using `ckb-testtool`.

> [!IMPORTANT]
> **No Obscell Source Code:** This project operates strictly as a consumer of Obscell. It does *not* include the source code for stealth addresses (`stealth-lock`), confidential tokens (`ct-token-type`), or info cells (`ct-info-type`). Instead, it references their officially deployed **testnet addresses** dynamically. 

## Obtaining Obscell Contract Addresses

Before deploying or running live scripts, you must configure your `.env` file with Obscell's deployed Testnet pointers.
1. Copy `.env.example` to `.env`.
2. Locate the official testnet deployment hashes from the [Obscell repository documentation](https://github.com/quake/obscell).
3. Fill in the `STEALTH_LOCK_CODE_HASH`, `CT_TOKEN_TYPE_CODE_HASH`, and `CT_INFO_TYPE_CODE_HASH` variables.

## Building and Deploying the Mixer Contract

To compile the `mixer-pool-type` RISC-V binary, you need Rust configured for the CKB target.

```bash
# Compile contracts for CKB RISC-V target
make build-contracts
```
Once compiled (the binary will be in `contracts/target/riscv64imac-unknown-none-elf/release/mixer-pool-type`), deploy it to the testnet using a standard CKB deployment tool (like CKB-CLI or Lumos) and record its `TX_HASH` and `CODE_HASH` in your `.env` file.

## Running Tests

Tests use `ckb-testtool` to mock the CKB environment locally and verify our contract logic against mocked Obscell primitive responses.

```bash
# Run Rust smart contract integration tests
make test-contracts
```

To test the typescript SDK logic locally:
```bash
# Install dependencies
pnpm install

# Run SDK Simulation
npx tsx scripts/mix.ts
```
