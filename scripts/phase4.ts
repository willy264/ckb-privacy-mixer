/**
 * phase4.ts
 * Local Phase 4 simulation for Merkle membership proof generation.
 * Usage: node -e "require('./mixer-sdk/dist/examples/phase4.js')"
 * or compile the SDK and inspect the example output.
 */
import { runPhase4Example } from '../mixer-sdk/src/examples/phase4';

function main() {
    const result = runPhase4Example();
    console.log('=== Phase 4 Merkle Membership Simulation ===');
    console.log('Merkle root:', result.tree.root);
    console.log('Target leaf index:', result.target.leafIndex);
    console.log('Derived nullifier:', result.publicInputs.nullifier);
    console.log('Proof valid:', result.proofValid);
    console.log('Serialized witness bytes:', result.serializedWitness.length);
}

main();
