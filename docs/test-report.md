# Verification Report

**Date:** 2026-09-05

**Scope:** Corrected-V1 fail-closed foundation on the current dirty worktree

**Status:** Local foundation checks pass. Deployment, live settlement, and Pudge E2E gates remain open.

## Environment

| Component | Version |
|---|---|
| OS | Windows 11 Pro `10.0.26200`, x64, 16,942,211,072 bytes RAM |
| Node.js | `25.8.1` |
| PNPM | `10.32.1` |
| Rust | `rustc 1.96.0-nightly (362211dc2 2026-03-24)` |
| Cargo | `1.96.0-nightly (e84cb639e 2026-03-21)` |
| Circom | `2.2.3` |
| snarkjs | `0.7.6` |
| CCC core | `1.12.5` |
| Browser | Chrome `151.0.7922.174` |
| Base commit recorded by evidence | `73d85a8f9b7330dbeb265dba281ff1bb3c218dcb` (`workingTree: dirty`) |

## Passed Locally

| Command / check | Result | Important output |
|---|---|---|
| `pnpm install --frozen-lockfile` | Passed | All 6 workspace projects; lockfile unchanged |
| `pnpm build` | Passed | SDK, backend, separate applicant-authored consumer, and reference frontend |
| `pnpm test:sdk` | Passed | 24/24, including canonical ABI, recipient-bound materialization, secret-free sync, cross-client CAS, unavailable capability truthfulness, and legacy fake-hash rejection |
| `pnpm test:backend:v1` | Passed | 20/20, including strict DTOs, staging quarantine, deterministic cap, fee isolation, transaction inspection, uncertain broadcast locks, and non-regressing committed status |
| `pnpm test:circuits` | Passed | Frozen public order, witness, shared vector, and mutation checks |
| `pnpm test:consumer` | Passed | 1/1 separate public-package consumer test |
| `pnpm test:contracts` | Passed | 7 RISC-V contract binaries built under `--locked`; 3/3 codec tests and 45/45 host contract/integration tests |
| `cargo metadata --format-version 1 --locked --no-deps` | Passed | Root workspace and generated lock include every contract package |
| `pnpm --filter frontend test:demo` | Passed | Production build, client invariants, 12 browser interactions, desktop/mobile layout, and zero fetch/XHR requests during privacy operations |
| `pnpm --filter obscell-payment-example test:browser` | Passed | Production build and desktop/mobile fixture verification; zero fetch/XHR data requests and zero transaction submissions |
| Evidence hash/size validation | Passed | Every file matches its JSON manifest; Figure 5 is absent |
| `python scripts/build-grant-proposal-docx.py` | Passed | Generated six target-only diagrams and the 13-section Word proposal; structural validation found 11 byte-identical original-color images and no Figure 5 media |
| Word field/layout verification | Passed | TOC and page fields updated; Word opened and repaginated the final DOCX to 26 pages with 21 tables and 11 inline images |
| `python scripts/build-grant-proposal-docx.py --finalize-page-count 26` | Passed | Restored update-on-open and cached Word's verified 26-page total for non-Word previewers |
| `python scripts/build-grant-proposal-docx.py --validate-only` | Passed | Final post-Word-save package passed heading, field, black hyperlink/text, white-cell/black-border table, original-image identity, and Figure 5 absence checks |

The final full `pnpm test` aggregate passed with the same 24-test SDK, 20-test backend, circuit, and separate-consumer results shown above.

## Corrected Circuit Measurement

One disposable local Groth16 sizing run compiled the corrected circuit at 19,220 constraints (7,497 nonlinear and 11,723 linear), generated a proof in 1,430.74 ms, and verified it with snarkjs in 15.70 ms. Process max RSS was 637,692 KiB; proof JSON was 722 bytes and the fixed Arkworks proof ABI is 256 bytes. The disposable power-15 setup was insecure, was deleted, and is not a deployable proving key. This was not a CKB-VM verifier measurement. See `circuits/v1/README.md` and `circuits/v1/benchmark/measure-groth16.mjs`.

## Non-Gating Diagnostics

- Vite reports the existing browser `vm` externalization and bundles above 500 kB; both production builds still complete.
- Rust reports existing dead-code warnings in the legacy verifier/tests; the contract build and tests pass.
- The frontend/backend `lint` scripts cannot run because ESLint is not installed/configured in this workspace. TypeScript compilation is covered by the builds.
- A repository-wide `cargo fmt --all -- --check` encounters pre-existing legacy formatting drift. New/modified V1 Rust sources pass targeted formatting checks.
- GitHub Actions workflows were inspected and updated but were not executed on GitHub-hosted Ubuntu from this local session.
- Microsoft Word's PDF/fixed-format export hung in this Office environment, including for a minimal one-line DOCX. The editable DOCX opens and repaginates correctly, but no PDF is claimed or included.

## Open Gates

- Pool genesis, acceptance, and withdrawal intentionally fail closed after structural checks until Poseidon append/empty-root logic, nullifier SMT updates, CT conservation, proof verification, and action binding are connected.
- The staging refund positive test is structural and uses an always-success placeholder asset type; it is not CT security evidence.
- Consensus ABI drift protection is incomplete: the Rust codec is handwritten rather than generated from `schemas/obscell_v1.mol`, and Rust does not independently recompute every Poseidon/Merkle/action/proof vector.
- No secure V1 proving ceremony or deployable proving/verifying key exists.
- No CKB-VM proof verification benchmark or PLONK/STARK/zkVM comparison has run.
- No non-fixture Pudge scanner, concrete independent state verifier, encrypted persistent store, reorg recovery worker, transaction builder/inspector, or uncertain-broadcast reconciliation worker ships here.
- Corrected-V1 Pudge deploy/deposit/accept/withdraw/recipient-spend, competing coordinator, Redis rebuild, and reorg runs have not occurred. Figure 5 therefore remains absent.
- No independent security review or audit has occurred.

Historical claims under `progress/` are retained as project history and are not test evidence for this report.
