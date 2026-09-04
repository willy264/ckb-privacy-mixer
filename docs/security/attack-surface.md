# Attack Surface

| Boundary | Inputs | Principal failure modes |
|---|---|---|
| Staging lock/script | cell data, args, witness, `since`, CT cell | unauthorized acceptance/refund, pool/asset substitution, timeout bypass |
| Pool type | state data, script args, all protected inputs/outputs, proof ABI | stale transition, arithmetic overflow, wrong root/nullifier/recipient/action |
| Vault lock + CT type | CT commitments, range proofs, witness ABI, capacities | inflation, mint spoof, wrong asset, payout substitution, typed fee input |
| Groth16 verifier | nine public fields, 256-byte proof, verifying key | modulo reduction, malformed/infinity/non-subgroup points, wrong signal order |
| SDK parser/state store | chain data, encrypted notes, service responses | non-canonical decode, corrupted state, secret exposure, unsafe migration |
| CCC adapter | deployment manifest, live cells, signer, transaction mutation | network mismatch, replaced inputs, witness-group error, bad fee/change |
| Coordinator | staging discovery, block checkpoints, acceptance queue | off-chain authority, reorg omission, nondeterminism, race handling |
| Relayer | typed intent, fee policy, chain snapshot, hot signer | recipient/action mutation, stale input, excessive fee, CT funding |
| Frontend | wallet connector, password, artifact URLs, UI state | phishing, secret logging, fake status, malicious artifact substitution |
| Deployment/release | binaries, keys, manifests, RPC endpoints | wrong code hash, key leakage, legacy/V1 confusion, unverifiable build |

Every boundary requires length limits, canonical decoding, explicit versions, structured errors, and negative tests. Secrets must never cross the client-to-service boundary.
