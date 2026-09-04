import { CellAny, type CellOutputLike, type HexLike } from '@ckb-ccc/core';
import { InvariantViolationError } from '../core/errors.js';

export const SHANNONS_PER_CKB = 100_000_000n;

export function minimumCellCapacity(
    cellOutput: CellOutputLike,
    outputData: HexLike = '0x',
): bigint {
    const cell = CellAny.from({ cellOutput, outputData });
    return BigInt(cell.occupiedSize) * SHANNONS_PER_CKB;
}

export function assertCellCapacity(
    cellOutput: CellOutputLike,
    outputData: HexLike = '0x',
): void {
    const cell = CellAny.from({ cellOutput, outputData });
    const required = BigInt(cell.occupiedSize) * SHANNONS_PER_CKB;
    if (cell.cellOutput.capacity < required) {
        throw new InvariantViolationError('CKB cell capacity is below occupied capacity.', {
            required: required.toString(),
            actual: cell.cellOutput.capacity.toString(),
        });
    }
}
