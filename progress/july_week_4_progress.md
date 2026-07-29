# Obscell Privacy Mixer - July Week 4 Progress Report

**Period:** July 21-28, 2026  
**Focus:** App direction update, MVP positioning, and feedback from the privacy wallet/mixer discussion.

---

## Overview

This week focused less on adding new source-code features and more on deciding the next direction for the app after the MVP work.

The main question was whether Obscell Privacy Mixer should continue to be presented mainly as a standalone coin mixer, or whether the privacy functionality should be packaged as part of a wallet or wallet-like application.

That discussion is important because the project already has a working privacy-mixer direction, but the way it is presented affects how users, reviewers, and the wider CKB community understand it.

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
- make the experience feel more like a privacy-enabled wallet flow,
- reduce how strongly the app is framed as only a "mixer",
- focus the user-facing language on private receiving, private withdrawal, and privacy-enabled addresses,
- keep the technical mixer details available for reviewers and advanced users.

---

## Conversation and Feedback

During the week, I asked for feedback on the next direction of the privacy mixer project:

> Should it be packaged as a wallet, or should something be built on top of it instead?

The response was that a wallet could be more elusive and discreet, while privacy mixers are controversial for obvious reasons.

The feedback suggests that the strongest direction is not to abandon the mixer work, but to wrap it in a more practical wallet-style product experience. The privacy pool, encrypted notes, ZK proof generation, and relayer path can remain the underlying mechanism, while the public-facing app becomes easier to understand and less risky to present.

---

## What This Changes

The product direction now becomes clearer:

- Obscell should not be presented only as a standalone "coin mixer" interface.
- The app should evolve toward a privacy wallet or private-transfer tool.
- Mixer mechanics can remain under the hood as the privacy engine.
- The UI should guide users through private wallet actions instead of exposing every protocol detail first.
- Public documentation should still be honest about how the system works.

This gives the project a better path for MVP review because it explains the usefulness of the privacy system without relying only on the more controversial mixer framing.

---

## Planned App Improvements

The next app updates should focus on making the privacy flow feel more wallet-like:

1. Rename the main user-facing flow around private transfer or private wallet actions.
2. Add clearer separation between simple user mode and advanced protocol details.
3. Improve the deposit screen so it feels like creating a private balance or private note, not just entering a mixer pool.
4. Improve the withdrawal screen so it feels like spending or recovering private funds.
5. Keep encrypted note handling non-custodial.
6. Add stronger warnings around note loss, password loss, and testnet/MVP limitations.
7. Keep the relayer path as the recommended private withdrawal path.
8. Continue documenting the underlying mixer architecture for reviewers.

---

## Current Position

The app remains an MVP for private deposits and withdrawals on CKB testnet.

The most important progress this week was product clarity. Instead of asking users to think first about a mixer, the next version should make the experience feel closer to a privacy-enabled wallet built on top of mixer primitives.

That direction keeps the technical work useful while making the project easier to explain, review, and eventually demo.

---

## Summary

Week 4 was mainly about app direction and positioning. The key outcome is that Obscell Privacy Mixer should continue using the existing privacy-pool and ZK withdrawal design, but the next user-facing version should move toward a discreet wallet-style experience.

The feedback from the conversation helped clarify that a wallet direction may be more acceptable and practical than presenting the project only as a mixer, while still preserving the same privacy goals underneath.
