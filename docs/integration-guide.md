# Integrating Obscell Into A CCC Application

This guide demonstrates the architectural boundary available today. It does not claim live corrected-V1 settlement.

## 1. Keep Existing CCC Ownership

Your application continues to create/select the CCC client and wallet signer. Obscell does not install a connector or switch networks:

```ts
import type { ccc } from "@ckb-ccc/core";
import {
  createPrivacyClient,
  InMemoryPrivacyStateStore,
  type PrivacyDeployment,
  type PrivacyServices,
} from "mixer-sdk";

declare const client: ccc.Client;
declare const signer: ccc.Signer;
declare const deployment: PrivacyDeployment;
declare const services: PrivacyServices; // includes indexer + independent stateVerifier for sync

const privacy = createPrivacyClient({
  client,
  deployment,
  stateStore: new InMemoryPrivacyStateStore(), // development only
  services,
  prover,
});
```

For a real application, replace the memory store with an authenticated, encrypted-at-rest implementation. Its `commitSync(snapshot, notes, expectedPrevious)` method must atomically compare the stored pool/block/outpoint checkpoint with `expectedPrevious` and commit the snapshot plus all note updates in one storage transaction. This compare-and-swap must work across application instances or processes sharing the database; the SDK's per-client queue does not provide that guarantee. Load `deployment` from a verified versioned manifest, not UI-controlled or untrusted remote JSON.

## 2. Gate UI With Capabilities

```ts
const capabilities = await privacy.getCapabilities();

if (capabilities.shield !== "supported") {
  // Keep live settlement disabled and explain the deployment limitation.
}
```

Current V1 foundation correctly reports settlement unavailable. Do not catch `UNSUPPORTED_OPERATION` and replace it with a local balance or fake transaction status.

## 3. Synchronize Authoritative State

```ts
const snapshot = await privacy.sync({ poolId });
const balance = await privacy.getPrivateBalance({ poolId });
const notes = await privacy.listNotes({ poolId, state: "accepted" });
```

The injected indexer must resolve live PoolState/Vault cells through the supplied client, checkpoint block hashes, and handle rollback. Its output is untrusted until the separate `services.stateVerifier` checks the live cells and block identity through the same injected client; `sync()` is unavailable without both services. The verified result is still committed conditionally, so a concurrent update produces retryable `STALE_STATE` instead of overwriting newer private state. No production indexer, verifier, or encrypted persistent store ships in this foundation. Balance includes only accepted unspent local notes whose recorded proof root remains in the authoritative window; inspect `NoteMetadata.proofStatus === "root-expired"` to schedule path/root refresh without treating the note as spent.

## 4. Supply Signers Per Operation

```ts
await privacy.shield({ poolId, signer });

await privacy.unshield({
  noteId,
  recipient: recipientAddress,
  submission: { kind: "direct", signer },
});
```

The SDK rejects a signer attached to another client instance. A relayed operation instead uses `{ kind: "relayed", maxFee }`; the relayer reconstructs the transaction and may add only untyped fee capacity.

These calls currently fail explicitly because the V1 staging/withdrawal pipelines are not connected. The examples define integration shape, not runnable settlement.

## 5. Keep Wallet/UI Concerns Outside

The application owns JoyID or other connector setup, modals, password prompts, progress UI, notifications, analytics, explorer links, and display formatting. It must never send note secrets, nullifier secrets, plaintext backups, or passwords to services or telemetry.

## 6. Second Consumer Test

`examples/payment-app` is a minimal independent consumer that imports only the public package entry point and supplies its own CCC-shaped client, transient store, indexer, verifier, and UI. Its deterministic fixture proves package/API separation and zero submission; it is not live-chain evidence. A valid release must replace those fixtures with real application-owned adapters and exercise the same public API on Pudge. Shared source copied from the reference wallet would not prove reusability.

## 7. Before Enabling Live Controls

- Manifest network/address prefix, pool Type-ID, CT script hash, domains, circuit hashes, and cell deps validate.
- Cross-language vectors and all builds/tests pass.
- The exact Pudge runbook passes, including recipient subsequent spend.
- Independent review status and unresolved findings are visible.
- Capability discovery reports the operation as supported from verified adapters, not an environment flag alone.
