

Sluice helps Fiber node operators understand channel liquidity, predict whether payments will route successfully, and safely rebalance channels from a single operational workspace.

The project began as an attempt to make Fiber channel data easier to read. It has since grown into a live testnet MVP that connects to a real Fiber node and brings monitoring, route analysis, rebalancing, alerts, and reconciliation into one interface.

This article explains why Sluice exists, what currently works, the decisions that shaped it, and what we plan to improve next.

- **Repository:** https://github.com/Maxima24/sluice

- **Hosted application:** https://sluice.drreamer.digital

- **Network:** CKB testnet, Fiber Network Node `0.9.0-rc7`



---

## The Problem

Running a payment-channel node is not only about keeping the process online. A node can be connected, funded, and apparently healthy while still being unable to send a payment.

The reason is that channel liquidity has direction. A channel may have enough capacity overall but too little balance on the operator's side to send. Another may be able to receive but not forward. Funds can gradually collect in channels where they are less useful while the channels serving active routes become depleted.

Operators often need answers to questions like:

- Which channel is becoming a bottleneck?
- Can this payment route successfully?
- Which channel should be rebalanced?
- Did the rebalance actually improve liquidity?

Without those answers, operators tend to discover liquidity problems through failed payments. They must inspect several data sources, compare balances manually, and make money-moving decisions with limited context. That workflow becomes increasingly difficult as the node gains more peers and channels.

Sluice exists to turn that operational state into something visible and actionable while keeping the Fiber node, rather than the dashboard, as the final source of truth.

---

## What Sluice Does

Sluice brings several operational tools into a single workspace:

- **Liquidity Monitoring** – visualize inbound and outbound channel capacity.
- **Route Probe** – test whether a payment can be routed before sending funds.
- **Rebalancing** – redistribute liquidity between channels using circular payments.
- **Operational Alerts** – surface low liquidity, stale data, and reconciliation drift.
- **Audit & Reconciliation** – compare historical actions against the live Fiber node.

Rather than separating these into disconnected dashboard pages, Sluice keeps them synchronized through a shared workspace where operators can move naturally between monitoring, analysis, and action.

---

## Current MVP Status

Sluice is currently running as a live testnet MVP connected to a real Fiber Network Node.

The current implementation includes:

- Live node identity, peer, graph, and channel inspection.
- Channel health calculated from inbound and outbound liquidity.
- Real-time balance updates and reconciliation monitoring.
- Route Probe for dry-run payment analysis.
- Background rebalancing jobs with audit history.
- Operational alerts for liquidity and reconciliation drift.
- CKB wallet-based operator authentication for protected actions.
- A persistent workspace with synchronized navigation and module focus.
- A network boot sequence that initializes the workspace on full page reload.

Together, these features complete the core operator workflow: observe liquidity, test a route, rebalance when necessary, and verify the outcome against the live node.

---

## How It Works

### Seeing channel health

When an operator opens Sluice, the application reads the current channel state from the Fiber node and separates each channel into outbound and inbound liquidity. That makes the practical meaning of a balance visible: how much the node can send through the channel and how much capacity exists in the opposite direction.

The interface groups this information into channel health, liquidity warnings, and an overall view of the node. Updates are pushed to the workspace as balances change. If the node becomes temporarily unavailable, the application can show its last recorded observation, but it labels that data as stale rather than presenting it as live.

### Probing a payment route

The Route Probe begins with the same inputs an operator would use for a payment: a destination, an amount, and an optional maximum fee. Sluice asks the Fiber node to perform route discovery without settling the payment.

The result is translated into a decision rather than a raw protocol response. A successful probe shows the expected route and fee. An unsuccessful probe explains that the payment is not currently payable and, when the route information allows it, identifies the bottleneck that prevented it.

This does not guarantee that network conditions will remain unchanged until a later payment is sent. It does provide a much better pre-flight signal than attempting the payment without inspecting the route first.

### Rebalancing and verification

For a rebalance, the operator chooses the channel with excess outbound capacity, the destination channel that needs liquidity, the amount, and the fee limit. Sluice creates a background job and follows it through route preparation, inflight payment, and settlement.

Every request includes an idempotency key. If the same request is submitted again because of a retry, slow connection, or repeated click, Sluice returns the existing job instead of moving funds twice.

After a successful rebalance, the application records the principal and fee as balanced audit entries. It then reads the channels from the Fiber node again. The ledger explains what Sluice did; the node confirms what the balances actually became. If those views differ, the reconciliation surface reports the drift instead of silently rewriting history.

---

## Building the MVP

Building Sluice wasn't just about exposing Fiber node data in a dashboard. Several decisions shaped how the platform behaves under real operational conditions, with a strong focus on correctness, reliability, and operator trust.

### Keeping the Fiber node authoritative

One of the earliest design decisions was to treat the Fiber node as the single source of truth. While database snapshots are useful for historical views and temporary fallbacks, they should never replace live node data. During outages or delayed updates, presenting cached balances as current could mislead operators into making incorrect decisions. In Sluice, snapshots are treated as observations, while the Fiber node always remains the authoritative view of channel state.

### Preserving exact amount precision

Liquidity calculations require exact values. Fiber uses `u128` integers, which exceed the safe range of JavaScript's native `number` type. To avoid precision loss, Sluice handles all amounts as `BigInt` values or lossless decimal strings throughout calculations, storage, and presentation. Although invisible to users, this guarantees that balances, fees, and liquidity metrics remain accurate.

### Making rebalancing safe to retry

Rebalancing introduces another challenge: user actions are not always performed exactly once. Network interruptions, browser retries, or repeated button clicks can all result in duplicate requests. To prevent duplicate money movement, every rebalance operation is protected by idempotency keys and concurrency controls, ensuring that a single operator action maps to a single rebalance job.

### Synchronizing the operator workspace

The interface itself presented a different engineering challenge. Sluice is built around two connected experiences: the visual workspace and the Operator Console. Selecting a channel, running a route probe, or reviewing an alert in one area should immediately update the other without resetting the application's state. Building this shared focus model transformed Sluice from a collection of dashboard pages into a cohesive operational workspace.

---

## How It Is Built

Sluice is organized as a pnpm monorepo consisting of three main components:

- **Frontend** — Next.js, React, Tailwind CSS, GSAP, and Framer Motion powering the operator workspace.
- **Backend** — NestJS, PostgreSQL, Redis, and BullMQ handling Fiber communication, snapshots, reconciliation, and rebalancing.
- **Infrastructure** — Docker-based services for the Fiber node and local development environment.

All communication with the Fiber node passes through a single typed Fiber client. Browser clients communicate only with the backend over HTTP and WebSocket, while the Fiber RPC endpoint remains private to the server environment. This keeps the node isolated while allowing Sluice to expose a simpler, operator-focused interface.

---

## Current Limitations

Although the MVP is functional, there are still several areas for improvement:

- Testnet deployment only.
- Single-node management.
- Channel updates primarily rely on polling.
- Rebalancing remains operator initiated.
- Limited historical analytics and forecasting.
- Backend services currently run within a single application instance.

These limitations are acceptable for a testnet MVP and represent the primary focus of the next development phase.

---

## What's Next

The next stage of development focuses on making Sluice more operationally useful before introducing additional automation.

Planned improvements include:

- Better rebalance recommendations.
- Historical liquidity analytics.
- Predictive channel health warnings.
- Operator-defined rebalance policies.
- Multi-node management.
- External alert integrations.
- Dedicated rebalance workers.
- Improved production authentication.
- Continued Fiber RPC compatibility.

The immediate goal is to improve operational visibility and decision-making before introducing more autonomous behavior. Every new capability should remain transparent, auditable, and under operator control.

---

## Try the MVP

If you'd like to explore the current MVP on the CKB testnet, you can follow the steps below.
1. Open https://sluice.drreamer.digital.

2. Review the Dashboard and confirm that the node is online.

3. Open **Network** to inspect the node identity and peers.

4. Compare channel direction and capacity under **Channels** and **Liquidity**.

5. Open **Route Probe** and enter a valid testnet pubkey or invoice.

6. Run the dry probe and inspect its fee, hops, and bottleneck result.

7. Review **Alerts** for conditions derived from the current node state.

8. Open **Audit Log** to check reconciliation between snapshots and the live node.

9. Only authorized operators using channels they control should test rebalancing.

---

## Closing Thoughts

Sluice started as an attempt to make Fiber channel liquidity easier to understand. Over time, it evolved into an operator workspace that combines monitoring, route analysis, rebalancing, alerts, and reconciliation into a single operational experience.

The project is still testnet-first, but the core operator workflow is now functional and ready for feedback. The next goal is to continue refining the platform while keeping every operational decision transparent, auditable, and grounded in the live Fiber node.

Feedback from Fiber node operators and CKB developers would be especially appreciated, particularly around:

- Route Probe usefulness.
- Rebalance safety.
- Reconciliation behavior.
- Operator workflow and usability.

Thanks for reading.