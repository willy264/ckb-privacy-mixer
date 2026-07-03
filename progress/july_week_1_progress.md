# CKB Privacy Mixer - June Week 4 Progress Report

**Period:** June 24 - June 30, 2026  
**Follow-up captured:** Deployment testing fixes through July 3, 2026  
**Focus:** MVP deployment, backend hosting, endpoint configuration, and relayer stability.

---

## Overview

This week focused on making the MVP live and reviewable. Most of the work was deployment hardening: connecting the Vercel frontend to hosted backend services, separating coordinator and relayer deployments, fixing Docker/backend build issues, and debugging the live deposit path.

The deployment work also exposed one important MVP tradeoff: the public relayer temporarily needs `OWNER_PRIVATE_KEY` because the current deposit flow mints CT notes inside `/deposit`. This was documented as a short-term testnet workaround, with a separate plan to remove mint/admin authority from the public relayer later.

---

## Main Fixes

### 1. Production Backend URLs

The live frontend was still calling `localhost:4000`, which fails for deployed users. The frontend now supports explicit production URLs:

```env
VITE_RELAYER_URL=https://ckb-mixer-relayer.onrender.com
VITE_COORDINATOR_URL=https://coordinator-production-xxxx.up.railway.app
```

A production guard was also added so missing `VITE_RELAYER_URL` fails clearly instead of silently falling back to localhost.

### 2. Railway Proxy Error

Railway was sending `X-Forwarded-For`, but Express did not trust the proxy in the actual app instances used by deployment. `trust proxy` was moved into the real coordinator and relayer factory functions.

### 3. Docker and TypeScript Build Stability

Docker/backend builds were failing because of pnpm workspace resolution and TypeScript dependency/type issues. The backend build was stabilized by:

- using workspace-aware pnpm build commands,
- adding `mixer-sdk` path mappings,
- loosening backend TS build settings for deployment,
- using hoisted pnpm node linking in Docker,
- adding `.dockerignore`.

### 4. Hosting Split

Railway's free plan could not host Redis, coordinator, and relayer as separate services. The deployment was split as:

```text
Frontend:    Vercel
Coordinator: Railway
Relayer:     Render
Redis:       Railway or external Redis
Network:     CKB Pudge testnet
```

### 5. Render Relayer Startup

Render was initially running the wrong backend app and returned `Cannot GET /info`. Start entrypoints were added:

```text
backend/src/coordinator/start.ts
backend/src/relayer/start.ts
```

The relayer now uses:

```bash
node backend/dist/relayer/start.js
```

and the coordinator uses:

```bash
node backend/dist/coordinator/start.js
```

This removed the fragile inline `node -e` deploy command.

### 6. CORS vs Render 502

Browser errors looked like CORS failures, but direct tests showed CORS was working. The real issue was Render returning `502 Bad Gateway` before Express could attach CORS headers. The deposit path was investigated as the source of the backend failure.

### 7. CT Mint Helper Runtime Fix

The relayer deposit path was running `cargo run -p ct-mint-helper` during a user deposit. This was too heavy for the hosted request path. Docker now prebuilds the Rust helper and copies the binary into the Node image. `mint-ct.ts` uses the prebuilt helper when available.

### 8. Deposit Mint Command Path Fix

The relayer was resolving the workspace root incorrectly inside Docker. The deposit service now finds the workspace root from `pnpm-workspace.yaml`, uses `execFile`, and prefers the compiled `backend/dist/deposit/mint-ct.js` script.

### 9. Environment Variable Policy

The services now have clearer environment boundaries:

- Coordinator should not receive wallet private keys.
- Relayer needs `RELAYER_PRIVATE_KEY`.
- Relayer temporarily needs `OWNER_PRIVATE_KEY` only because the MVP mints CT during `/deposit`.

This is documented as an MVP limitation, not a production security model.

### 10. JoyID Passkey Domain Fix

The JoyID mainnet URL was corrected from:

```text
https://app.joyid.dev
```

to:

```text
https://app.joy.id
```

Testnet users should create/use passkeys on:

```text
https://testnet.joyid.dev
```

---

## Documents Added

- `progress/obscell_privacy_mixer_article.md`
- `progress/progress_plan/sp1_plonk_and_withdrawal_ux_plan.md`
- `progress/progress_plan/deposit_mint_authority_hardening_plan.md`

The new hardening plan covers removing `OWNER_PRIVATE_KEY` from the public relayer by moving minting to a safer future design.

---

## Current MVP Status

- Vercel frontend no longer points to localhost.
- Railway coordinator exposes deposit pool endpoints.
- Render relayer exposes `/info` and `/health`.
- Backend start commands are simpler and deploy-safe.
- Docker now includes the prebuilt CT mint helper.
- Main deployment risks are documented.

---

## Known Remaining Issues

1. Render relayer still needs a reachable Redis URL; fallback mode is not ideal.
2. The MVP deposit path still temporarily requires `OWNER_PRIVATE_KEY` on the relayer.
3. Deposits can be slow because they wait for on-chain mint confirmation.
4. JoyID passkey availability depends on JoyID domain, browser profile, and platform support.
5. Groth16 trusted setup and verifier hardening remain future work.

---

## Next Steps

1. Retest a full 4-participant live deposit round.
2. Retest relayer-private withdrawal.
3. Configure reachable Redis for Render if needed.
4. Move deposit minting out of the public relayer path after MVP review.
5. Continue SP1/PLONK and Groth16 verifier hardening research.
