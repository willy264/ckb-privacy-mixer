# Obscell - August Week 3 Progress Report

**Period:** August 15-21, 2026

**Focus:** Build a presentation-ready interactive demo of Obscell as an opt-in privacy capability for CKB applications using CCC.

**Status:** The interactive prototype is implemented and verified. Privacy operations are intentionally simulated until the protocol-correct V1 is available.

---

## Week 3 Outcome

The Week 3 demo now answers the main product question directly:

> What would it look like if a CKB application using CCC could opt into Obscell privacy?

The frontend no longer opens on a mixer as the primary product. It opens on a normal CKB application workbench with a CCC session and Public mode selected. The viewer can enable Private mode, see Obscell appear as an added capability, shield a fixed `100 CT` note, inspect a private balance, prepare a private-payment concept, unshield the note, and inspect the developer and protocol layers behind the application view.

The existing mixer remains available as a legacy prototype at `?view=legacy`. It was not deleted or used as evidence that the new protocol is live.

---

## Product Direction Demonstrated

The demo presents this relationship:

```text
CKB application
      |
      v
CCC client + signer
      |
      v
Obscell privacy capability
      |
      v
CCC-compatible transaction plan
      |
      v
CKB
```

CCC remains responsible for wallet connection, signing, transaction primitives, RPC, and indexer access. Obscell is shown as the layer that will add private state, proof preparation, fixed-note balances, and privacy-aware operation construction.

The reference wallet is now presented as one consumer of that layer. A second `CKB Payment App` consumer uses the same demo privacy state to show that the intended capability is reusable and not tied to one wallet UI.

---

## Implementation Completed

| Area | Week 3 result |
|---|---|
| Default experience | Replaced the mixer-first entry screen with the CCC privacy-module workbench |
| Legacy preservation | Moved the existing mixer application behind `?view=legacy` and lazy-loaded it |
| Privacy client boundary | Added a strict `PrivacyClient` contract and deterministic `DemoPrivacyClient` implementation |
| Application mode | Added an interactive Public / Private segmented control without replacing the CCC session |
| Shield flow | Added a fixed `100 CT` shield simulation with staged operation progress and local balance updates |
| Private balance | Added a fixed-note private balance abstraction with available/spent note lifecycle |
| Private payment | Added an honest recipient-bound payment preview that stops at the signing boundary and does not consume the note |
| Unshield flow | Added a local note-consumption simulation that restores the public balance |
| Shared consumers | Added Reference Wallet and CKB Payment App views backed by the same privacy client state |
| Developer view | Added prototype SDK code, CCC/Obscell responsibility split, capability matrix, and architecture flow |
| Protocol view | Added masked note, commitment, root, nullifier, proof, recipient, PoolState, Vault, and staging-deposit concepts |
| Pipeline | Added intent, private state, commitment, proof, CCC transaction, signer, and chain-submit stages |
| Live CCC option | Preserved the existing JoyID connection through CCC and loads it only when requested |
| Honesty controls | Added persistent simulation labels and removed fake hashes, fake confirmations, and unsupported privacy claims from the new experience |
| Responsive behavior | Added desktop, presentation, tablet, and mobile layouts with stable controls and no horizontal overflow |
| Accessibility | Added semantic tabs, pressed states, dialog focus entry/trapping/restoration, Escape handling, live status, and reduced-motion behavior |

---

## Demo State Model

The prototype keeps application presentation state separate from privacy protocol state.

```text
Demo UI state
  view             application | developer | protocol
  consumer         reference-wallet | payment-app
  connection       local CCC fixture | connecting | live JoyID | error
  privacy mode     public | private
  dialog           shield | payment | unshield | closed
  notice           info | success | error

DemoPrivacyClient state
  public balance   100 CT -> 0 CT -> 100 CT
  private balance  0 CT -> 100 CT -> 0 CT
  notes            none | available | spent
  artifacts        masked lifecycle states only
  operations       deterministic simulated operation history
  pipeline         queued | active | complete | ready | skipped | failed
```

Disabling Private mode does not delete local note state. Switching between the two example applications also preserves the same private state. Reset returns the scenario to Public mode with `100 CT` public and `0 CT` private.

The simulation operation type cannot contain a transaction hash, block number, confirmation time, or other chain evidence. Those fields do not exist in the demo state contract.

---

## PrivacyClient Prototype

The UI uses a future-shaped client boundary rather than calling the current mixer coordinator, relayer, or proof hooks.

```ts
interface PrivacyClient {
  getCapabilities(): Promise<PrivacyCapabilities>;
  sync(input: PrivacySyncInput): Promise<void>;
  getPrivateBalance(input: PrivateBalanceInput): Promise<PrivateBalance>;
  shield(input: ShieldInput): Promise<PrivacyOperation>;
  unshield(input: UnshieldInput): Promise<PrivacyOperation>;
  getOperation(id: string): Promise<PrivacyOperation>;
  getSnapshot(): DemoPrivacySnapshot;
  subscribe(listener: PrivacyStateListener): PrivacyUnsubscribe;
}
```

`DemoPrivacyClient` implements that boundary with deterministic in-memory transitions. A payment preview uses the unshield-to-recipient purpose and stops at `ready-for-signing`. Protocol-correct V1 private-to-private transfer is not claimed or simulated as settled.

---

## Real and Simulated Boundaries

| Capability | Current demo status | User-facing treatment |
|---|---|---|
| Existing CCC/JoyID connection | Real when the viewer completes JoyID connection | `JoyID connected through CCC` plus the returned address |
| Local CCC session | Fixture | Clearly labeled `local CCC fixture` |
| Privacy enable/disable | Real UI state | Changes application capabilities without changing the wallet foundation |
| Shield | Deterministic simulation | `Shield simulation complete - no transaction submitted` |
| Private balance | Intended fixed-note abstraction | Derived only from local simulated notes |
| Private payment | Future capability preview | Stops at the signing boundary with no balance change |
| Unshield | Deterministic simulation | Consumes the local note and restores local public balance |
| Merkle root and membership | Target protocol visualization | Masked values and `not live chain state` disclosure |
| Nullifier and proof | Target protocol visualization | Lifecycle labels only; no secret or proof bytes are shown |
| PoolState, Vault, staging deposit | Target protocol V1 concepts | Never described as deployed cells |
| Transaction hash and confirmation | Not produced | No fabricated hashes, broadcasts, or confirmations appear |

The demo never passes a simulated privacy operation to the JoyID signer, coordinator, relayer, RPC, or indexer.

---

## Presentation Flow

The complete demo can be presented in approximately two to five minutes.

1. Open the workbench and identify the local CCC fixture or connect JoyID through CCC.
2. Show the normal CKB application in Public mode with `100 CT` public balance.
3. Select Private mode or `Enable privacy`.
4. Point out that the CCC connection remains unchanged while Obscell capabilities appear.
5. Open Shield, confirm the fixed `100 CT` note, and run the simulation.
6. Follow the operation pipeline and show public `0 CT`, private `100 CT`.
7. Switch to the CKB Payment App and show that the same private balance remains available.
8. Enter a recipient and prepare the private-payment concept.
9. Show that the flow stops at the signing boundary and no transaction is submitted.
10. Open Developer View and show `createPrivacyClient`, the capability matrix, and CCC responsibility split.
11. Open Protocol View and show the target staging, pool, vault, proof, nullifier, and recipient path.
12. Return to Application View, run Unshield, and show public `100 CT`, private `0 CT`.
13. Reset the demo for the next presentation.

---

## Main Files

| File | Purpose |
|---|---|
| `frontend/src/App.tsx` | Selects the default demo or lazy legacy experience |
| `frontend/src/legacy/LegacyMixerApp.tsx` | Preserved existing mixer UI |
| `frontend/src/demo/PrivacyDemo.tsx` | Demo shell, state controller, application view, and operation orchestration |
| `frontend/src/demo/types.ts` | Strict privacy capabilities, operation, note, artifact, and client contracts |
| `frontend/src/demo/client/DemoPrivacyClient.ts` | Deterministic shield, payment-preview, unshield, subscription, and reset state machine |
| `frontend/src/demo/components/ActionDialog.tsx` | Accessible fixed-note operation dialogs |
| `frontend/src/demo/components/OperationPipeline.tsx` | Interactive intent-to-chain pipeline visualization |
| `frontend/src/demo/views/DeveloperView.tsx` | Prototype integration API, responsibilities, capabilities, and architecture |
| `frontend/src/demo/views/ProtocolView.tsx` | Masked target V1 protocol and state visualization |
| `frontend/src/demo/demo.css` | Scoped responsive workbench design |
| `frontend/scripts/verify-demo.mjs` | Repeatable desktop/mobile interaction, honesty, and no-network checks |

---

## Verification Results

| Check | Result |
|---|---|
| Strict TypeScript | Passed with `pnpm --filter frontend exec tsc --noEmit --pretty false` |
| Production build | Passed with `pnpm --filter frontend build` |
| Browser interaction test | Passed with `pnpm --filter frontend test:demo` |
| Privacy-client invariants | Passed for subscriptions, chain-evidence exclusion, replay rejection, and note lifecycle |
| Privacy opt-in | Passed |
| Shield and balance transition | Passed: `100/0 -> 0/100` |
| Shared state in second app | Passed |
| Recipient validation | Passed: invalid input rejected; valid testnet CKB address accepted through CCC parsing |
| Payment preview balance conservation | Passed: remains `0/100` |
| Public/private mode persistence | Passed |
| Developer and protocol views | Passed |
| Unshield and note consumption | Passed: `0/100 -> 100/0` |
| Reset | Passed |
| Legacy route | Passed |
| Network calls during simulated privacy actions | Passed: zero fetch/XHR requests |
| Browser console/page errors | Passed: none observed |
| Fake hash and unsupported-claim scan | Passed |
| Desktop viewport | Passed at `1440 x 900` |
| Presentation viewport | Passed at `1280 x 720` |
| Mobile viewport | Passed at `390 x 844` with no horizontal overflow |
| Production entry bundle | `298.88 kB` minified; JoyID and legacy paths lazy-loaded |

The existing `pnpm --filter frontend lint` script could not run because ESLint is not installed in this workspace. Strict TypeScript, production bundling, and browser verification completed successfully. The build still reports large lazy chunks for JoyID and the legacy mixer; they are no longer part of the default application download.

---

## Mapping to the Future SDK

The demo is designed to be replaced below the UI rather than rewritten above it.

```text
Application and developer views
             |
             v
       PrivacyClient
             |
      current: DemoPrivacyClient
             |
       future: Obscell SDK
             |
             v
      injected CCC client/signer
```

The UI currently drives sync, shield, unshield, snapshots, and subscriptions through this boundary. Capability discovery, explicit private-balance reads, and operation lookup are represented in the interface for the real SDK adapter but are not yet called by the presentation controller. The protocol implementation can replace the deterministic demo client after it can provide the required behaviors with verified chain evidence.

---

## Work Remaining Before Live Privacy

The interactive demo is complete, but the privacy protocol is not live through this interface.

The replacement client still requires:

- protocol-correct PoolState, Vault, and StagingDeposit cells;
- an authoritative on-chain Merkle root and root-history policy;
- a withdrawal circuit binding the pool, CT asset, denomination, value, nullifier, recipient, and action;
- atomic nullifier, pool-state, vault, and recipient-output enforcement by CKB scripts;
- a user-owned CT staging transaction and accepted fixed-note lifecycle;
- coordinator and relayer services that derive truth from chain state;
- cross-language canonical encoding vectors;
- contract, circuit, SDK, service, reorg, replay, and end-to-end Pudge tests;
- recipient CT recovery and a verified subsequent spend.

Until those gates pass, the UI must continue to display `Prototype`, `Simulation`, and `Target protocol V1` labels.

---

## Next Steps

1. Rehearse the two-to-five-minute presentation with the local CCC fixture.
2. Verify the optional live JoyID connection in the presentation environment without invoking a privacy signer action.
3. Record final desktop and mobile captures from the verified build.
4. Keep the current mixer isolated as `legacy` and avoid using its generated statistics or privacy claims in the presentation.
5. Begin protocol V1 implementation only through the separately reviewed remediation specification.
6. Replace `DemoPrivacyClient` incrementally as each real protocol capability passes its contract and cross-layer tests.

---

## Summary

August Week 3 produced a working CCC privacy-module concept rather than another wallet or mixer screen. A viewer can start inside a normal CKB application, opt into Obscell, move a fixed CT note through a visible privacy pipeline, reuse private state in a second application, inspect the future developer API, inspect the target protocol, and return the asset to the public balance.

The demo is honest about its boundary: CCC/JoyID connectivity can be real, while shield, private balance, payment preview, unshield, proof state, and protocol cells are local simulations or target architecture. No transaction hash, chain confirmation, production claim, or secret value is fabricated.
