pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Computes Poseidon(left, right)
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== left;
    hasher.inputs[1] <== right;
    hash <== hasher.out;
}

// Verifies a Merkle tree path
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component mux[levels];

    signal current[levels + 1];
    current[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        hashers[i] = HashLeftRight();
        mux[i] = MultiMux1(2);

        mux[i].c[0][0] <== current[i];
        mux[i].c[0][1] <== pathElements[i];

        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== current[i];

        mux[i].s <== pathIndices[i];

        hashers[i].left <== mux[i].out[0];
        hashers[i].right <== mux[i].out[1];

        current[i + 1] <== hashers[i].hash;
    }

    root === current[levels];
}

// The main Mixer circuit
// Proves that a specific (blindingFactor, sessionId) exists in the tree
// and outputs the corresponding nullifier
template Mixer(levels) {
    // Public Inputs
    signal input root;
    signal input nullifierHash;

    // Private Inputs
    signal input blindingFactor;
    signal input sessionId;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1. Derive the leaf commitment
    // In a real system, this might be a Pedersen commitment or just a Poseidon hash.
    // Here we use Poseidon(blindingFactor, sessionId) as the leaf.
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== blindingFactor;
    leafHasher.inputs[1] <== sessionId;
    signal leaf <== leafHasher.out;

    // 2. Derive the nullifier
    // nullifier = Poseidon(blindingFactor, sessionId, 1) to make it unique from leaf
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== blindingFactor;
    nullifierHasher.inputs[1] <== sessionId;
    nullifierHasher.inputs[2] <== 1;
    
    nullifierHash === nullifierHasher.out;

    // 3. Verify Merkle Proof
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== leaf;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
}

component main {public [root, nullifierHash]} = Mixer(8);
