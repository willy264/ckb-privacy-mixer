import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';

export function assertFeeWithinLimit(actualFee: bigint, maximumFee: bigint): void {
    if (actualFee < 0n || maximumFee < 0n) {
        throw new InvalidArgumentError('Fee values must not be negative.');
    }
    if (actualFee > maximumFee) {
        throw new InvariantViolationError('Transaction fee exceeds the caller-authorized ceiling.', {
            actualFee: actualFee.toString(),
            maximumFee: maximumFee.toString(),
        });
    }
}
