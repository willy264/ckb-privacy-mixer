import fs from 'fs';
import path from 'path';

export interface DepositPoolEntry {
    inputOutPoint: string;
    depositTxHash: string;
    stealthOutputAddress: string;
    blindingFactor: string;
    commitment: string;
    createdAt: number;
}

export type DepositPoolStatus = 'open' | 'sealed';

export interface DepositPoolSnapshot {
    sessionId: string;
    denomination: number;
    commitments: string[];
    size: number;
    updatedAt: number;
    status: DepositPoolStatus;
    targetSize: number;
}

interface DepositPoolRecord {
    sessionId: string;
    denomination: number;
    targetSize: number;
    status: DepositPoolStatus;
    entries: DepositPoolEntry[];
    updatedAt: number;
}

interface DepositPoolState {
    version: 2;
    poolsByDenomination: Record<string, DepositPoolRecord[]>;
}

const STORE_VERSION = 2;
const DEFAULT_TARGET_SIZE = 5;

function getRepoRoot() {
    const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    return path.resolve(currentDir, '..', '..', '..');
}

function getStorePath() {
    return path.resolve(getRepoRoot(), 'backend', 'data', 'deposit-sessions.json');
}

function getDefaultState(): DepositPoolState {
    return {
        version: STORE_VERSION,
        poolsByDenomination: {},
    };
}

function ensureStoreDir() {
    fs.mkdirSync(path.dirname(getStorePath()), { recursive: true });
}

function normalizeRecord(record: any): DepositPoolRecord | null {
    if (!record || typeof record !== 'object') {
        return null;
    }

    if (!Array.isArray(record.entries)) {
        return null;
    }

    return {
        sessionId: String(record.sessionId),
        denomination: Number(record.denomination),
        targetSize: Number(record.targetSize ?? DEFAULT_TARGET_SIZE),
        status: record.status === 'sealed' ? 'sealed' : 'open',
        entries: record.entries.map((entry: any) => ({
            inputOutPoint: String(entry.inputOutPoint),
            depositTxHash: String(entry.depositTxHash),
            stealthOutputAddress: String(entry.stealthOutputAddress),
            blindingFactor: String(entry.blindingFactor),
            commitment: String(entry.commitment),
            createdAt: Number(entry.createdAt),
        })),
        updatedAt: Number(record.updatedAt ?? Date.now()),
    };
}

function migrateLegacyState(parsed: any): DepositPoolState {
    if (parsed?.version === 1 && parsed?.pools && typeof parsed.pools === 'object') {
        const migrated: DepositPoolState = getDefaultState();
        for (const record of Object.values(parsed.pools as Record<string, any>)) {
            const normalized = normalizeRecord(record);
            if (!normalized) {
                continue;
            }
            const denominationKey = String(normalized.denomination);
            migrated.poolsByDenomination[denominationKey] = [normalized];
        }
        return migrated;
    }

    return getDefaultState();
}

function loadState(): DepositPoolState {
    const storePath = getStorePath();
    if (!fs.existsSync(storePath)) {
        return getDefaultState();
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as any;
        if (parsed.version !== STORE_VERSION || !parsed.poolsByDenomination || typeof parsed.poolsByDenomination !== 'object') {
            return migrateLegacyState(parsed);
        }

        const poolsByDenomination: Record<string, DepositPoolRecord[]> = {};
        for (const [key, pools] of Object.entries(parsed.poolsByDenomination as Record<string, any[]>)) {
            if (!Array.isArray(pools)) {
                continue;
            }
            poolsByDenomination[key] = pools
                .map(normalizeRecord)
                .filter((record): record is DepositPoolRecord => record !== null)
                .sort((left, right) => left.updatedAt - right.updatedAt);
        }

        return {
            version: STORE_VERSION,
            poolsByDenomination,
        };
    } catch {
        return getDefaultState();
    }
}

function saveState(state: DepositPoolState) {
    ensureStoreDir();
    fs.writeFileSync(getStorePath(), JSON.stringify(state, null, 2));
}

function getPoolSessionId(denomination: number, index: number) {
    return `pudge_ct_pool_${denomination}_${index}`;
}

function getPoolsForDenomination(state: DepositPoolState, denomination: number) {
    const key = String(denomination);
    if (!state.poolsByDenomination[key]) {
        state.poolsByDenomination[key] = [];
    }
    return state.poolsByDenomination[key];
}

function toSnapshot(record: DepositPoolRecord): DepositPoolSnapshot {
    return {
        sessionId: record.sessionId,
        denomination: record.denomination,
        commitments: record.entries.map(entry => entry.commitment),
        size: record.entries.length,
        updatedAt: record.updatedAt,
        status: record.status,
        targetSize: record.targetSize,
    };
}

function ensureOpenPool(pools: DepositPoolRecord[], denomination: number) {
    const existingOpen = pools.find(pool => pool.status === 'open');
    if (existingOpen) {
        return existingOpen;
    }

    const nextIndex = pools.length + 1;
    const createdAt = Date.now();
    const pool: DepositPoolRecord = {
        sessionId: getPoolSessionId(denomination, nextIndex),
        denomination,
        targetSize: DEFAULT_TARGET_SIZE,
        status: 'open',
        entries: [],
        updatedAt: createdAt,
    };
    pools.push(pool);
    return pool;
}

export function upsertDepositIntoPool(
    denomination: number,
    entry: DepositPoolEntry,
): { sessionId: string; commitments: string[]; leafIndex: number; createdAt: number } {
    const state = loadState();
    const pools = getPoolsForDenomination(state, denomination);
    const now = Date.now();

    for (const pool of pools) {
        const existingIndex = pool.entries.findIndex(existing => existing.inputOutPoint === entry.inputOutPoint);
        if (existingIndex >= 0) {
            const commitments = pool.entries.map(existing => existing.commitment);
            return {
                sessionId: pool.sessionId,
                commitments,
                leafIndex: existingIndex,
                createdAt: pool.entries[existingIndex].createdAt,
            };
        }
    }

    const pool = ensureOpenPool(pools, denomination);
    pool.entries.push(entry);
    pool.updatedAt = now;
    if (pool.entries.length >= pool.targetSize) {
        pool.status = 'sealed';
    }

    saveState(state);

    const commitments = pool.entries.map(existing => existing.commitment);
    return {
        sessionId: pool.sessionId,
        commitments,
        leafIndex: commitments.length - 1,
        createdAt: entry.createdAt,
    };
}

export function getDepositSession(sessionId: string): DepositPoolSnapshot | null {
    const state = loadState();
    for (const pools of Object.values(state.poolsByDenomination)) {
        const match = pools.find(pool => pool.sessionId === sessionId);
        if (match) {
            return toSnapshot(match);
        }
    }
    return null;
}

export function listDepositPools(): DepositPoolSnapshot[] {
    const state = loadState();
    return Object.values(state.poolsByDenomination)
        .flatMap(pools => pools)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(toSnapshot);
}

export function getLatestDepositPool(denomination: number): DepositPoolSnapshot | null {
    const state = loadState();
    const pools = getPoolsForDenomination(state, denomination);
    if (pools.length === 0) {
        return null;
    }

    const latest = [...pools].sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return toSnapshot(latest);
}
