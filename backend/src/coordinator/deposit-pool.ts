import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export type DepositParticipantStatus = 'pending' | 'registered' | 'cancelled';
export type DepositPoolStatus = 'open' | 'sealed' | 'complete';

export interface DepositPoolParticipant {
    participantId: string;
    walletAddress: string;
    stealthOutputAddress: string;
    commitment?: string;
    blindingFactor?: string;
    depositTxHash?: string;
    inputOutPoint?: string;
    noteCreatedAt?: number;
    cancelReason?: string;
    joinedAt: number;
    status: DepositParticipantStatus;
}

export interface DepositPool {
    poolId: string;
    denomination: bigint;
    targetParticipants: number;
    participants: DepositPoolParticipant[];
    status: DepositPoolStatus;
    createdAt: number;
    updatedAt: number;
}

const DEPOSIT_POOL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_TARGET_PARTICIPANTS = Number.parseInt(process.env.DEPOSIT_POOL_TARGET_PARTICIPANTS ?? '5', 10);

export const depositPools = new Map<string, DepositPool>();

function pruneExpiredDepositPools() {
    const now = Date.now();
    for (const [poolId, pool] of depositPools) {
        if (pool.status === 'complete' || now - pool.updatedAt > DEPOSIT_POOL_TIMEOUT_MS) {
            depositPools.delete(poolId);
            logger.info('[DepositPool] Pruned', { poolId, status: pool.status });
        }
    }
}

export function createDepositPool(denomination: bigint, targetParticipants = DEFAULT_TARGET_PARTICIPANTS) {
    const now = Date.now();
    const pool: DepositPool = {
        poolId: crypto.randomUUID(),
        denomination,
        targetParticipants,
        participants: [],
        status: 'open',
        createdAt: now,
        updatedAt: now,
    };
    depositPools.set(pool.poolId, pool);
    logger.info('[DepositPool] Created', {
        poolId: pool.poolId,
        denomination: denomination.toString(),
        targetParticipants,
    });
    return pool;
}

export function findOrCreateDepositPool(denomination: bigint, targetParticipants = DEFAULT_TARGET_PARTICIPANTS) {
    pruneExpiredDepositPools();
    const open = [...depositPools.values()].find(pool => pool.status === 'open' && pool.denomination === denomination);
    if (open) {
        return open;
    }
    return createDepositPool(denomination, targetParticipants);
}

export function prepareDepositParticipant(
    denomination: bigint,
    walletAddress: string,
    stealthOutputAddress: string,
) {
    const pool = findOrCreateDepositPool(denomination);
    const participant: DepositPoolParticipant = {
        participantId: crypto.randomUUID(),
        walletAddress,
        stealthOutputAddress,
        joinedAt: Date.now(),
        status: 'pending',
    };
    pool.participants.push(participant);
    pool.updatedAt = Date.now();
    logger.info('[DepositPool] Participant prepared', {
        poolId: pool.poolId,
        participantId: participant.participantId,
        count: `${pool.participants.length}/${pool.targetParticipants}`,
    });
    return { pool, participant };
}

export function registerDepositCommitment(
    poolId: string,
    participantId: string,
    data: {
        commitment: string;
        blindingFactor: string;
        depositTxHash: string;
        inputOutPoint: string;
        noteCreatedAt: number;
    },
) {
    const pool = depositPools.get(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participant = pool.participants.find(entry => entry.participantId === participantId);
    if (!participant) {
        throw new Error(`Deposit participant not found: ${participantId}`);
    }

    participant.commitment = data.commitment;
    participant.blindingFactor = data.blindingFactor;
    participant.depositTxHash = data.depositTxHash;
    participant.inputOutPoint = data.inputOutPoint;
    participant.noteCreatedAt = data.noteCreatedAt;
    participant.status = 'registered';
    pool.updatedAt = Date.now();

    const registeredCount = pool.participants.filter(entry => entry.status === 'registered').length;
    if (registeredCount >= pool.targetParticipants) {
        pool.status = 'sealed';
        const successor = [...depositPools.values()].find(candidate =>
            candidate.denomination === pool.denomination &&
            candidate.status === 'open' &&
            candidate.poolId !== pool.poolId,
        );
        if (!successor) {
            createDepositPool(pool.denomination, pool.targetParticipants);
        }
    }

    return {
        poolId: pool.poolId,
        commitments: pool.participants
            .filter(entry => entry.status === 'registered' && entry.commitment)
            .map(entry => entry.commitment!) ,
        leafIndex: pool.participants
            .filter(entry => entry.status === 'registered' && entry.commitment)
            .findIndex(commitmentEntry => commitmentEntry.participantId === participantId),
        noteCreatedAt: participant.noteCreatedAt ?? participant.joinedAt,
    };
}

export function cancelDepositParticipant(poolId: string, participantId: string, reason?: string) {
    const pool = depositPools.get(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participant = pool.participants.find(entry => entry.participantId === participantId);
    if (!participant) {
        throw new Error(`Deposit participant not found: ${participantId}`);
    }

    if (participant.status === 'registered') {
        return;
    }

    participant.status = 'cancelled';
    participant.cancelReason = reason;
    pool.updatedAt = Date.now();
}

export function getDepositPool(poolId: string) {
    pruneExpiredDepositPools();
    return depositPools.get(poolId) ?? null;
}

export function listDepositPools() {
    pruneExpiredDepositPools();
    return [...depositPools.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getLatestDepositPool(denomination: bigint) {
    pruneExpiredDepositPools();
    const matching = [...depositPools.values()]
        .filter(pool => pool.denomination === denomination)
        .sort((left, right) => right.updatedAt - left.updatedAt);
    return matching[0] ?? null;
}

export function summarizeDepositPool(pool: DepositPool) {
    const commitments = pool.participants
        .filter(entry => entry.status === 'registered' && entry.commitment)
        .map(entry => entry.commitment!);
    const pendingCount = pool.participants.filter(entry => entry.status === 'pending').length;
    const participantCount = pool.participants.filter(entry => entry.status !== 'cancelled').length;

    return {
        sessionId: pool.poolId,
        denomination: Number(pool.denomination),
        commitments,
        size: commitments.length,
        participantCount,
        pendingCount,
        registeredCount: commitments.length,
        updatedAt: pool.updatedAt,
        status: pool.status,
        targetSize: pool.targetParticipants,
    };
}
