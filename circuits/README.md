# Obscell circuits

This directory contains two intentionally separate protocol generations.

## `legacy-demo`

The root-level `mixer.circom`, `mixer_final.zkey`, `mixer_js/`,
`verification_key.json`, `proof.json`, and `public.json` implement the existing
three-public-signal prototype relation. They are preserved as historical demo
fixtures. They do not prove the corrected V1 asset and state transition, and
must not be presented as corrected-V1 artifacts.

## Corrected V1 source

[`v1/withdrawal.circom`](v1/withdrawal.circom) is the versioned source for the
corrected withdrawal relation. Its specification, test status, and artifact
boundary are documented in [`v1/README.md`](v1/README.md).

No V1 proving key, verification key, WASM, proof, contract binary, or deployment
is committed here. Producing those requires a reviewed circuit, a reproducible
trusted-setup process, and a V1 pool verifier that recomputes transaction-bound
public inputs. The existing legacy artifacts cannot be reused for this circuit.
