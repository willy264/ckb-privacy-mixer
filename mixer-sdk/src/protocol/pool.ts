import { InvalidArgumentError } from '../core/errors.js';
import {
    assertFieldHex,
    assertHex32,
    fieldFromBigInt,
    type FieldHex,
    type Hex32,
} from '../crypto/field.js';

export const V1_MERKLE_DEPTH = 20 as const;
export const V1_MAX_ROOT_HISTORY_SIZE = 32 as const;
export const V1_MAX_ACCEPTED_STAGING = 16 as const;

export interface V1PoolConfig {
    readonly id: Hex32;
    readonly poolDomain: FieldHex;
    readonly assetId: Hex32;
    readonly assetDomain: FieldHex;
    readonly denomination: bigint;
    readonly treeDepth: typeof V1_MERKLE_DEPTH;
    readonly rootHistorySize: number;
}

export function assertV1PoolConfig(pool: V1PoolConfig): V1PoolConfig {
    const poolId = assertHex32(pool.id, 'pool.id');
    assertFieldHex(pool.poolDomain, 'pool.poolDomain');
    const assetId = assertHex32(pool.assetId, 'pool.assetId');
    assertFieldHex(pool.assetDomain, 'pool.assetDomain');
    fieldFromBigInt(pool.denomination, 'pool.denomination');

    if (pool.denomination <= 0n) {
        throw new InvalidArgumentError('Pool denomination must be positive.');
    }
    if (BigInt(poolId) === 0n || BigInt(assetId) === 0n) {
        throw new InvalidArgumentError('Pool and asset identities must not be zero.');
    }
    if (pool.denomination >= 1n << 128n) {
        throw new InvalidArgumentError('Pool denomination must fit the V1 unsigned 128-bit encoding.');
    }
    if (pool.treeDepth !== V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError(`Obscell V1 requires a depth-${V1_MERKLE_DEPTH} Merkle tree.`);
    }
    if (!Number.isSafeInteger(pool.rootHistorySize) || pool.rootHistorySize < 1 ||
        pool.rootHistorySize > V1_MAX_ROOT_HISTORY_SIZE) {
        throw new InvalidArgumentError(
            `V1 rootHistorySize must be between 1 and ${V1_MAX_ROOT_HISTORY_SIZE}.`,
        );
    }
    return pool;
}

export function findPool(pools: readonly V1PoolConfig[], poolId: string): V1PoolConfig {
    const canonicalPoolId = assertHex32(poolId, 'poolId');
    const pool = pools.find(candidate => candidate.id === canonicalPoolId);
    if (!pool) {
        throw new InvalidArgumentError(`Unknown privacy pool: ${poolId}`, { poolId });
    }
    return assertV1PoolConfig(pool);
}
