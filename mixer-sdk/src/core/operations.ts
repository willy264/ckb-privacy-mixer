import { InvariantViolationError } from './errors.js';

export type PrivacyOperationKind = 'shield' | 'refund' | 'unshield';

export type PrivacyOperationState =
    | 'queued'
    | 'awaiting-signature'
    | 'submitted'
    | 'committed'
    | 'failed';

export interface PrivacyOperation {
    readonly id: string;
    readonly kind: PrivacyOperationKind;
    readonly poolId: string;
    readonly state: PrivacyOperationState;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly transactionHash?: string;
    readonly failureCode?: string;
}

const OPERATION_TRANSITIONS: Readonly<Record<PrivacyOperationState, readonly PrivacyOperationState[]>> = {
    queued: ['awaiting-signature', 'submitted', 'failed'],
    'awaiting-signature': ['submitted', 'failed'],
    submitted: ['committed', 'failed'],
    committed: [],
    failed: [],
};

export function assertOperationTransition(
    previous: PrivacyOperationState,
    next: PrivacyOperationState,
): void {
    if (!OPERATION_TRANSITIONS[previous].includes(next)) {
        throw new InvariantViolationError(
            `Invalid privacy operation transition: ${previous} -> ${next}`,
            { previous, next },
        );
    }
}

export function transitionOperation(
    operation: PrivacyOperation,
    next: PrivacyOperationState,
    update: Pick<PrivacyOperation, 'updatedAt'> &
        Partial<Pick<PrivacyOperation, 'transactionHash' | 'failureCode'>>,
): PrivacyOperation {
    assertOperationTransition(operation.state, next);
    return Object.freeze({ ...operation, ...update, state: next });
}
