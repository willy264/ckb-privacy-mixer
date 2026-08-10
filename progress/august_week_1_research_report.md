# Obscell - August Week 1 Research and Upgrade Planning Report

**Period:** August 1-7, 2026  
**Focus:** Research and planning for upgrading Obscell from a mixer MVP into CCC-compatible privacy infrastructure.  
**Input brief:** `progress/progress_plan/Obscell_CCC_Privacy_Infrastructure_Project_Brief.docx`  
**Status:** Planning only. No application code should be changed yet.

---

## 1. Executive Summary

The project direction is now clearer: Obscell should no longer be treated only as a standalone privacy mixer or as another wallet. The upgrade should move the project toward **privacy infrastructure for Nervos CKB**.

The core deliverable should become a reusable **Obscell Privacy SDK** or CCC-compatible privacy module. The wallet/app should remain, but its role should change into a **reference implementation** that demonstrates how applications can use the SDK.

The target mental model is:

```text
Existing Obscell protocol and mixer primitives
        ->
Privacy core / protocol engine
        ->
Obscell Privacy SDK
        ->
CCC-compatible integration layer
        ->
Reference wallet + example dApps
```

The important upgrade rule is: **preserve the working privacy primitives first, then extract them into reusable modules, then reshape the UI around the SDK**.

---

## 2. Sources Reviewed

### Local project brief

- `progress/progress_plan/Obscell_CCC_Privacy_Infrastructure_Project_Brief.docx`

The brief defines the new direction:

- move from "privacy mixer prototype" to "CKB privacy infrastructure",
- make the SDK/module the primary deliverable,
- make the wallet the reference implementation,
- use CCC as the integration foundation,
- keep current mixer primitives as the protocol base,
- migrate incrementally instead of rewriting the project blindly.

### CCC sources

- CCC documentation: https://docs.ckbccc.com/en/docs/
- CCC introduction: https://docs.ckbccc.com/en/docs/getting-started/introduction
- CCC API reference: https://api.ckbccc.com/
- CCC code examples: https://docs.ckbccc.com/en/docs/code-examples
- CCC GitHub repository: https://github.com/ckb-devrel/ccc
- CCC Playground: https://live.ckbccc.com/
- CCC App: https://app.ckbccc.com/
- CCC machine-readable docs index: https://docs.ckbccc.com/llms.txt
- CCC agent skill guidance: https://docs.ckbccc.com/skill.md

The CCC docs are especially useful because they show CCC as a modular TypeScript SDK for CKB. The machine-readable docs describe core primitives such as cells, transactions, signers, clients, and addresses. They also document package separation between core packages, wallet connectors, React connector bindings, protocol SDKs, and examples.

The important CCC lesson for Obscell is that the privacy layer should not replace CCC wallet/transaction primitives. It should consume them.

### RAILGUN sources

- RAILGUN privacy system: https://docs.railgun.org/wiki/learn/privacy-system
- RAILGUN Wallet SDK overview: https://docs.railgun.org/developer-guide/wallet/wallet-overview
- RAILGUN SDKs: https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks

RAILGUN is useful as an architectural reference, not as a direct design to copy. Its docs separate the privacy system, wallet SDK, private balances, broadcasters, private transfers, shielding, unshielding, and integration/cookbook patterns. The relevant idea for Obscell is the separation between low-level privacy infrastructure and the wallets or dApps that consume it.

---

## 3. Current Repository Snapshot

The current repository is a pnpm workspace with three TypeScript workspace packages:

```yaml
packages:
  - mixer-sdk
  - frontend
  - backend
```

The wider repository also includes Rust contracts, circuits, scripts, tests, and supporting tooling:

```text
backend/        Express coordinator, relayer, deposit services, scripts
frontend/       Vite React app and current mixer UI
mixer-sdk/      Current TypeScript SDK around deposit/withdrawal operations
contracts/      CKB scripts for pool, nullifier, registry, ZK membership
circuits/       Circom mixer circuit and proving artifacts
tests/          Rust contract/integration tests
scripts/        Build/deploy/support scripts
tools/          Rust helper tools
progress/       Reports, plans, and project documentation
```

### Current package roles

#### `mixer-sdk`

Current role:

- exposes `MixerClient`,
- exports deposit and withdrawal operations,
- contains note, proof, pool, withdrawal, and config types,
- contains crypto, Merkle, proof, RPC, SNARK, and stealth utilities,
- contains Waku and withdrawal providers.

Current public shape:

```text
mixer-sdk/src/client.ts
mixer-sdk/src/core/session.ts
mixer-sdk/src/operations/deposit.ts
mixer-sdk/src/operations/withdraw.ts
mixer-sdk/src/providers/waku.ts
mixer-sdk/src/providers/withdrawal.ts
mixer-sdk/src/types/*
mixer-sdk/src/utils/*
```

This package is the best starting point for the upgrade. It already contains much of the privacy logic that should eventually become `privacy-core`, `privacy-protocol`, or `privacy-sdk`.

#### `frontend`

Current role:

- Vite + React app,
- JoyID-based wallet flow,
- deposit and withdrawal tabs,
- encrypted note handling,
- relayer/coordinator calls,
- withdrawal proof preparation.

Important current files:

```text
frontend/src/App.tsx
frontend/src/components/DepositTab.tsx
frontend/src/components/WithdrawTab.tsx
frontend/src/hooks/useDepositFlow.ts
frontend/src/hooks/useWithdrawalFlow.ts
frontend/src/vault.ts
frontend/src/withdrawal.ts
frontend/src/relayer.ts
frontend/src/coordinator.ts
frontend/src/joyid.ts
frontend/src/runtime.ts
```

This frontend should become the reference wallet. The first refactor should remove protocol logic from UI hooks/components and make the app call SDK methods instead.

#### `backend`

Current role:

- Express HTTP relayer,
- coordinator server,
- deposit pool coordination,
- live deposit services,
- registry client,
- scripts for deployment and CKB interaction,
- Redis support,
- Waku support,
- CCC-based backend scripts and relayer wallet utilities.

Important current directories:

```text
backend/src/coordinator/
backend/src/deposit/
backend/src/registry/
backend/src/relayer/
backend/src/scripts/
backend/src/utils/
```

The backend should not become the SDK. It should provide protocol services consumed by the SDK or reference wallet: coordinator, relayer, registry, and potentially sync/indexing services.

#### `contracts`, `circuits`, and `tests`

Current role:

- `circuits/mixer.circom` defines the Groth16 mixer membership proof circuit.
- `contracts/zk-membership-type` verifies Groth16 proof data on CKB.
- `contracts/nullifier-type` handles nullifier registry behavior.
- `contracts/mixer-pool-type` and `contracts/registry-type` support pool/registry mechanics.
- Rust tests cover pool behavior, nullifier behavior, ZK membership verification, and withdrawal integration.

These should remain close to the protocol layer. They are not frontend concerns and should not be hidden inside wallet UI code.

---

## 4. Direction From the Brief

The upgrade should not begin by redesigning the UI. It should begin by clarifying the architecture.

The existing app is valuable because it already proves a working flow:

1. Generate local secrets.
2. Create a private note.
3. Encrypt note data.
4. Deposit into a fixed-denomination pool.
5. Finalize the pool.
6. Reconstruct membership state.
7. Generate a ZK withdrawal proof.
8. Submit through a relayer.
9. Prevent replay with a nullifier registry.

The upgrade should extract this behavior into reusable modules.

Target deliverables:

1. **Privacy SDK:** primary deliverable for developers.
2. **CCC integration layer:** adapts CCC signer/client/transaction primitives into the privacy SDK.
3. **Reference wallet:** current app evolved into a wallet-like demonstration of the SDK.
4. **Examples:** small CKB apps that show how to add Obscell privacy without copying the reference wallet.
5. **Documentation:** architecture, SDK usage, integration examples, security assumptions, and threat model.

---

## 5. CCC Research Findings

CCC should be treated as the integration foundation, not something to replace.

Relevant CCC packages and roles:

```text
@ckb-ccc/core             Core CKB primitives: client, signer, transaction, script, address.
@ckb-ccc/connector        Framework-agnostic wallet connector.
@ckb-ccc/connector-react  React provider/hooks for wallet connection.
@ckb-ccc/joy-id           JoyID wallet integration.
@ckb-ccc/shell            Node.js/backend usage pattern.
@ckb-ccc/udt              Protocol-level SDK pattern for UDT/xUDT.
@ckb-ccc/spore            Protocol-level SDK pattern for Spore.
@ckb-ccc/ssri             Protocol-level SDK pattern for contract interaction.
```

The most relevant pattern is CCC's separation between:

- core chain primitives,
- wallet/signing abstractions,
- connector UI,
- protocol-specific SDKs,
- runnable examples.

That maps well to Obscell:

```text
CCC core primitives
        ->
Obscell privacy protocol adapter
        ->
Obscell Privacy SDK
        ->
Reference wallet / dApps
```

### CCC questions to answer before coding

Before implementation starts, the next coding pass should inspect the current CCC API and source for:

1. Exact `Signer` interface shape.
2. Exact `Client` interface shape.
3. Transaction construction and completion flow.
4. How `Transaction.from`, `completeInputsByCapacity`, `completeFeeBy`, and `sendTransaction` should be used.
5. How wallet connector state is exposed in React.
6. Whether the SDK should depend on `@ckb-ccc/core` only, while the reference wallet depends on `@ckb-ccc/connector-react`.
7. Whether backend scripts should use `@ckb-ccc/shell` or continue using `@ckb-ccc/core` directly.
8. How CCC protocol SDKs such as UDT and Spore structure exports, examples, and package boundaries.

### CCC tools to use during implementation

- `https://docs.ckbccc.com/llms.txt` for navigation.
- `https://docs.ckbccc.com/skill.md` for agent guidance.
- `https://api.ckbccc.com/` for exact signatures.
- `https://docs.ckbccc.com/en/docs/code-examples.md` for example source links.
- `https://live.ckbccc.com/` for testing small transaction examples.

---

## 6. RAILGUN Research Findings

RAILGUN should be used as a model for product architecture, not as a technical clone.

Useful ideas from RAILGUN:

- privacy infrastructure is separate from wallet UI,
- private balances are a user-facing abstraction over notes/UTXOs,
- broadcasters are similar in role to Obscell relayers,
- SDKs expose developer actions rather than raw proof internals,
- dApps can add privacy features without becoming full privacy wallets,
- wallets can add a private mode rather than becoming separate privacy-only apps.

RAILGUN concepts mapped to Obscell:

```text
RAILGUN privacy system      -> Obscell protocol and privacy engine
RAILGUN Wallet SDK          -> Obscell Privacy SDK
Private balances            -> Obscell shielded account/private balance abstraction
Broadcasters                -> CKB relayer abstraction
Shielding/unshielding       -> Obscell deposit/withdraw protocol flow
Cookbook/examples           -> CCC-based Obscell example integrations
Private wallet              -> Obscell reference wallet
```

Important constraint: Obscell must stay CKB-native. CKB's Cell Model, CCC's transaction model, CKB scripts, current Groth16 verifier, nullifier registry, and relayer/coordinator mechanics are the actual design constraints.

---

## 7. Target File Structure

The brief proposes a clean target structure:

```text
apps/
  reference-wallet/
  examples/
packages/
  privacy-core/
  privacy-protocol/
  privacy-sdk/
  privacy-ccc/
  privacy-relayer/
  privacy-types/
contracts/
circuits/
tests/
docs/
  architecture/
  sdk/
  integration/
```

This is the long-term target, not the first edit.

The safer incremental path from the current repo is:

```text
frontend/                  -> eventually apps/reference-wallet/
mixer-sdk/                 -> split gradually into packages/privacy-*
backend/                   -> keep as services for coordinator/relayer/registry
contracts/                 -> keep as protocol contracts
circuits/                  -> keep as protocol circuits
tests/                     -> expand into protocol/sdk/ccc/integration areas
progress/                  -> continue project reports/plans
docs/                      -> add when SDK documentation begins
```

### Proposed first package split

Instead of creating every target package immediately, start with three internal boundaries inside `mixer-sdk`:

```text
mixer-sdk/src/core/         Pure privacy primitives and state logic
mixer-sdk/src/protocol/     Obscell-specific pool, note, proof, nullifier flows
mixer-sdk/src/ccc/          CCC adapter types and transaction integration
mixer-sdk/src/sdk/          Public developer-facing PrivacyClient API
```

After the boundaries stabilize, they can become separate workspace packages:

```text
packages/privacy-core
packages/privacy-protocol
packages/privacy-ccc
packages/privacy-sdk
packages/privacy-relayer
packages/privacy-types
```

This avoids a large package explosion before the real API boundaries are proven.

---

## 8. Proposed SDK Shape

The SDK should hide mixer internals behind privacy actions.

Conceptual public API:

```ts
const privacy = createPrivacyClient({
  cccClient,
  signer,
  network,
  coordinatorUrl,
  relayerUrl,
  contracts,
});

await privacy.shield({ asset, amount });
await privacy.sync();
const balance = await privacy.getShieldedBalance();
await privacy.transfer({ recipient, asset, amount });
await privacy.unshield({ recipient, asset, amount });
```

Internal capabilities that the SDK should manage:

- note generation,
- note encryption/decryption,
- commitment derivation,
- nullifier derivation,
- Merkle witness construction,
- Groth16 proof generation,
- withdrawal public input serialization,
- relayer request construction,
- coordinator/pool interaction,
- registry/nullifier checks,
- transaction status tracking.

The SDK should expose lifecycle states:

```text
idle
preparing
awaitingSignature
submitted
pooling
finalized
syncing
proving
relaying
confirmed
failed
```

Applications should not need to manually inspect raw proofs, raw note secrets, or circuit internals for common flows.

---

## 9. Tools Needed

### Current tools to keep

```text
pnpm workspaces       Monorepo package management.
TypeScript            SDK, frontend, backend.
Vite + React          Current reference wallet/frontend.
Express               Current coordinator/relayer backend.
Redis/ioredis         Locks and job/replay protection support.
Waku                  Existing decentralized messaging experiment.
Circom/snarkjs        Current Groth16 circuit/proof workflow.
circomlibjs           Poseidon/hash utilities in TypeScript.
Rust/Cargo            CKB contracts and tests.
ckb-testtool          Contract testing.
Docker                Backend deployment/local service packaging.
```

### CCC tools to use

```text
@ckb-ccc/core             Required for SDK-level CKB primitives.
@ckb-ccc/connector-react  Recommended for the reference wallet UI.
@ckb-ccc/connector        Possible framework-agnostic connector support.
@ckb-ccc/joy-id           Keep for JoyID integration.
@ckb-ccc/shell            Evaluate for backend scripts.
CCC API TypeDoc           Exact API reference.
CCC code examples         Integration patterns.
CCC Playground            Quick transaction/prototype verification.
```

### Tools to consider adding later

```text
tsup or unbuild        Cleaner multi-package SDK builds.
Vitest                 TypeScript SDK unit tests.
Playwright             Reference wallet end-to-end flow tests.
Typedoc                SDK API documentation.
Zod                    Public SDK input validation and typed errors.
Changesets             Versioning if SDK packages are published.
```

These should be added only when the package boundaries are clear.

---

## 10. Design Path for the Reference Wallet

The UI should stop leading with "mixer" as the main user concept. It should present a privacy account model while keeping protocol transparency available for advanced users.

Suggested information architecture:

```text
Overview / Private Balance
Shield
Send Privately
Receive
Unshield
Activity
Recovery
Network / Relayer Status
Advanced Protocol Details
```

### UX rules

- Ordinary users should not have to understand Merkle roots, nullifiers, or Groth16 details.
- The app should still explain what privacy does and does not hide.
- Recovery/export should be treated as security-critical.
- Private and public paths should be clearly separated.
- Relayer-assisted withdrawal should remain the recommended privacy path.
- Direct broadcast should stay advanced/debug-only with a warning.
- Proof generation should have visible progress and failure recovery.
- Encrypted note/state handling should remain non-custodial.

### Suggested language changes

Current mixer wording can gradually shift:

```text
Deposit       -> Shield
Withdraw      -> Unshield
Note          -> Recovery key / encrypted privacy state
Mixer pool    -> Privacy pool / shielded set
Relay private -> Private submit / relayed submit
```

The technical docs can still use exact terms like commitment, nullifier, Merkle proof, and Groth16 proof.

---

## 11. Migration Plan

### Phase 0: Audit before code changes

Map the current implementation without editing code:

- trace frontend deposit flow,
- trace frontend withdrawal/proof flow,
- trace backend deposit endpoints,
- trace relayer endpoints,
- trace coordinator pool lifecycle,
- trace SDK exports,
- trace current CKB transaction construction,
- trace current note encryption/decryption,
- trace current contract/circuit test assumptions.

Output of this phase should be an architecture map.

### Phase 1: Stabilize names and boundaries inside `mixer-sdk`

Do not rename the package yet. First create internal boundaries:

```text
core/       cryptographic primitives and local privacy state
protocol/   Obscell pool/proof/nullifier/withdrawal rules
ccc/        CCC adapter layer
sdk/        public `PrivacyClient`
```

Expected result: existing frontend still works, but protocol logic starts moving away from UI.

### Phase 2: Define the SDK API

Create a developer-facing API around privacy actions:

- `shield`,
- `sync`,
- `getShieldedBalance`,
- `preparePrivateTransfer`,
- `transfer`,
- `unshield`,
- `exportEncryptedState`,
- `importEncryptedState`.

Exact names should wait until the current flow is traced.

### Phase 3: Introduce CCC adapter

The SDK should accept CCC dependencies instead of owning wallet connection:

```ts
createPrivacyClient({
  client,
  signer,
  network,
});
```

Reference wallet should use CCC connector/React tooling for wallet connection. SDK should depend on core primitives, not React.

### Phase 4: Refactor frontend into SDK consumer

Change the current app so deposit/withdraw screens call SDK methods instead of directly owning protocol operations.

The frontend becomes the reference wallet, not the place where protocol behavior lives.

### Phase 5: Create examples

Add small examples only after SDK calls are stable:

- minimal CCC app with private shield action,
- minimal private transfer example,
- backend/server-side example only if user secrets are not exposed,
- playground-friendly example if possible.

### Phase 6: Documentation and hardening

Add:

- SDK getting started,
- API reference,
- architecture guide,
- integration guide,
- privacy assumptions,
- threat model,
- recovery guide,
- deployment guide for coordinator/relayer.

---

## 12. Security and Privacy Requirements

The upgrade must not weaken the existing privacy rules.

Required constraints:

- never store plaintext note secrets in localStorage,
- never log private note data, proof witnesses, secrets, nullifier secrets, or decrypted metadata,
- keep secret generation client-side unless a new protocol design explicitly changes that,
- keep encrypted state authenticated with AES-GCM or equivalent authenticated encryption,
- keep password/key derivation explicit and configurable,
- prevent relayer redirection through proof/recipient binding,
- prevent nullifier replay,
- validate Merkle roots and withdrawal public inputs,
- keep coordinator/relayer metadata separate from private client state,
- document timing, relayer, coordinator, and anonymity-set assumptions.

The term "incognito" should not be used as a security claim unless the docs clearly define what is hidden and what remains observable.

---

## 13. Testing Strategy

### SDK tests

Add TypeScript tests for:

- note encryption/decryption,
- commitment derivation,
- nullifier derivation,
- Merkle proof construction,
- proof public input serialization,
- SDK input validation,
- lifecycle state transitions,
- typed error handling.

### Protocol tests

Keep and expand Rust tests for:

- pool behavior,
- nullifier registry behavior,
- ZK membership verification,
- withdrawal integration,
- invalid proof rejection,
- replay rejection.

### CCC adapter tests

Add tests/mocks for:

- signer injection,
- client injection,
- transaction construction,
- transaction signing flow,
- fee/input completion assumptions,
- network config handling.

### Reference wallet tests

Eventually add end-to-end tests for:

- connect wallet,
- shield,
- recovery/export,
- proof preparation,
- relayed unshield,
- error handling,
- direct broadcast warning.

---

## 14. Risks and Open Questions

### Architectural risks

- Splitting packages too early may create churn before the real SDK boundary is known.
- Leaving protocol logic inside frontend hooks will make the SDK only cosmetic.
- Depending on React connector packages inside the SDK would make it harder for non-React apps to use.
- Naming everything around "mixer" will limit adoption by wallet/dApp developers.

### Protocol risks

- Current fixed `100 CT` denomination is an MVP limitation.
- Current coordinator-backed pool remains centralized.
- Relayer availability and trust assumptions need clearer documentation.
- Groth16 trusted setup and verifier hardening remain future work.
- Browser-side proving performance needs validation as the UX becomes more wallet-like.

### CCC questions

- What exact CCC types should the SDK accept publicly?
- Should Obscell publish as one package first or multiple packages?
- Should the first SDK be called `obscell-sdk`, `privacy-sdk`, or scoped packages later?
- How much of the current `mixer-sdk` should be renamed in the first migration?
- Which CCC example style is best for a future Obscell playground example?

---

## 15. Recommended First Milestone

The first upgraded milestone should be modest and concrete:

```text
Goal:
Make the existing reference wallet call a new PrivacyClient API while preserving the current testnet deposit/withdraw behavior.

Deliverables:
1. Internal SDK boundary inside current `mixer-sdk`.
2. `PrivacyClient` wrapper around current deposit/withdraw operations.
3. CCC adapter design document or minimal adapter types.
4. Frontend calls the SDK instead of owning protocol internals.
5. Existing contract tests still pass.
6. Frontend build still passes.
7. Updated docs explaining SDK-first direction.
```

This avoids a risky rewrite and proves that the SDK can actually support the app.

---

## 16. Proposed Work Breakdown

### Research complete this week

- Read the Obscell CCC Privacy Infrastructure brief.
- Extracted links from the `.docx` file.
- Reviewed CCC docs, examples, machine-readable docs, and agent guidance.
- Reviewed RAILGUN privacy-system and SDK documentation as an architecture reference.
- Inspected the current repo structure and package boundaries.
- Identified `mixer-sdk` as the likely migration starting point.
- Identified the frontend as the future reference wallet.
- Identified backend services as coordinator/relayer/registry infrastructure, not the SDK itself.

### Next planning tasks

1. Create a current-flow map for deposit and withdrawal.
2. Create a type map for note, commitment, nullifier, proof, Merkle witness, relayer request, and transaction.
3. Identify which current frontend functions belong in SDK/core/protocol.
4. Identify which current backend calls should become SDK provider interfaces.
5. Read CCC TypeDoc/source for exact `Signer`, `Client`, and `Transaction` types.
6. Draft the first `PrivacyClient` interface.
7. Decide whether the first implementation stays inside `mixer-sdk` or starts a new `packages/privacy-sdk`.

---

## 17. Final Recommendation

The upgrade should be done in this order:

1. **Understand and preserve the current mixer MVP.**
2. **Extract reusable privacy logic from frontend-owned flows.**
3. **Wrap existing behavior in a developer-facing Privacy SDK.**
4. **Add CCC adapter boundaries.**
5. **Turn the current app into the reference wallet.**
6. **Add small example integrations after the SDK is real.**
7. **Then improve UX, denominations, relayer decentralization, verifier hardening, and proving systems.**

The north-star statement from the brief should guide implementation:

> Obscell should make privacy an opt-in capability that CKB applications can integrate through a developer-friendly SDK, using CCC as the foundation for CKB connectivity rather than requiring every application to implement the privacy protocol itself.

For August Week 1, the work should remain research and planning only. The next code phase should start with a careful flow audit and a small internal SDK boundary, not a broad rewrite.
