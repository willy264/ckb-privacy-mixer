# Title

> **Historical draft:** This issue text predates the corrected-V1 audit. Its live-flow and privacy language describes the legacy prototype and is not current deployment, anonymity, or security evidence. See `docs/status.md`.

Obscell Privacy Mixer: a zero-knowledge coin mixer for Nervos CKB. 

# Body

**Project Summary:**  
Obscell Privacy Mixer is a privacy-preserving mixer on Nervos CKB that lets users deposit into a shared pool and later withdraw without revealing which deposit belongs to them. The project uses client-side secret generation, Groth16 zero-knowledge proofs, a coordinator-backed deposit pool, and a relayer-assisted withdrawal path so the user's original wallet is not linked to the withdrawal transaction.

**Tools used:**  
- `@ckb-ccc/core`
- `@ckb-ccc/joy-id`
- `mixer-sdk`
- Groth16 / arkworks
- React + Vite
- Node.js + Express
- Redis
- CKB Pudge testnet

**Current features:**  
- JoyID wallet connection for CKB testnet flows.
- Live 100 CT deposit flow on Pudge testnet.
- Coordinator-backed deposit pools with multi-participant finalization.
- Client-side generation of `secret`, `nullifierSecret`, commitment, and nullifier.
- Password-encrypted deposit notes using PBKDF2-SHA256 and AES-256-GCM.
- No note storage in localStorage or backend database.
- Pending recovery note shown before deposit submission.
- Finalized withdrawal note shown after pool finalization.
- Browser-side Groth16 withdrawal proof generation.
- Private withdrawal path through a relayer.
- Advanced direct broadcast option with a privacy warning.

**Planned features:**  
- Harden the on-chain Groth16 verifier using the `groth16-ckb` style architecture.
- Improve note backup UX while preserving non-custodial privacy.
- Multi-denomination pools.
- More robust decentralized relayer/coordinator infrastructure.
- Better recovery flow for interrupted deposits.

**Workflow: How to test:**  
1. Open the app and connect a JoyID testnet wallet.
2. Go to the **Deposit** tab.
3. Select the 100 CT pool.
4. Enter a note protection password.
5. Click **Prepare Note**.
6. Copy/save the encrypted recovery note shown on screen.
7. Click **I Saved It - Submit Deposit**.
8. Wait for the deposit pool to mint/finalize.
9. Save the finalized encrypted withdrawal note shown by the app.
10. Go to the **Withdraw** tab.
11. Paste/import the encrypted note.
12. Enter the note password.
13. Click **Prepare Proof**.
14. Use **Relay Private** for the anonymous withdrawal path.

**Deployed on:**  
Pudge testnet.

**Link to repository:**  
[[Project repository]](https://github.com/willy264/ckb-privacy-mixer)

**Link to hosted version of project:**  
[[Project link](https://ckb-privacy-mixer-frontend.vercel.app/)]

**Screenshots:**  
[Attach screenshots of Deposit password step, encrypted note step, Withdraw note import, and Relay Private flow]

**Request for feedback:**  
I am requesting feedback on the UX and security model for handling mixer withdrawal notes in a non-custodial way.

**Problems:**  
Each deposit requires private note data containing `secret` and `nullifierSecret`. These values are required later to generate the Groth16 withdrawal proof. If the user loses the note or the password, the frontend cannot reconstruct the proof and the funds may become permanently inaccessible.

The current implementation avoids backend custody and localStorage persistence. The browser generates the private secrets, derives the commitment, encrypts the note with a user-provided password, and shows the encrypted note before submitting the deposit. This protects against backend leakage, but it still leaves the user responsible for manually saving the encrypted note and remembering the password.

**Review:**  
Could reviewers check whether this note-handling model is viable for a privacy mixer on CKB? Specifically:
- Is generating and encrypting the note client-side before deposit submission the right approach?
- Is refusing backend/localStorage note storage a reasonable security tradeoff?
- Are there weaknesses in asking users to manually save encrypted note text?
- Does the pending recovery note before deposit submission make sense as a failure-recovery mechanism?

**Guidance:**  
I would like advice on better non-custodial UX patterns for storing or recovering encrypted ZK notes without exposing plaintext secrets to a centralized server. For example:
- Could JoyID, WebAuthn, or passkeys be used to encrypt/decrypt notes safely?
- Are there CKB-native patterns for private encrypted backups?
- Should the project support optional user-controlled cloud backup of encrypted notes?
- What is the safest mainstream UX for users who may lose files/passwords?
