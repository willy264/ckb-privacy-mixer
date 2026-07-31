# Obscell Privacy Mixer - July Week 4 Progress Report

**Period:** July 21-28, 2026  
**Focus:** App direction update, MVP positioning, and the shift toward a CCC-compatible privacy SDK with a reference wallet.

---

## Overview

This week focused less on adding new source-code features and more on deciding the next direction for the app after the MVP work.

The main question was whether Obscell Privacy Mixer should continue to be presented mainly as a standalone coin mixer, whether it should become a wallet, or whether the privacy functionality should be packaged as reusable infrastructure that other CKB applications can build on.

That discussion is important because the project already has a working privacy-mixer direction, but the way it is presented affects how users, reviewers, developers, and the wider CKB community understand it.

The strongest direction from the discussion is:

```text
Protocol work already built
        ->
CCC-compatible privacy SDK / module
        ->
Reference wallet showing how the SDK is used
```

This changes the framing from "another wallet" or "a better mixer UI" into privacy infrastructure for the CKB ecosystem.

---

## App Update

The current MVP still centers on the deposit and withdrawal flow:

- users connect a CKB testnet wallet,
- prepare a private deposit note,
- save encrypted note data themselves,
- deposit into a fixed-denomination pool,
- later use the note to prepare a withdrawal proof,
- withdraw through the relayer path for better privacy.

Recent app work has already improved the security posture of the note flow by avoiding backend note storage and avoiding localStorage persistence for sensitive note data. The user is responsible for saving the encrypted note, while the app keeps the plaintext secret handling client-side.

This week, the app direction moved toward a more user-friendly and less exposed presentation:

- keep the mixer primitives underneath,
- make the experience feel more like a privacy-enabled wallet or SDK-powered privacy flow,
- reduce how strongly the app is framed as only a "mixer",
- focus the user-facing language on private receiving, private withdrawal, and privacy-enabled addresses,
- keep the technical mixer details available for reviewers and advanced users.

The current app can now be treated as the first reference implementation of the privacy layer. In other words, the wallet/app demonstrates what the SDK can do, instead of being the entire product.

---

## Conversation and Feedback

During the week, I asked for feedback on the next direction of the privacy mixer project:

> Should it be packaged as a wallet, or should something be built on top of it instead?

The response was that a wallet could be more elusive and discreet, while privacy mixers are controversial for obvious reasons.

The follow-up discussion with Neon moved the direction further. The key idea was that the project should not only become a wallet. It should be designed as something that can fit naturally into the CKB developer ecosystem.

The CCC architecture appears modular, with packages such as:

- `@ckb-ccc/core`,
- `@ckb-ccc/connector`.

That package structure suggests that Obscell privacy functionality could be designed as a CCC-compatible module or SDK, even if it is not an official CCC package at the beginning.

The possible direction is a privacy package shaped around APIs like:

- `privacy.shield()`,
- `privacy.unshield()`,
- `privacy.transfer()`,
- `privacy.balance()`,
- `privacy.history()`,
- `privacy.encryptNote()`,
- `privacy.decryptNote()`,
- `privacy.relayer()`.

This would let applications opt into privacy when needed, instead of forcing every developer to understand the full mixer protocol internally.

The important product conclusion is that the wallet should become the reference implementation. The privacy SDK becomes the core deliverable, while the wallet demonstrates how applications can integrate and use those privacy capabilities.

---

## What This Changes

The product direction now becomes clearer:

- Obscell should not be presented only as a standalone "coin mixer" interface.
- Obscell should evolve into a privacy infrastructure layer for CKB.
- The privacy SDK should become the core deliverable.
- The wallet/app should become the reference implementation built on top of the SDK.
- Mixer mechanics can remain under the hood as the privacy engine.
- The UI should guide users through private wallet actions instead of exposing every protocol detail first.
- Public documentation should still be honest about how the system works.

This gives the project a better path for MVP review because it explains the usefulness of the privacy system without relying only on the more controversial mixer framing.

The project can now be described as:

> Obscell is a privacy infrastructure layer for CKB. The privacy SDK provides reusable privacy capabilities for developers, while the reference wallet demonstrates how those capabilities can be integrated into real applications.

---

## Planned App Improvements

The next app updates should focus on turning the current app into a clearer reference implementation for the privacy SDK:

1. Begin separating protocol logic into SDK-style functions.
2. Design the SDK around CCC-compatible types and transaction flows where possible.
3. Rename the main user-facing flow around private transfer or private wallet actions.
4. Add clearer separation between simple user mode and advanced protocol details.
5. Improve the deposit screen so it feels like creating a private balance or private note, not just entering a mixer pool.
6. Improve the withdrawal screen so it feels like spending or recovering private funds.
7. Keep encrypted note handling non-custodial.
8. Add stronger warnings around note loss, password loss, and testnet/MVP limitations.
9. Keep the relayer path as the recommended private withdrawal path.
10. Add developer documentation, API examples, and a small CCC-based sample integration.
11. Continue documenting the underlying mixer architecture for reviewers.

---

## Current Position

The app remains an MVP for private deposits and withdrawals on CKB testnet.

The most important progress this week was product clarity. Instead of asking users and developers to think first about a mixer, the next version should present Obscell as privacy infrastructure.

The app should continue to exist, but its role changes. It becomes the reference wallet that proves the privacy SDK works in practice.

That direction keeps the technical work useful while making the project easier to explain, review, and eventually demo.

---

## Summary

Week 4 was mainly about app direction and positioning. The key outcome is that Obscell Privacy Mixer should continue using the existing privacy-pool and ZK withdrawal design, but the project should now be framed as a privacy SDK / CCC-compatible module with a reference wallet on top.

The feedback from the conversation helped clarify that the strongest path is not "another wallet" and not only "a mixer UI." The stronger story is privacy infrastructure for CKB: reusable privacy capabilities for developers, demonstrated through a practical wallet experience.
