pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template LevelSeparatedMerklePath(levels) {
    // Little-endian integer of "obscell/v1/merkle-node".
    var MERKLE_NODE_TAG = 37935372653573014929958344014081385067853607695770223;

    signal input poolDomain;
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal current[levels + 1];
    component selectors[levels];
    component hashers[levels];

    current[0] <== leaf;

    for (var level = 0; level < levels; level++) {
        pathIndices[level] * (1 - pathIndices[level]) === 0;

        selectors[level] = MultiMux1(2);
        selectors[level].c[0][0] <== current[level];
        selectors[level].c[0][1] <== pathElements[level];
        selectors[level].c[1][0] <== pathElements[level];
        selectors[level].c[1][1] <== current[level];
        selectors[level].s <== pathIndices[level];

        // Pool identity and the numeric level are part of every node hash.
        hashers[level] = Poseidon(5);
        hashers[level].inputs[0] <== MERKLE_NODE_TAG;
        hashers[level].inputs[1] <== poolDomain;
        hashers[level].inputs[2] <== level;
        hashers[level].inputs[3] <== selectors[level].out[0];
        hashers[level].inputs[4] <== selectors[level].out[1];
        current[level + 1] <== hashers[level].out;
    }

    root === current[levels];
}

template ObscellWithdrawalV1() {
    // Little-endian integers of the ASCII domain labels in README.md.
    var LEAF_TAG = 531589708827954721157172160707650159;
    var NULLIFIER_TAG = 653086504777925466883665219146239842194554053231;
    var AUTH_TAG = 542360932573758878346893891871138415;

    // Frozen public signal order is declared on the main component below.
    signal input poolDomain;
    signal input assetDomain;
    signal input denomination;
    signal input value;
    signal input root;
    signal input nullifierHash;
    signal input recipientDomain;
    signal input actionHash;
    signal input authTag;

    signal input secret;
    signal input nullifierSecret;
    signal input pathElements[20];
    signal input pathIndices[20];

    value === denomination;

    component leafHasher = Poseidon(6);
    leafHasher.inputs[0] <== LEAF_TAG;
    leafHasher.inputs[1] <== poolDomain;
    leafHasher.inputs[2] <== assetDomain;
    leafHasher.inputs[3] <== denomination;
    leafHasher.inputs[4] <== secret;
    leafHasher.inputs[5] <== nullifierSecret;
    signal leaf <== leafHasher.out;

    signal leafIndexAccumulator[21];
    leafIndexAccumulator[0] <== 0;
    var bitWeight = 1;
    for (var level = 0; level < 20; level++) {
        leafIndexAccumulator[level + 1] <==
            leafIndexAccumulator[level] + pathIndices[level] * bitWeight;
        bitWeight = bitWeight * 2;
    }
    signal leafIndex <== leafIndexAccumulator[20];

    component nullifierHasher = Poseidon(4);
    nullifierHasher.inputs[0] <== NULLIFIER_TAG;
    nullifierHasher.inputs[1] <== poolDomain;
    nullifierHasher.inputs[2] <== nullifierSecret;
    nullifierHasher.inputs[3] <== leafIndex;
    nullifierHash === nullifierHasher.out;

    component authHasher = Poseidon(4);
    authHasher.inputs[0] <== AUTH_TAG;
    authHasher.inputs[1] <== secret;
    authHasher.inputs[2] <== recipientDomain;
    authHasher.inputs[3] <== actionHash;
    authTag === authHasher.out;

    component merklePath = LevelSeparatedMerklePath(20);
    merklePath.poolDomain <== poolDomain;
    merklePath.leaf <== leaf;
    merklePath.root <== root;
    for (var level = 0; level < 20; level++) {
        merklePath.pathElements[level] <== pathElements[level];
        merklePath.pathIndices[level] <== pathIndices[level];
    }
}

component main {public [
    poolDomain,
    assetDomain,
    denomination,
    value,
    root,
    nullifierHash,
    recipientDomain,
    actionHash,
    authTag
]} = ObscellWithdrawalV1();
