import type { DepositNote } from '../types/note';
import type {
    MerkleTreeSnapshot,
    WithdrawalPublicInputs,
    WithdrawalWitnessBundle,
} from '../types/proof';
import { deriveNullifier } from './crypto';
import { concatBytes, hexToBytes, u32LeBytes, utf8ToBytes } from './encoding';
import { generateMerkleProof, verifyMerkleProof } from './merkle';

export interface LocalWithdrawalProofResult {
    publicInputs: WithdrawalPublicInputs;
    witnessBundle: WithdrawalWitnessBundle;
    serializedWitness: Uint8Array;
    proofValid: boolean;
}

function resolveCommitment(note: DepositNote): string {
    if (!note.commitment) {
        throw new Error('Deposit note is missing commitment');
    }
    return note.commitment;
}

export function serializeMembershipWitness(bundle: WithdrawalWitnessBundle): Uint8Array {
    const sessionBytes = utf8ToBytes(bundle.sessionId);
    const commitmentBytes = hexToBytes(bundle.commitment);
    const blindingBytes = hexToBytes(bundle.blindingFactor);
    const siblingsBytes = bundle.proof.siblings.map(hexToBytes);
    const pathBytes = Uint8Array.from(
        bundle.proof.pathDirections.map(direction => (direction === 'left' ? 0 : 1)),
    );

    return concatBytes(
        u32LeBytes(sessionBytes.length),
        sessionBytes,
        commitmentBytes,
        blindingBytes,
        u32LeBytes(bundle.proof.leafIndex),
        u32LeBytes(bundle.proof.siblings.length),
        ...siblingsBytes,
        pathBytes,
    );
}

export function buildWithdrawalProof(
    note: DepositNote,
    tree: MerkleTreeSnapshot,
    leafIndex: number,
    denomination: bigint,
): LocalWithdrawalProofResult {
    const commitment = resolveCommitment(note);
    const proof = generateMerkleProof(tree, leafIndex);
    const nullifier = deriveNullifier(note.blindingFactor, note.sessionId);

    note.leafIndex = leafIndex;
    note.merkleRoot = tree.root;
    note.merkleProof = proof;
    note.nullifier = nullifier;

    const publicInputs: WithdrawalPublicInputs = {
        merkleRoot: tree.root,
        nullifier,
        denomination,
        outputStealthAddress: note.stealthOutputAddress,
    };

    const witnessBundle: WithdrawalWitnessBundle = {
        commitment,
        blindingFactor: note.blindingFactor,
        sessionId: note.sessionId,
        proof,
    };

    return {
        publicInputs,
        witnessBundle,
        serializedWitness: serializeMembershipWitness(witnessBundle),
        proofValid: verifyMerkleProof(proof),
    };
}
