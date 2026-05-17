import crypto from 'crypto';
import type { MixPool } from './pool.js';
import { pools } from './pool.js';
import { logger } from '../utils/logger.js';

/**
 * CoinJoin transaction assembly.
 *
 * Security model:
 *   - The Coordinator builds the transaction from PUBLIC data only
 *     (commitments + stealth output addresses).
 *   - The Coordinator NEVER sees private keys or blinding factors.
 *   - Outputs are SHUFFLED with a CSPRNG so the coordinator cannot
 *     determine which input maps to which output.
 *   - Each participant signs only their own input; the coordinator
 *     assembles all partial signatures into the final transaction.
 *   - If fewer than `requiredParticipants` sign within the timeout,
 *     the session is aborted and participants' funds are never locked.
 */

/** Fischer-Yates shuffle using CSPRNG. */
function secureShuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Build the unsigned CoinJoin transaction for a full pool.
 *
 * Inputs  = all participants' deposit cells (in original order).
 * Outputs = all participants' stealth output addresses (shuffled).
 *
 * After building, the pool moves to 'building' status and the
 * pending tx hex is broadcast over WebSocket to all participants.
 */
export function buildCoinJoinTransaction(pool: MixPool): string {
    if (pool.participants.length < pool.requiredParticipants) {
        throw new Error('Pool is not full yet');
    }
    if (pool.status !== 'open') {
        throw new Error(`Cannot build transaction for pool in state: ${pool.status}`);
    }

    // Shuffle outputs so input→output mapping is hidden even from the coordinator
    const shuffledOutputAddresses = secureShuffle(
        pool.participants.map(p => p.stealthOutputAddress),
    );

    // Build a CKB-compatible raw transaction skeleton
    const rawTx = {
        version: '0x0',
        inputs: pool.participants.map(p => ({
            previousOutput: `commitment:${p.commitment}`, // resolved on-chain
            since: '0x0',
        })),
        outputs: shuffledOutputAddresses.map(addr => ({
            lock: addr,
            capacity: `0x${pool.denomination.toString(16)}`,
        })),
        outputsData: shuffledOutputAddresses.map(() => '0x'),
        cellDeps: [],
        headerDeps: [],
        witnesses: pool.participants.map(() => '0x'), // filled in during signing
    };

    const txHex = `0x${Buffer.from(JSON.stringify(rawTx)).toString('hex')}`;

    pool.status = 'building';
    pool.pendingTxHex = txHex;

    logger.info('[CoinJoin] Transaction built', {
        poolId: pool.poolId,
        inputs: rawTx.inputs.length,
        outputs: rawTx.outputs.length,
    });

    return txHex;
}

/**
 * Record a participant's signature on the pending CoinJoin transaction.
 *
 * When ALL participants have signed, the pool transitions to 'broadcasting'
 * and this function returns true, signalling the coordinator to broadcast.
 */
export function recordSignature(
    poolId: string,
    participantId: string,
    signature: string,
): boolean {
    const pool = pools.get(poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    if (pool.status !== 'building') throw new Error('Pool is not in building state');

    const participant = pool.participants.find(p => p.participantId === participantId);
    if (!participant) throw new Error(`Participant not found: ${participantId}`);
    if (participant.signature) throw new Error('Participant has already signed');

    participant.signature = signature;
    participant.status = 'signed';

    logger.info('[CoinJoin] Signature received', {
        poolId,
        participantId,
        signedCount: pool.participants.filter(p => p.signature).length,
        required: pool.requiredParticipants,
    });

    const allSigned = pool.participants.every(p => !!p.signature);
    if (allSigned) {
        pool.status = 'broadcasting';
        logger.info('[CoinJoin] All participants signed — ready to broadcast', { poolId });
    }

    return allSigned;
}

/**
 * Broadcast the fully-signed CoinJoin transaction to the CKB network.
 * In production this calls rpc.sendTransaction().
 */
export async function broadcastCoinJoin(pool: MixPool, rpcUrl: string): Promise<string> {
    if (pool.status !== 'broadcasting') {
        throw new Error('Pool is not ready to broadcast');
    }

    // TODO: Use @ckb-lumos/lumos RPC to send the assembled signed tx
    const mockTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;

    pool.status = 'complete';
    pool.broadcastTxHash = mockTxHash;

    logger.info('[CoinJoin] Broadcast complete', { poolId: pool.poolId, txHash: mockTxHash });
    return mockTxHash;
}

function secureShuffle<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
