# How Privacy Mixer Deposit Works

> **Legacy prototype flow:** This page describes the pre-audit backend-mint/coordinator path, not corrected V1. Its live-Pudge statements are historical and are not current deployment evidence. Corrected V1 requires user-owned staging plus authoritative PoolState/Vault transitions and is not deployed; see `docs/status.md`.

## 1. Goal of the Deposit Flow

The deposit flow creates a live 100 CT mixer note on CKB Pudge testnet while keeping the user's withdrawal secrets out of backend storage.

The key rule is:

> The browser creates and encrypts the user's private note before the backend submits the deposit.

This means that if the browser, network, or backend fails after submission, the user already has a recovery artifact.

## 2. User-Facing Flow

The current frontend deposit flow has five steps:

1. **Setup**: The user selects the fixed denomination. Currently, only the 100 CT path is enabled.
2. **Password**: The user enters a note protection password.
3. **Save**: The browser generates an encrypted pending recovery note and shows it on screen. The user must copy or save it manually.
4. **Mint**: After the user confirms the note is saved, the frontend submits the live deposit request to the relayer.
5. **Finalize**: Once the coordinator pool finalizes, the frontend shows the finalized encrypted withdrawal note.

There is no automatic note download and no localStorage vault persistence. The app does not store the note or the password.

## 3. What the Frontend Generates

Before the backend receives a deposit request, the frontend creates a pending note with:

- `secret`: a random field secret generated in the browser.
- `nullifierSecret`: another random field secret generated in the browser.
- `commitment`: derived from `secret` and `nullifierSecret`.
- `nullifier`: derived from `nullifierSecret`.
- `createdAt`: the note creation timestamp.
- `status: "pending"`.
- `runtimeMode: "live"`.
- `denomination: 100`.

The user-facing note text is encrypted JSON, not plaintext. The frontend encrypts the note with the user's password using:

- PBKDF2-SHA256
- 600,000 iterations
- AES-256-GCM
- a random salt
- a random IV

The encrypted note contains KDF metadata, cipher metadata, salt, IV, ciphertext, and creation time. It does not contain the password.

## 4. Why the Note Is Prepared Before Deposit Submission

The pending recovery note is created before `POST /deposit` is called.

This ordering is intentional. If the backend submitted the deposit first and the browser crashed before showing the note, the user could lose the private secrets needed for withdrawal. By forcing the user to save the encrypted pending note first, the app gives them a recovery path before funds enter the mixer flow.

Changing the password after preparing the note clears the prepared note. This prevents the UI from showing a note encrypted with an old password while the user thinks a new password is active.

## 5. What the Backend Receives

When the user clicks **I Saved It - Submit Deposit**, the frontend calls:

```http
POST /deposit
```

with:

```json
{
  "walletAddress": "ckt...",
  "zkCommitment": "0x...",
  "noteCreatedAt": 1780000000000
}
```

The backend does not receive `secret`, `nullifierSecret`, plaintext note JSON, or the note password.

The relayer validates that `zkCommitment` is a 32-byte hex string, then calls `performLiveDeposit()`.

## 6. Backend Deposit Execution

The backend deposit service performs these steps:

1. Generates a stealth output address from the user's wallet address.
2. Reserves a participant slot in the coordinator deposit pool.
3. Runs the live CT mint command against Pudge.
4. Extracts the minted CT output metadata:
   - mint transaction hash
   - CT note input outpoint
   - CT note tree commitment
   - CT note blinding factor
5. Registers the minted participant with the coordinator using both:
   - backend mint metadata
   - frontend-generated `zkCommitment`

The coordinator stores pool/session state and marks the pool `ready` once enough participants have minted. In the current test configuration, pools are using a target participant count of 4.

## 7. Pool Finalization

Once the pool reaches the participant threshold:

1. The frontend fetches the unsigned deposit round.
2. The user signs their part with JoyID.
3. The frontend submits the signature to the coordinator.
4. The coordinator merges participant witnesses.
5. The coordinator broadcasts the finalized shared deposit transaction.
6. The frontend fetches the finalized note metadata.

The finalized note metadata from the backend deliberately contains placeholder zero secrets, because the backend never had the user's private `secret` or `nullifierSecret`.

The frontend restores the real secrets from the local pending note, verifies that the restored secrets derive the same commitment, and then encrypts the finalized withdrawal note with the user's password.

## 8. What the User Must Save

There are two possible encrypted note states:

- **Pending recovery note**: shown before the deposit is submitted. This can recover or continue a deposit if the flow is interrupted.
- **Finalized withdrawal note**: shown after pool finalization. This is the note used for withdrawal proof generation.

The finalized note is the preferred artifact to keep long term. The pending recovery note is still important until finalization has completed.

The user needs both:

- the encrypted note text
- the password used to encrypt it

If either one is lost, the frontend cannot reconstruct the withdrawal secrets.

## 9. Failure and Recovery Behavior

If the deposit request never reached the backend, importing the pending note will show that the commitment is not registered yet. The user can start a new deposit.

If the backend minted and registered the participant but the browser closed before finalization, the user can import the pending note in the withdrawal flow. The frontend decrypts it in memory, calls the recovery endpoint by commitment, and either:

- recovers the finalized note if the pool is complete, or
- rebuilds a pending deposit tracker and sends the user back to the deposit panel to continue signing/finalization.

## 10. Security Boundaries

The frontend is responsible for:

- generating private withdrawal secrets
- deriving the ZK commitment
- encrypting and displaying the note
- decrypting the note only in memory
- restoring finalized notes with the original private secrets

The backend is responsible for:

- minting the live CT output
- coordinating participant pool state
- finalizing the shared deposit transaction
- exposing recovery metadata by commitment

The backend should never receive or store:

- the note password
- `secret`
- `nullifierSecret`
- plaintext note JSON
