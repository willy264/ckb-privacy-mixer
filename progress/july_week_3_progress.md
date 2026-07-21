# CKB Projects - July Week 3 Progress Report

**Period:** July 14-20, 2026  
**Focus:** Sluice hackathon project progress, with Obscell Privacy Mixer review work as supporting context.

---

## Overview

This week was mainly focused on **Sluice**, the CKB Fiber Network hackathon project. Sluice is being built as an operator dashboard and liquidity operations layer for a Fiber node. The goal is to help node operators see channel health, test payment routes before funds move, rebalance liquidity, and keep an audit trail of important actions.

The Obscell Privacy Mixer work during this period was mostly around review preparation and technical clarification, especially explaining how its mixer design differs from Zcash and why the current MVP still has known cryptographic and architecture limitations.

---

## Sluice Hackathon Project

### Project Direction

Sluice is a **Fiber Liquidity Layer** for a CKB Fiber Network node. It does not replace the Fiber node or try to become the authority for balances. The Fiber node remains the source of truth, while Sluice provides:

- channel visibility,
- route probing,
- rebalance workflows,
- realtime updates,
- reconciliation checks,
- audit history for liquidity operations.

The project is implemented in `C:\Users\HP\Documents\people\sluice` as a pnpm monorepo:

```text
backend/   NestJS + Prisma API for Fiber node operations
frontend/  Next.js operator dashboard
infra/     Docker setup for local dependencies and Fiber node testing
landing/   Landing page work
```

---

## Week 3 Work Done on Sluice

### 1. Wallet-Based Operator Sign-In

A major addition this week was wallet-based operator authentication using a Sign-In-With-CKB style flow.

The backend now supports:

- issuing one-time sign-in challenges,
- verifying wallet signatures with `@ckb-ccc/core`,
- checking operator identities against an allowlist,
- minting JWT sessions for authenticated operators,
- expiring challenges after a short TTL,
- rejecting reused or expired nonces.

This gives Sluice a better operator security model than a plain shared dashboard password. The wallet proves operator identity, but the signed message does not authorize a transaction or move funds.

### 2. Demo-Friendly Open Auth Mode

An `AUTH_OPEN` mode was added for demos and hackathon review.

When enabled, any wallet that can produce a valid signature can enter operator mode. When disabled, the backend restricts mutation access to allowlisted operator keys through `OPERATOR_KEYS`.

This helps the project support two modes:

- **Demo mode:** easy for reviewers to test.
- **Production-style mode:** only approved operator wallets can perform mutations.

### 3. Backend Build Fix

The backend TypeScript build was fixed so NestJS emits the expected compiled entrypoint.

The build configuration now pins compilation to the backend `src` directory so the deployed service can reliably produce `dist/main.js`. This was important for making the backend deployable and keeping the hackathon demo stable.

### 4. Rebalance Simulation Mode

A `REBALANCE_SIMULATE` mode was added for MVP and demo use.

This lets the rebalance engine run through the full job lifecycle without actually calling the Fiber node to move funds. In simulation mode, Sluice still:

- creates a rebalance job,
- moves it through the normal status flow,
- emits realtime job updates,
- generates a synthetic payment hash,
- writes the same double-entry ledger records used by real rebalances.

This is useful because a live rebalance depends on real testnet channel liquidity. Simulation mode makes the workflow demoable even when channel conditions are not ready.

### 5. Rebalance History and Audit Ledger

The rebalance flow was expanded with history and ledger visibility.

Backend work included:

- exposing recent rebalance jobs,
- adding a read-only ledger endpoint,
- returning ledger entries for a selected rebalance job,
- keeping successful rebalance settlement tied to a balanced double-entry ledger write.

Frontend work included:

- showing rebalance job history,
- allowing a user to select a previous job,
- showing the job's ledger rows,
- calculating whether the ledger is balanced in the UI,
- displaying source, destination, principal, and fee entries.

This improves Sluice as an operator tool because rebalancing is not just an action. It becomes something an operator can inspect, explain, and audit after the fact.

### 6. Rebalance UI Improvements

The rebalance page was improved so the flow is clearer for a demo:

- source and destination channel inputs,
- amount and max-fee inputs,
- generated idempotency key support,
- status steps for `PENDING`, `BUILDING`, `INFLIGHT`, and `SUCCEEDED`,
- channel candidate list,
- current job summary,
- error display for failed rebalance attempts.

The idempotency key remains important because rebalance requests should not accidentally create duplicate payment attempts if a user clicks twice or the frontend retries.

### 7. Alert Page Alignment

The `/alerts` page was updated to use the same alert derivation logic as the canvas alert timeline.

This prevents the dashboard from showing different alert states in different parts of the app. The alert surface now pulls from shared liquidity logic, including channel health and reconciliation state.

### 8. Dashboard and Canvas Polish

The operator dashboard received more frontend polish:

- boot loader updates,
- infinite canvas updates,
- resize handle improvements,
- shared workspace module refinements,
- small layout fixes on the reconciliation page.

These changes support the demo experience. The app is moving toward a focused operator workspace where the dashboard, alerts, rebalance page, reconciliation view, and canvas modules feel connected.

### 9. Documentation and Architecture Materials

The Sluice repository now includes project documentation and architecture materials, including:

- `README.md`,
- `DEPLOYMENT.md`,
- `backend-deliverable.md`,
- `Fiber-Liquidity-Layer-Architecture-and-Testing.pdf`.

The documentation explains that:

- the Fiber node remains the source of truth,
- Postgres stores snapshots, jobs, and ledger records,
- Redis supports background/realtime work,
- Fiber RPC is expected to stay private,
- the frontend and backend are deployed as separate services.

---

## Current Sluice State

Sluice has moved beyond a static prototype. It now has:

- a NestJS backend connected to the Fiber node through a typed RPC layer,
- Prisma models for channel snapshots, rebalance jobs, and ledger entries,
- route probing structure,
- rebalance execution and simulation paths,
- wallet-based operator sign-in,
- dashboard pages for channels, liquidity, routes, rebalance, alerts, and reconciliation,
- realtime/polling infrastructure,
- deployment documentation.

The main value of this week's work is that Sluice became more reviewable as a hackathon MVP. It now has a clearer demo path even when real channel liquidity is difficult to control.

---

## Obscell Privacy Mixer Context

Obscell work this week was lighter and mostly review-oriented.

The main discussion was a technical comparison between the mixer design and Zcash. The key clarification is:

- Obscell currently works more like a Tornado-style fixed-denomination mixer.
- Users deposit into a shared pool and withdraw later using note secrets and a ZK proof.
- The design aims to break the link between deposit and withdrawal.
- Zcash is broader because it hides sender, receiver, and arbitrary amounts as part of a full private payment system.

This helped clarify that Obscell's MVP is not trying to be Zcash. It is closer to a fixed-denomination mixer that can later learn from Zcash-style value commitments, stronger note handling, and more mature proof systems.

---

## Remaining Work

For Sluice:

1. Test the wallet sign-in flow against the deployed frontend and backend.
2. Confirm `AUTH_OPEN` and allowlisted operator mode both work as expected.
3. Demo `REBALANCE_SIMULATE` end to end.
4. Test real rebalance behavior once controlled Fiber testnet channels are ready.
5. Make the hackathon demo flow short and repeatable.
6. Tighten deployment notes for reviewers.

For Obscell:

1. Continue explaining the MVP clearly as a fixed-denomination mixer.
2. Document the differences from Zcash and Tornado-style mixers.
3. Keep SP1/PLONK research as a future proof-system improvement.
4. Continue testing the hosted deposit and private withdrawal flow.

---

## Summary

Week 3 was strongest on the Sluice side. The project gained wallet-based operator authentication, demo-safe rebalance simulation, rebalance history, double-entry audit ledger visibility, alert consistency, backend build stability, and dashboard polish.

These changes make Sluice much easier to present as a CKB hackathon MVP because reviewers can understand the problem, interact with the dashboard, and see a full liquidity-management workflow without depending on perfect live channel conditions.
