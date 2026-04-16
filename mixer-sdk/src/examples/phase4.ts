import type { DepositNote } from '../types/note';
import { mockCommitment, randomBlindingFactor } from '../utils/crypto';
import { buildMerkleTree } from '../utils/merkle';
import { buildWithdrawalProof } from '../utils/proof';

const DENOMINATION = 100n;

function buildDepositNote(sessionId: string, inputOutPoint: string, stealthOutputAddress: string): DepositNote {
    const blindingFactor = randomBlindingFactor();
    const commitment = mockCommitment(DENOMINATION, blindingFactor);

    return {
        sessionId,
        inputOutPoint,
        blindingFactor,
        stealthOutputAddress,
        createdAt: Date.now(),
        commitment,
    };
}

export function runPhase4Example() {
    const notes = [
        buildDepositNote('session_a', '0xaaa1', 'ckt1_stealth_user1_dest'),
        buildDepositNote('session_b', '0xbbb2', 'ckt1_stealth_user2_dest'),
        buildDepositNote('session_c', '0xccc3', 'ckt1_stealth_user3_dest'),
        buildDepositNote('session_d', '0xddd4', 'ckt1_stealth_user4_dest'),
    ];

    const tree = buildMerkleTree(notes.map(note => note.commitment!));
    const targetIndex = 2;
    const target = notes[targetIndex];
    const proofResult = buildWithdrawalProof(target, tree, targetIndex, DENOMINATION);

    return {
        notes,
        tree,
        target,
        ...proofResult,
    };
}
