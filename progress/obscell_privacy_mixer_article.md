# Introducing Obscell Privacy Mixer: a zero-knowledge withdrawal mixer prototype on Nervos CKB

Hello everyone,

I have been building **Obscell Privacy Mixer**, a privacy-preserving mixer prototype on Nervos CKB. It is currently running as an MVP on **Pudge testnet**, and I would like to share what has been built, how the current deposit and withdrawal flow works, the external infrastructure I have studied or used, and the areas where I would like direct feedback from the CKB community.

The short version: a user joins a fixed-denomination deposit pool, receives an encrypted private note, and later uses that note to generate a zero-knowledge withdrawal proof. The withdrawal can be submitted through a relayer, so the wallet that originally deposited does not have to pay the withdrawal transaction fee and reveal the link between deposit and withdrawal.

Repository: https://github.com/willy264/ckb-privacy-mixer  
Hosted MVP: https://ckb-privacy-mixer-frontend.vercel.app/  
Network: Pudge testnet  

---

## The problem

On-chain transfers are public by default. If a wallet deposits into a contract and later withdraws from that same contract using the same wallet or a directly linked transaction path, the privacy benefit is weak. A mixer needs to separate those two actions:

- the deposit must prove that a fixed amount entered the pool,
- the withdrawal must prove membership in the pool,
- the withdrawal must not reveal which deposit belongs to the withdrawing user,
- and the user must remain in control of the private data needed to withdraw.

The hardest UX part is not only the zero-knowledge proof. It is the user's private note.

Each deposit generates private values such as `secret` and `nullifierSecret`. These values are needed later to produce the withdrawal proof. If the user loses the encrypted note or forgets the password, the frontend cannot reconstruct the proof. If those values leak, someone else may be able to withdraw.

So the design has to balance privacy, usability, and self-custody.

---

## What Obscell Privacy Mixer does

For a depositor:

- Connect a JoyID wallet on Pudge testnet. 
- Join a fixed `100 CT` deposit pool.
- Generate private note secrets locally in the browser.
- Encrypt the note with a user-provided password.
- Save the encrypted note before submitting the deposit.
- Wait for the coordinator-backed pool to finalize.
- Save the finalized encrypted withdrawal note.

For a withdrawer:

- Import the encrypted note.
- Enter the note password.
- Decrypt the note locally in the browser.
- Generate a Groth16 withdrawal proof locally.
- Submit the withdrawal through the relayer for the private path.
- Use the nullifier registry to prevent replay or double withdrawal.

The relayer pays the withdrawal transaction fee, but it cannot redirect the withdrawal output because the recipient binding is part of the proof/public input design.

---

## Current MVP status

The MVP currently supports:

- JoyID wallet connection.
- Live `100 CT` deposit flow on Pudge testnet.
- Coordinator-backed deposit pools.
- Four-participant pool finalization.
- Client-side generation of `secret`, `nullifierSecret`, commitment, and nullifier.
- Password-encrypted deposit notes.
- PBKDF2-SHA256 key derivation.
- AES-256-GCM note encryption.
- No plaintext note storage in localStorage.
- No backend database custody of withdrawal notes.
- Pending recovery note before deposit submission.
- Finalized encrypted withdrawal note after pool finalization.
- Browser-side Groth16 proof generation.
- Relayer-assisted private withdrawal.
- Advanced direct-broadcast withdrawal option with a privacy warning.
- Nullifier tracking to prevent replay.
- Contract tests for pool, nullifier registry, ZK membership, and withdrawal integration.

The latest contract test run passed:

```bash
cargo test --locked -p tests -j 1
```

Result:

```text
21 passed; 0 failed
```

---

## How the deposit flow works

The deposit flow is split into two stages: note preparation and on-chain pool participation.

First, the frontend generates the private note material locally. The user enters a password, and the app encrypts the note before the deposit is submitted. This gives the user a recovery artifact before any irreversible on-chain action happens.

Then the user submits the deposit into the coordinator-backed pool. When the pool reaches the target number of participants, the coordinator prepares the shared transaction and asks each participant to sign their own input through JoyID. After all participant signatures are merged correctly, the pool finalizes and the app shows the finalized encrypted withdrawal note.

The current MVP uses a `100 CT` denomination. This is intentionally fixed for now so every withdrawal in that pool has the same amount and can share the same anonymity set.

---

## How the withdrawal flow works

The withdrawal flow starts with the encrypted note.

The user imports the encrypted note and enters the password. The app decrypts the note locally and checks that the private secrets match the deposit commitment. Then the frontend builds the Merkle membership witness, generates the Groth16 proof in the browser, and prepares the withdrawal transaction.

The public inputs currently include:

- Merkle root
- Nullifier hash
- Recipient hash

The nullifier prevents double withdrawal. The recipient hash binds the proof to the intended output, reducing the risk that a relayer or observer can front-run the withdrawal and redirect funds.

The preferred withdrawal path is **Relay Private**. In this path, the user does not broadcast the withdrawal with the original JoyID wallet. The relayer handles the transaction submission, which helps avoid linking the deposit wallet to the withdrawal action.

There is also an advanced direct-broadcast option, but the UI warns that using it can compromise privacy because the user's connected wallet would pay the withdrawal fee.

---

## How it is built

The project is organized as a monorepo:

- `contracts/`: Rust CKB contracts for the pool, nullifier registry, and Groth16 membership verifier.
- `mixer-sdk/`: TypeScript SDK and protocol runtime.
- `backend/`: Node.js services for the coordinator, deposit pool, and relayer.
- `frontend/`: React + Vite web app.
- `circuits/`: Circom/Groth16 circuit artifacts and fixtures.
- `tests/`: Rust contract tests using CKB test tooling.

The main tools and future additions are summarized below.

---

## Improvements

What I plan to improve later.

- better encrypted note backup UX,
- clearer password and recovery warnings,
- stronger verifier hardening,
- research into SP1/PLONK as a possible long-term proof-system upgrade,
- multi-denomination pools,
- and more decentralized relayer/coordinator infrastructure.

---

## How to test the MVP

1. Open the hosted app.
2. Connect a JoyID testnet wallet.
3. Go to the **Deposit** tab.
4. Select the `100 CT` pool.
5. Enter a note protection password.
6. Click **Prepare Note**.
7. Copy and save the encrypted recovery note.
8. Click **I Saved It - Submit Deposit**.
9. Wait for the pool to finalize.
10. Save the finalized encrypted withdrawal note.
11. Go to the **Withdraw** tab.
12. Paste or import the encrypted note.
13. Enter the note password.
14. Click **Prepare Proof**.
15. Click **Relay Private** for the private withdrawal path.

---

## Where this could go

The immediate goal is to make the MVP reviewable and honest. The current flow proves that a CKB mixer can combine fixed-denomination deposits, client-side note secrets, browser-side ZK proof generation, and relayer-assisted withdrawal.

The next stage is about hardening:

- better note backup UX,
- stronger password and recovery guidance,
- clearer pending/finalized note states,
- relayer decentralization,
- verifier hardening,
- and research into SP1/PLONK as a possible future proof-system path.

The project is open source and currently testnet-only. I would appreciate direct criticism, especially around the note-handling model and the verifier roadmap.

Thanks for reading.
