# Deposit Finalization Design

## Current State

The project now supports:

- live CT minting on Pudge
- `stealth-lock` outputs
- real live note generation
- coordinator-owned deposit pool/session state
- durable coordinator deposit pools using Redis when available with file-backed fallback

What the current deposit path does:

1. The frontend calls the backend deposit endpoint.
2. The backend asks the coordinator to prepare a deposit participant slot.
3. The backend mints a CT output on-chain for that participant.
4. The backend registers the minted commitment back into the coordinator-owned pool.
5. The frontend receives a real live note with a shared pool/session snapshot.

This is coordinator-backed, but it is still an **individual mint followed by pool registration** model.

## What Is Still Missing

To behave like a stronger multi-party deposit protocol, the coordinator must own not just pool membership,
but also pool **finalization semantics**.

That means moving from:

- `mint -> register into pool`

to something closer to:

- `prepare participant -> wait for threshold -> finalize shared deposit round -> issue notes against finalized round`

## Desired Final Model

### 1. Deposit Pool Lifecycle

Each deposit pool should progress through:

- `open`
- `ready`
- `finalizing`
- `complete`
- `failed`

### 2. Participant Lifecycle

Each participant should progress through:

- `pending`
- `minted`
- `registered`
- `finalized`
- `cancelled`

### 3. Finalization Trigger

A pool becomes `ready` when:

- registered participant count reaches `targetParticipants`

Then the coordinator:

- seals the pool
- snapshots the commitment set
- assigns canonical leaf ordering
- generates final session metadata
- marks participant notes as finalized against that exact snapshot

### 4. Canonical Session Snapshot

The coordinator should produce one canonical session object:

- `sessionId`
- `poolId`
- `denomination`
- `commitments[]`
- `leafAssignments`
- `finalizedAt`
- `status`

All notes from that round must reference this same finalized snapshot.

### 5. Optional Stronger On-Chain Finalization

If product requirements demand a stronger protocol, the coordinator can also publish
a pool-finalization artifact on-chain or in a registry cell, such as:

- a Merkle root of the pool commitment set
- a deposit round metadata cell
- a coordinator-signed session certificate

This would give withdrawals a stronger shared source of truth than local/off-chain snapshots.

## Recommended Next Implementation Steps

### Short-Term

1. Extend coordinator deposit pool status from:
   - `open | sealed | complete`
   to:
   - `open | ready | finalizing | complete | failed`

2. Add participant-level status transitions:
   - `pending | minted | registered | finalized | cancelled`

3. Add a coordinator finalization routine:
   - when `registeredCount >= targetSize`
   - freeze participant ordering
   - create canonical `commitments[]`
   - mark pool `complete`

4. Add a `GET /deposit/finalized/:sessionId` endpoint.

### Medium-Term

5. Make frontend withdrawals prefer finalized session snapshots over mutable latest-pool snapshots.

6. Add pool rollover logic that only opens the next pool after the current one is finalized.

### Long-Term

7. If necessary, publish finalized deposit-session roots on-chain so pool membership becomes verifiable
   beyond coordinator state.

## Summary

The repo is already past the fake-preview stage and now has a real coordinator-backed live deposit path.

The remaining leap is:

- from **coordinator-managed pool membership**
- to **coordinator-managed finalized multi-party deposit rounds**

That is the next protocol milestone.
