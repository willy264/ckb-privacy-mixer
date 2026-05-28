import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { redis } from '../utils/redis.js';

export type DepositParticipantStatus = 'pending' | 'minted' | 'registered' | 'finalized' | 'cancelled';
export type DepositPoolStatus = 'open' | 'ready' | 'finalizing' | 'complete' | 'failed';

export interface DepositPoolParticipant {
    participantId: string;
    walletAddress: string;
    stealthOutputAddress: string;
    commitment?: string;
    blindingFactor?: string;
    depositTxHash?: string;
    finalTxHash?: string;
    inputOutPoint?: string;
    noteCreatedAt?: number;
    signature?: string;
    signaturePayload?: string;
    cancelReason?: string;
    finalOutputIndex?: number;
    joinedAt: number;
    status: DepositParticipantStatus;
}

export interface DepositPool {
    poolId: string;
    denomination: string;
    targetParticipants: number;
    participants: DepositPoolParticipant[];
    status: DepositPoolStatus;
    createdAt: number;
    updatedAt: number;
    finalizedCommitments?: string[];
    finalizedAt?: number;
    failureReason?: string;
}

const DEPOSIT_POOL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_TARGET_PARTICIPANTS = Number.parseInt(process.env.DEPOSIT_POOL_TARGET_PARTICIPANTS ?? '4', 10);
const POOL_KEY_PREFIX = 'deposit_pool:';
const DENOMINATION_INDEX_PREFIX = 'deposit_pool_denominator:';
const FILE_STORE_NAME = 'coordinator-deposit-pools.json';

function now() {
    return Date.now();
}

function getPoolKey(poolId: string) {
    return `${POOL_KEY_PREFIX}${poolId}`;
}

function getDenominationIndexKey(denomination: string) {
    return `${DENOMINATION_INDEX_PREFIX}${denomination}`;
}

function getRepoRoot() {
    const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    return path.resolve(currentDir, '..', '..', '..');
}

function getFileStorePath() {
    return path.resolve(getRepoRoot(), 'backend', 'data', FILE_STORE_NAME);
}

function ensureFileStoreDir() {
    fs.mkdirSync(path.dirname(getFileStorePath()), { recursive: true });
}

type FileBackedState = {
    pools: Record<string, DepositPool>;
};

function readFileState(): FileBackedState {
    const filePath = getFileStorePath();
    if (!fs.existsSync(filePath)) {
        return { pools: {} };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<FileBackedState>;
        return {
            pools: parsed.pools ?? {},
        };
    } catch {
        return { pools: {} };
    }
}

function writeFileState(state: FileBackedState) {
    ensureFileStoreDir();
    fs.writeFileSync(getFileStorePath(), JSON.stringify(state, null, 2));
}

async function isRedisWritable() {
    return redis.status === 'ready';
}

async function savePool(pool: DepositPool) {
    if (await isRedisWritable()) {
        await redis.set(getPoolKey(pool.poolId), JSON.stringify(pool));
        await redis.sadd(getDenominationIndexKey(pool.denomination), pool.poolId);
        return;
    }

    const state = readFileState();
    state.pools[pool.poolId] = pool;
    writeFileState(state);
}

async function loadPool(poolId: string): Promise<DepositPool | null> {
    if (await isRedisWritable()) {
        const raw = await redis.get(getPoolKey(poolId));
        if (!raw) {
            return null;
        }

        return JSON.parse(raw) as DepositPool;
    }

    const state = readFileState();
    return state.pools[poolId] ?? null;
}

async function loadPoolsForDenomination(denomination: string) {
    if (await isRedisWritable()) {
        const ids = await redis.smembers(getDenominationIndexKey(denomination));
        const pools = await Promise.all(ids.map(loadPool));
        return pools.filter((pool): pool is DepositPool => pool !== null);
    }

    const state = readFileState();
    return Object.values(state.pools).filter(pool => pool.denomination === denomination);
}

async function deletePool(poolId: string, denomination: string) {
    if (await isRedisWritable()) {
        await redis.del(getPoolKey(poolId));
        await redis.srem(getDenominationIndexKey(denomination), poolId);
        return;
    }

    const state = readFileState();
    delete state.pools[poolId];
    writeFileState(state);
}

async function pruneExpiredDepositPools() {
    const timestamp = now();
    if (await isRedisWritable()) {
        const keys = await redis.keys(`${POOL_KEY_PREFIX}*`);
        for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) {
                continue;
            }

            const pool = JSON.parse(raw) as DepositPool;
            const activeCount = pool.participants.filter(entry => entry.status !== 'cancelled').length;
            const invalidOpenPool = pool.status === 'open' && activeCount > pool.targetParticipants;
            const staleRound = (pool.status === 'ready' || pool.status === 'finalizing') && timestamp - pool.updatedAt > 10 * 60 * 1000;
            if (pool.status === 'complete' || pool.status === 'failed' || invalidOpenPool || staleRound || timestamp - pool.updatedAt > DEPOSIT_POOL_TIMEOUT_MS) {
                await deletePool(pool.poolId, pool.denomination);
                logger.info('[DepositPool] Pruned', { poolId: pool.poolId, status: pool.status });
            }
        }
        return;
    }

    const state = readFileState();
    let changed = false;
    for (const pool of Object.values(state.pools)) {
        const activeCount = pool.participants.filter(entry => entry.status !== 'cancelled').length;
        const invalidOpenPool = pool.status === 'open' && activeCount > pool.targetParticipants;
        const staleRound = (pool.status === 'ready' || pool.status === 'finalizing') && timestamp - pool.updatedAt > 10 * 60 * 1000;
        if (pool.status === 'complete' || pool.status === 'failed' || invalidOpenPool || staleRound || timestamp - pool.updatedAt > DEPOSIT_POOL_TIMEOUT_MS) {
            delete state.pools[pool.poolId];
            changed = true;
            logger.info('[DepositPool] Pruned', { poolId: pool.poolId, status: pool.status });
        }
    }
    if (changed) {
        writeFileState(state);
    }
}

export async function createDepositPool(denomination: bigint, targetParticipants = DEFAULT_TARGET_PARTICIPANTS) {
    const timestamp = now();
    const pool: DepositPool = {
        poolId: crypto.randomUUID(),
        denomination: denomination.toString(),
        targetParticipants,
        participants: [],
        status: 'open',
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    await savePool(pool);
    logger.info('[DepositPool] Created', {
        poolId: pool.poolId,
        denomination: pool.denomination,
        targetParticipants,
    });
    return pool;
}

export async function findOrCreateDepositPool(denomination: bigint, targetParticipants = DEFAULT_TARGET_PARTICIPANTS) {
    await pruneExpiredDepositPools();
    const pools = await loadPoolsForDenomination(denomination.toString());
    const open = pools.find(pool =>
        pool.status === 'open' &&
        pool.participants.filter(entry => entry.status !== 'cancelled').length < pool.targetParticipants,
    );
    if (open) {
        return open;
    }
    return createDepositPool(denomination, targetParticipants);
}

export async function prepareDepositParticipant(
    denomination: bigint,
    walletAddress: string,
    stealthOutputAddress: string,
) {
    const pool = await findOrCreateDepositPool(denomination);
    const activeCount = pool.participants.filter(entry => entry.status !== 'cancelled').length;
    if (activeCount >= pool.targetParticipants) {
        throw new Error(`Deposit pool ${pool.poolId} is already full. Please retry against the next open pool.`);
    }
    const participant: DepositPoolParticipant = {
        participantId: crypto.randomUUID(),
        walletAddress,
        stealthOutputAddress,
        joinedAt: now(),
        status: 'pending',
    };
    pool.participants.push(participant);
    pool.updatedAt = now();
    await savePool(pool);
    logger.info('[DepositPool] Participant prepared', {
        poolId: pool.poolId,
        participantId: participant.participantId,
        count: `${pool.participants.length}/${pool.targetParticipants}`,
    });
    return { pool, participant };
}

function collectRegisteredCommitments(pool: DepositPool) {
    return pool.participants
        .filter(entry => (entry.status === 'registered' || entry.status === 'finalized') && entry.commitment)
        .map(entry => entry.commitment!);
}

async function finalizeDepositPool(pool: DepositPool) {
    const commitments = collectRegisteredCommitments(pool);
    if (commitments.length < pool.targetParticipants) {
        return pool;
    }

    pool.status = 'ready';
    pool.updatedAt = now();
    await savePool(pool);

    pool.status = 'finalizing';
    pool.updatedAt = now();
    await savePool(pool);

    pool.finalizedCommitments = [...commitments];
    pool.finalizedAt = now();
    pool.status = 'complete';
    pool.updatedAt = now();
    await savePool(pool);

    const successor = (await loadPoolsForDenomination(pool.denomination)).find(candidate =>
        candidate.status === 'open' && candidate.poolId !== pool.poolId,
    );
    if (!successor) {
        await createDepositPool(BigInt(pool.denomination), pool.targetParticipants);
    }

    logger.info('[DepositPool] Finalized', {
        poolId: pool.poolId,
        denomination: pool.denomination,
        registeredCount: commitments.length,
    });

    return pool;
}

export async function registerDepositCommitment(
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
    const pool = await loadPool(poolId);
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
    participant.status = 'minted';
    pool.updatedAt = now();

    const mintedCount = pool.participants.filter(entry => entry.status === 'minted').length;
    if (mintedCount >= pool.targetParticipants) {
        pool.status = 'ready';
    }
    await savePool(pool);

    return {
        poolId: pool.poolId,
        commitments: pool.participants
            .filter(entry => entry.status === 'minted' && entry.commitment)
            .map(entry => entry.commitment!),
        leafIndex: pool.participants
            .filter(entry => entry.status === 'minted' && entry.commitment)
            .findIndex(commitmentEntry => commitmentEntry.participantId === participantId),
        noteCreatedAt: participant.noteCreatedAt ?? participant.joinedAt,
    };
}

export async function attachDepositParticipantSignature(poolId: string, participantId: string, signature: string) {
    const pool = await loadPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participant = pool.participants.find(entry => entry.participantId === participantId);
    if (!participant) {
        throw new Error(`Deposit participant not found: ${participantId}`);
    }

    participant.signaturePayload = signature;
    participant.signature = signature;
    participant.status = 'registered';
    pool.updatedAt = now();
    await savePool(pool);

    return pool;
}

export async function markDepositPoolFinalized(
    poolId: string,
    finalizedCommitments: string[],
    outputIndexByParticipantId: Record<string, number>,
    finalTxHash?: string,
) {
    const pool = await loadPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    pool.status = 'finalizing';
    pool.updatedAt = now();
    await savePool(pool);

    pool.finalizedCommitments = finalizedCommitments;
    pool.finalizedAt = now();
    pool.status = 'complete';
    pool.updatedAt = now();

    for (const participant of pool.participants) {
        if (participant.status === 'registered') {
            participant.status = 'finalized';
        }
        participant.finalOutputIndex = outputIndexByParticipantId[participant.participantId];
        participant.finalTxHash = finalTxHash;
    }

    await savePool(pool);

    const successor = (await loadPoolsForDenomination(pool.denomination)).find(candidate =>
        candidate.status === 'open' && candidate.poolId !== pool.poolId,
    );
    if (!successor) {
        await createDepositPool(BigInt(pool.denomination), pool.targetParticipants);
    }

    return pool;
}

export async function cancelDepositParticipant(poolId: string, participantId: string, reason?: string) {
    const pool = await loadPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participant = pool.participants.find(entry => entry.participantId === participantId);
    if (!participant) {
        throw new Error(`Deposit participant not found: ${participantId}`);
    }

    if (participant.status !== 'registered') {
        participant.status = 'cancelled';
        participant.cancelReason = reason;
        pool.updatedAt = now();
        await savePool(pool);
    }
}

export async function getDepositPool(poolId: string) {
    await pruneExpiredDepositPools();
    return loadPool(poolId);
}

export async function listDepositPools() {
    await pruneExpiredDepositPools();
    if (await isRedisWritable()) {
        const keys = await redis.keys(`${POOL_KEY_PREFIX}*`);
        const pools = await Promise.all(keys.map(async (key) => {
            const raw = await redis.get(key);
            return raw ? (JSON.parse(raw) as DepositPool) : null;
        }));

        return pools
            .filter((pool): pool is DepositPool => pool !== null)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    }

    const state = readFileState();
    return Object.values(state.pools).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getLatestDepositPool(denomination: bigint) {
    await pruneExpiredDepositPools();
    const pools = await loadPoolsForDenomination(denomination.toString());
    return pools.sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

export function summarizeDepositPool(pool: DepositPool) {
    const commitments = pool.finalizedCommitments ?? collectRegisteredCommitments(pool);
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
        finalizedAt: pool.finalizedAt,
    };
}
