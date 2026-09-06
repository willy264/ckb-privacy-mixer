import { InvariantViolationError } from '../core/errors.js';
import { assertHex32, type Hex32 } from '../crypto/field.js';
import type { V1PoolConfig } from '../protocol/pool.js';

export function assertPoolAsset(pool: V1PoolConfig, assetId: Hex32 | string): void {
    if (assertHex32(assetId, 'assetId') !== pool.assetId) {
        throw new InvariantViolationError('Asset does not match the selected privacy pool.');
    }
}
