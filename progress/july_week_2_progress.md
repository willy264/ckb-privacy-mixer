# CKB Projects - July Week 2 Progress Report

**Focus:** Community review follow-up for Obscell Privacy Mixer, plus Sluice hackathon project progress.

---

## Overview

This week covered two CKB-related tracks.

The first track was **Obscell Privacy Mixer**, where the main work was preparing the MVP for community review, refining how the project is described, and making sure the article credits the original Obscell work properly.

The second track was **Sluice**, a separate CKB hackathon project idea focused on Fiber Network liquidity operations. Sluice is being built as an operator tool for a CKB Fiber node, with backend services, a dashboard, and planned routing/rebalancing workflows.

---

## Obscell Privacy Mixer Progress

### Community Article and Positioning

The Obscell Privacy Mixer article was prepared for sharing with the CKB community. After feedback, the wording was improved so the project does not sound like it is claiming the original Obscell work.

The clearer positioning is:

- The original Obscell privacy-token idea came from earlier Obscell work.
- Quake extended that direction through `obscell-wallet`, which explored stealth addresses and confidential transactions on Nervos CKB.
- Obscell Privacy Mixer is a separate MVP that builds on that privacy direction as a coin mixer.

The article now explains the project as a mixer that uses:

- fixed-denomination deposit pools,
- encrypted withdrawal notes,
- browser-side ZK proof generation,
- relayer-assisted private withdrawals,
- privacy-enabled address/confidential-token ideas.

### MVP Review Readiness

The mixer MVP remains focused on showing the full deposit-to-withdrawal flow on Pudge testnet:

- users connect with JoyID,
- generate encrypted note data locally,
- join a `100 CT` pool,
- wait for pool finalization,
- save the finalized encrypted withdrawal note,
- generate a withdrawal proof,
- withdraw privately through the relayer.

The project is still clearly marked as an MVP. The remaining risks from the previous deployment work are still important:

- the full four-participant live deposit round still needs repeated testing,
- relayer-private withdrawal still needs more live testing,
- Redis fallback mode is not ideal for reliability,
- the current MVP deposit path still temporarily depends on `OWNER_PRIVATE_KEY`,
- verifier hardening and SP1/PLONK research remain future work.

---

## Sluice Hackathon Project

### Project Summary

**Sluice** is my separate CKB hackathon project idea. It is currently implemented in:

The project is a **Fiber Liquidity Layer** for a CKB Fiber Network node. Its goal is to help node operators understand and manage channel liquidity more easily.

Instead of replacing the Fiber node, Sluice treats the node as the source of truth and builds tooling around it:

- visibility into channel balances,
- health snapshots,
- payment route probing,
- liquidity rebalancing workflows,
- reconciliation between stored snapshots and live node state.

### Repository Structure

Sluice is organized as a pnpm monorepo:

```text
backend/   NestJS + Prisma API for Fiber node operations
frontend/  Next.js dashboard for operators
infra/     Docker setup for Postgres, Redis, and testnet Fiber node
landing/   Separate landing page work
```

### Backend Progress

The backend foundation has been built around a modular NestJS architecture. Current backend work includes:

- `FiberRpcClient` integration for communicating with the running Fiber node.
- Node endpoints for node info, channels, peers, and graph data.
- Channel health snapshots stored in Postgres through Prisma.
- Prisma models for:
  - `ChannelSnapshot`,
  - `RebalanceJob`,
  - `LedgerEntry`.
- A routing probe endpoint:
  - `POST /routing/probe`
  - uses `send_payment` with `dry_run: true`,
  - checks whether a payment is likely to route without moving funds.
- Rebalance job endpoints:
  - `POST /rebalance`,
  - `GET /rebalance/:id`.
- Idempotency handling for rebalance requests so repeated submissions do not create duplicate payment attempts.
- A ledger structure for recording rebalance activity as auditable entries.
- Reconciliation endpoint:
  - `GET /reconciliation/status`,
  - compares stored snapshots against live Fiber node state.
- Realtime module work:
  - WebSocket gateway,
  - liquidity polling,
  - balance-change events for dashboard updates.

The backend follows the rule that the Fiber node remains the authority. The database records snapshots, jobs, and audit history, but it does not become the source of truth for channel balances.

### Frontend Progress

The frontend work has moved beyond a plain dashboard shell. Current work includes:

- Next.js dashboard app.
- Operator-focused dashboard layout.
- Channel health UI components.
- Probe, rebalance, and reconciliation pages.
- Shared UI components for cards, metrics, status indicators, forms, buttons, alerts, and empty states.
- A canvas-style dashboard experiment for visualizing Fiber node operations.
- Cinematic/dashboard UI components for presenting channel activity and liquidity state more clearly.

The current frontend direction is to make Sluice feel like an operational tool for repeated use, not just a static demo page.

### Deployment and Infrastructure Progress

Sluice also includes deployment and local infrastructure work:

- Docker setup for local dependencies.
- Docker setup for a testnet Fiber node.
- Render deployment configuration.
- Environment examples for backend and frontend.
- Deployment documentation.

The planned deployment shape is:

- backend service on Render,
- frontend deployed separately,
- Postgres/Redis for persistence and background work,
- Fiber node RPC/WebSocket access kept private or protected.

---

## Current State

Obscell Privacy Mixer is in MVP/community-review mode. The core work is now about explaining the design clearly, testing the hosted flow, and hardening the risky parts after review.

Sluice is in active buildout as a separate CKB hackathon project. It already has a strong backend foundation, database schema, route probing, rebalance/reconciliation structure, and dashboard work in progress.

---

## Next Steps

For **Obscell Privacy Mixer**:

1. Update the article wording to clearly credit the original Obscell work.
2. Retest the live four-participant deposit flow.
3. Retest private relayer withdrawal.
4. Continue documenting MVP limitations clearly.
5. Keep SP1/PLONK and verifier hardening as planned research tracks.

For **Sluice**:

1. Continue connecting the dashboard to live backend data.
2. Finish testing the routing probe against a real Fiber node.
3. Validate rebalance job behavior with controlled testnet channels.
4. Improve realtime balance updates.
5. Prepare a concise hackathon demo flow for judges/reviewers.
