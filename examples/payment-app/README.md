# Obscell payment application example

This is an independent, minimal consumer of the public `mixer-sdk` package entry point. It demonstrates the application boundary around `PrivacyClient` without importing SDK internals or reusing the frontend's `DemoPrivacyClient`.

The browser preview is intentionally a deterministic local fixture. It injects its own CCC-shaped client, transient state store, indexer observation adapter, and state-verifier adapter. It performs no network request, signing, proof generation, or transaction submission and is not evidence of a Pudge deployment.

Run it from the repository root:

```sh
pnpm test:consumer
pnpm dev:consumer
pnpm --filter obscell-payment-example test:browser
```

The browser verifier checks the rendered desktop and mobile layouts, asserts that the fixture makes no `fetch`/XHR request, and records zero transaction submissions. `pnpm --filter obscell-payment-example capture:evidence` writes the independent consumer screenshot used as Figure 6.

For a production integration, replace every fixture dependency in `src/fixture.ts` with a real CCC `Client`, an encrypted-at-rest store, a chain indexer, and an independently validating CKB state verifier. Live shield and unshield remain unavailable in the corrected V1 SDK foundation.
