export type HexString = string;
export type ProofEncoding = 'groth16-bn254-arkworks-uncompressed-v1';

export type MerkleDirection = 'left' | 'right';

export interface MerkleProof {
    leaf: HexString;
    leafHash: HexString;
    leafIndex: number;
    siblings: HexString[];
    pathDirections: MerkleDirection[];
    root: HexString;
}

export interface MerkleTreeSnapshot {
    leaves: HexString[];
    leafHashes: HexString[];
    levels: HexString[][];
    root: HexString;
}

export interface WithdrawalPublicInputs {
    merkleRoot: HexString;
    nullifier: HexString;
    denomination: bigint;
    outputStealthAddress: string;
}

export interface WithdrawalWitnessBundle {
    commitment: HexString;
    blindingFactor: HexString;
    sessionId: string;
    proof: MerkleProof;
}

export interface PackedGroth16Proof {
    encoding: ProofEncoding;
    bytes: Uint8Array;
}
