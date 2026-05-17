import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export type ParticipantStatus = 'waiting' | 'signed' | 'timed_out';
export type PoolStatus = 'open' | 'building' | 'broadcasting' | 'complete' | 'failed';

export interface PoolParticipant {
    /** Unique ID assigned when a user joins. Returned to the user so they can sign. */
    participantId: string;
    /** The user's Pedersen commitment (public). Proves they own a valid deposit. */
    commitment: string;
    /** The stealth output address this user wants to receive funds at. */
    stealthOutputAddress: string;
    /** The outpoint of the user's input CKB cell. */
    outPoint: string;
    /** ECDSA/JoyID signature over the mixed transaction, submitted in Step 2. */
    signature?: string;
    status: ParticipantStatus;
    joinedAt: number;
}

export interface MixPool {
    poolId: string;
    denomination: bigint;
    requiredParticipants: number;
    participants: PoolParticipant[];
    status: PoolStatus;
    createdAt: number;
    /** The assembled raw transaction hex (set when status = 'building'). */
    pendingTxHex?: string;
    broadcastTxHash?: string;
    failureReason?: string;
}

const POOL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const SIGN_TIMEOUT_MS =  3 * 60 * 1000; //  3 minutes for all participants to sign

/** Live pools keyed by poolId. */
export const pools = new Map<string, MixPool>();

/** Create a new open pool. */
export function createPool(denomination: bigint, requiredParticipants: number): MixPool {
    const pool: MixPool = {
        poolId: crypto.randomUUID(),
        denomination,
        requiredParticipants,
        participants: [],
        status: 'open',
        createdAt: Date.now(),
    };
    pools.set(pool.poolId, pool);
    logger.info('[Pool] Created', {
        poolId: pool.poolId,
        denomination: denomination.toString(),
        required: requiredParticipants,
    });
    return pool;
}

/**
 * Find the first open pool for a given denomination, or create a new one.
 * This is how users naturally aggregate into the same mixing round.
 */
export function findOrCreatePool(denomination: bigint, requiredParticipants = 5): MixPool {
    pruneExpiredPools();

    for (const pool of pools.values()) {
        if (pool.status === 'open' && pool.denomination === denomination) {
            return pool;
        }
    }
    return createPool(denomination, requiredParticipants);
}

/**
 * Add a participant to a pool.
 * Returns the participantId the user must keep to submit their signature later.
 */
export function joinPool(
    poolId: string,
    commitment: string,
    stealthOutputAddress: string,
    outPoint: string,
): string {
    const pool = pools.get(poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    if (pool.status !== 'open') throw new Error(`Pool is not open (status: ${pool.status})`);

    const participantId = crypto.randomUUID();
    pool.participants.push({
        participantId,
        commitment,
        stealthOutputAddress,
        outPoint,
        status: 'waiting',
        joinedAt: Date.now(),
    });

    logger.info('[Pool] Participant joined', {
        poolId,
        participantId,
        count: `${pool.participants.length}/${pool.requiredParticipants}`,
    });

    return participantId;
}

/** Returns a safe public view of the pool (no private keys, no full addresses). */
export function poolSummary(pool: MixPool) {
    return {
        poolId:               pool.poolId,
        denomination:         pool.denomination.toString(),
        participantCount:     pool.participants.length,
        requiredParticipants: pool.requiredParticipants,
        status:               pool.status,
        isFull:               pool.participants.length >= pool.requiredParticipants,
    };
}

/** Remove expired / completed pools to prevent unbounded memory growth. */
function pruneExpiredPools() {
    const now = Date.now();
    for (const [id, pool] of pools) {
        const age = now - pool.createdAt;
        const isDead =
            pool.status === 'complete' ||
            pool.status === 'failed'   ||
            (pool.status === 'open'    && age > POOL_TIMEOUT_MS) ||
            (pool.status === 'building' && age > SIGN_TIMEOUT_MS);

        if (isDead) {
            pools.delete(id);
            logger.info('[Pool] Pruned expired pool', { poolId: id, status: pool.status });
        }
    }
}
