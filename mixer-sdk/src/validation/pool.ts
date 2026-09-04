import type { V1PoolConfig } from '../protocol/pool.js';
import { findPool } from '../protocol/pool.js';

export function validatePoolSelection(
    pools: readonly V1PoolConfig[],
    poolId: string,
): V1PoolConfig {
    return findPool(pools, poolId);
}
