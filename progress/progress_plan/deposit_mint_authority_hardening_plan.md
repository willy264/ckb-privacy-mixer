# Deposit Mint Authority Hardening Plan

**Date:** July 3, 2026  
**Status:** Planned  
**Scope:** Post-MVP backend security plan for removing mint/admin authority from the public relayer deposit path.

---

## Context

During MVP deployment testing, the live deposit flow reached the backend successfully but failed because the Render relayer was missing `OWNER_PRIVATE_KEY`.

The reason is the current MVP deposit path:

1. The frontend calls the relayer `POST /deposit` endpoint.
2. The relayer prepares a participant with the coordinator.
3. The relayer runs `mint-ct.ts`.
4. `mint-ct.ts` signs the CT mint transaction with `OWNER_PRIVATE_KEY`.
5. The relayer registers the minted note metadata with the coordinator.

This works for the MVP because it lets the backend mint test CT notes for users during a live deposit. However, it means the public relayer currently needs access to the owner/deployer private key. That is not a good long-term security model.

---

## Current MVP Tradeoff

For the MVP demo, the Render relayer may temporarily need:

```env
OWNER_PRIVATE_KEY=...
```

This is required only because the current deposit implementation mints CT inside the public relayer request path.

The coordinator should not have this key. The frontend should never have this key. The key should not be committed to the repository.

---

## Problem

The owner key is a high-authority secret. If it remains on the public relayer long term, the blast radius of a relayer compromise becomes too large.

The public relayer should eventually be responsible only for user-facing relay/deposit coordination tasks, not protocol administration or mint authority.

---

## Goals

- Remove `OWNER_PRIVATE_KEY` from the public relayer service.
- Keep the coordinator free of private wallet keys.
- Keep the relayer hot wallet limited to `RELAYER_PRIVATE_KEY` only.
- Move CT mint/admin authority into an offline, internal, or tightly controlled flow.
- Avoid long blocking deposit HTTP requests that can timeout on hosted services.
- Make deposit failures recoverable without losing the user's encrypted note.

---

## Non-Goals

- Do not redesign the entire mixer before MVP review.
- Do not put owner/admin keys in the frontend.
- Do not use localStorage or backend storage for plaintext user note secrets.
- Do not make the coordinator a wallet signer.
- Do not claim production readiness while owner minting is still exposed through a public relayer path.

---

## Track 1: Remove Owner Key From Public Relayer

### Option A: Pre-Mint Test CT Inventory

For the MVP/testnet path, mint a pool of CT notes from an admin script ahead of time. The relayer can allocate from this inventory without holding the owner key.

**Benefits:**

- Public relayer no longer needs `OWNER_PRIVATE_KEY`.
- Deposit requests become faster.
- Mint authority stays offline or local.

**Tradeoffs:**

- Inventory management is needed.
- The backend must prevent double-allocation.
- This is still a testnet/demo convenience, not the final user-funded deposit model.

### Option B: Dedicated Internal Mint Worker

Move minting into a separate non-public worker service. The public relayer queues a mint request, and the internal worker processes it.

**Benefits:**

- Public relayer does not directly hold owner authority.
- Mint work can be retried asynchronously.
- The worker can be rate-limited and isolated.

**Tradeoffs:**

- Requires another service or worker runtime.
- Requires a reachable queue such as Redis.
- Still keeps owner authority online, just in a narrower place.

### Option C: User-Funded Deposit Model

For a production-style design, remove backend CT minting from user deposits. Users should deposit real assets or already-issued pool tokens through wallet-signed transactions.

**Benefits:**

- No backend owner mint key is needed during normal deposits.
- Deposits become more naturally non-custodial.
- The relayer returns to being a relay service rather than an admin minter.

**Tradeoffs:**

- Requires a deeper deposit-flow redesign.
- Requires stronger frontend transaction building and user signing.
- Requires clearer handling of token supply and denomination pools.

---

## Track 2: Make Deposits Asynchronous

The current `POST /deposit` request can block while minting and waiting for the CKB transaction to commit. Hosted platforms can return `502` or timeout before the backend finishes.

The safer design is:

1. `POST /deposit` creates a deposit job and returns immediately.
2. The frontend receives `jobId`, `sessionId`, and `participantId`.
3. A worker processes the mint/deposit step.
4. The frontend polls `/deposit/jobs/:jobId` or uses WebSocket events.
5. The user can recover using the pending encrypted note if the browser closes.

**Acceptance criteria:**

- `POST /deposit` returns quickly.
- Long-running mint/finalization work happens outside the request-response cycle.
- Job state is stored in Redis or another persistent queue.
- Failed jobs cancel the coordinator participant cleanly.
- The frontend shows clear pending, failed, and ready states.

---

## Track 3: Environment Variable Policy

### Public Relayer

Long term, the relayer should have:

```env
RELAYER_PRIVATE_KEY=...
RELAYER_PUBLIC_URL=...
COORDINATOR_URL=...
REDIS_URL=...
CKB_RPC_URL=...
CKB_INDEXER_URL=...
```

It should not have:

```env
OWNER_PRIVATE_KEY=...
OPERATOR_PRIVATE_KEY=...
```

### Coordinator

The coordinator should have:

```env
COORDINATOR_MIN_PARTICIPANTS=4
REDIS_URL=...
CKB_RPC_URL=...
CKB_INDEXER_URL=...
```

It should not have:

```env
OWNER_PRIVATE_KEY=...
RELAYER_PRIVATE_KEY=...
OPERATOR_PRIVATE_KEY=...
```

### Admin/Mint Worker

If a demo mint worker remains necessary, only that isolated worker should have:

```env
OWNER_PRIVATE_KEY=...
```

---

## Track 4: Recovery and Failure Handling

The pending encrypted note pattern should remain. If the backend mint/deposit job fails after the user has saved the pending note, the user should be able to:

- see that the deposit did not finalize,
- retry safely,
- cancel the pending participant if needed,
- avoid saving a finalized withdrawal note that does not correspond to an on-chain deposit.

The backend should keep returning structured JSON errors so the frontend does not display generic fetch or CORS-like failures for real backend problems.

---

## Proposed Order of Work

1. Finish MVP review with the current temporary relayer mint setup.
2. Document that `OWNER_PRIVATE_KEY` on the relayer is an MVP-only limitation.
3. Add async deposit job status endpoints.
4. Move minting out of the direct `POST /deposit` request path.
5. Choose between pre-minted inventory, internal mint worker, or user-funded deposit redesign.
6. Remove `OWNER_PRIVATE_KEY` from the public relayer deployment.
7. Retest the full deposit-to-withdraw flow with the reduced-key backend setup.

---

## Expected Benefit

This plan reduces the blast radius of backend compromise. The public relayer can remain a transaction relay and coordination gateway, while high-authority mint/admin keys are moved out of the exposed request path.

For the MVP, this also improves reliability because long-running mint work will no longer be tied directly to a browser deposit request.
