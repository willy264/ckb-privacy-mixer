# Deposit Finalization Design

## Status

This document now describes the **current** finalization model and the **next** protocol milestone.

Completed already:

- live CT minting on Pudge
- coordinator-owned deposit pools
- signing-phase deposit round flow in code
- finalized-note retrieval after pool completion
- permissionless direct-withdrawal default
- passing Rust contract/integration test suite

## Current Deposit Finalization Model

The repo now implements a coordinator-backed signing-phase round:

1. participant is prepared in the coordinator pool
2. backend mints a staging CT cell
3. participant is registered as minted in the pool
4. deposits stay `pending`
5. when threshold is reached:
   - pool becomes `ready`
   - unsigned round transaction is exposed
   - participants sign
   - coordinator collects signatures
   - coordinator finalizes the round
6. finalized notes are returned and bound to the mixed round output

### Current pool lifecycle

- `open`
- `ready`
- `finalizing`
- `complete`
- `failed`

### Current participant lifecycle

- `pending`
- `minted`
- `registered`
- `finalized`
- `cancelled`

## What Is True Right Now

The coordinator now owns:

- participant admission
- pool membership
- pool readiness
- signature collection
- pool finalization
- finalized commitment snapshots
- finalized note metadata

The withdrawal side now assumes:

- permissionless direct registry updates by default
- relayer/coordinator assistance is optional UX, not the base trust model

## What Is Still Not Proven End-to-End

The remaining question is no longer whether the code paths exist.

The remaining question is whether the full signing-phase coordinator round has been exercised
successfully on Pudge with multiple real JoyID wallets under live conditions.

Specifically, we still need to confirm:

1. multiple wallets can join the same live round
2. each participant can sign the unsigned round as expected
3. coordinator finalization produces a valid on-chain mixed CT transaction
4. finalized notes received by all participants match the final mixed outputs

## Next Milestone

### 1. Multi-wallet live validation

Run a real live round on Pudge using multiple JoyID wallets and confirm:

- early deposits remain pending
- pool transitions to `ready`
- signatures are collected from all participants
- coordinator finalizes successfully
- final mixed transaction lands on-chain
- finalized notes are saved for all participants

### 2. Coordinator hardening

After live validation, improve:

- retry/recovery behavior when one signer stalls
- clearer timeout / abort semantics
- operator visibility into pool progress
- finalized session inspection endpoints

### 3. Optional stronger protocol step

If product requirements demand a stronger settlement artifact, consider adding:

- an on-chain finalized session root
- a dedicated pool-finalization registry cell
- or another verifiable deposit-round artifact

That would move the system from:

- coordinator-finalized shared round state

to:

- coordinator-finalized plus on-chain verifiable finalized round metadata

## Summary

The repo is now beyond the earlier “mint then register and stop” architecture.

It currently implements:

- coordinator-backed signing-phase deposit rounds
- finalized-note issuance after round completion
- permissionless default withdrawal authority

The next real task is not more Step 3/4 plumbing.

The next real task is:

- prove the deposit finalization flow live with multiple wallets on Pudge
- then harden it for production behavior
