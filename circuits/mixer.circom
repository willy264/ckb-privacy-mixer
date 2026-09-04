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
// Proves that a specific (secret, nullifier) exists in the tree
// and outputs the corresponding nullifier
template Mixer(levels) {
    // Public Inputs
    signal input root;
    signal input nullifierHash;
    signal input recipient;

    // Private Inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1. Derive the leaf commitment
    // leaf = Poseidon(secret, nullifier)
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== secret;
    leafHasher.inputs[1] <== nullifier;
    signal leaf <== leafHasher.out;

    // 2. Derive the nullifier
    // nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    
    nullifierHash === nullifierHasher.out;

    // Bind the recipient scalar inside this legacy proof only. The legacy
    // transaction path does not bind it to the materialized payout output.
    signal recipientSquare;
    recipientSquare <== recipient * recipient;

    // 3. Verify Merkle Proof
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== leaf;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
}

component main {public [root, nullifierHash, recipient]} = Mixer(20);
