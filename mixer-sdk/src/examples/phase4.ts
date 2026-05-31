import type { DepositNote } from '../types/note';
import { deriveCommitment, randomBlindingFactor } from '../utils/crypto';
import { buildMerkleTree } from '../utils/merkle';
import { buildRealWithdrawalProof } from '../utils/proof';

const DENOMINATION = 100n;

async function buildDepositNote(sessionId: string, inputOutPoint: string, stealthOutputAddress: string): Promise<DepositNote> {
    const secret = randomBlindingFactor();
    const nullifierSecret = randomBlindingFactor();
    const commitment = await deriveCommitment(secret, nullifierSecret);

    return {
        sessionId,
        inputOutPoint,
        blindingFactor: secret,
        secret,
        nullifierSecret,
        stealthOutputAddress,
        createdAt: Date.now(),
        commitment,
    };
}

export async function runPhase4Example() {
    const notes = [
        await buildDepositNote('session_a', '0xaaa1', 'ckt1_stealth_user1_dest'),
        await buildDepositNote('session_b', '0xbbb2', 'ckt1_stealth_user2_dest'),
        await buildDepositNote('session_c', '0xccc3', 'ckt1_stealth_user3_dest'),
        await buildDepositNote('session_d', '0xddd4', 'ckt1_stealth_user4_dest'),
    ];

    const tree = await buildMerkleTree(notes.map(note => note.commitment!));
    const targetIndex = 2;
    const target = notes[targetIndex];
    const proofResult = await buildRealWithdrawalProof(target, tree, targetIndex, DENOMINATION);

    return {
        notes,
        tree,
        target,
        ...proofResult,
    };
}
