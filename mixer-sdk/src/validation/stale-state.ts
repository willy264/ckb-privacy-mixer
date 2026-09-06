import { StaleStateError } from '../core/errors.js';
import { outPointsEqual, type OutPointRef, type V1PoolState } from '../protocol/state.js';

export function assertFreshPoolState(
    current: V1PoolState,
    expected: { readonly sequence: bigint; readonly outPoint: OutPointRef },
): void {
    if (current.sequence !== expected.sequence || !outPointsEqual(current.outPoint, expected.outPoint)) {
        throw new StaleStateError('Authoritative PoolState changed while the operation was prepared.', {
            expectedSequence: expected.sequence.toString(),
            currentSequence: current.sequence.toString(),
        });
    }
}
