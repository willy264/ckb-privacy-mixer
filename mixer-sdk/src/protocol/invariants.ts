import { InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, type FieldHex } from '../crypto/field.js';
import { V1_MAX_ACCEPTED_STAGING, type V1PoolConfig } from './pool.js';
import { assertV1StateAndVault, type V1PoolState, type V1VaultState } from './state.js';

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertRootHistoryAppend(
    pool: V1PoolConfig,
    previous: V1PoolState,
    next: V1PoolState,
): void {
    const expected = previous.acceptedRoots.length < pool.rootHistorySize
        ? [...previous.acceptedRoots, next.commitmentRoot]
        : [...previous.acceptedRoots.slice(1), next.commitmentRoot];
    if (!arraysEqual(next.acceptedRoots, expected)) {
        throw new InvariantViolationError('Acceptance must append the new root to the bounded root history.');
    }
}

function assertSameIdentity(
    pool: V1PoolConfig,
    previousState: V1PoolState,
    nextState: V1PoolState,
    previousVault: V1VaultState,
    nextVault: V1VaultState,
): void {
    const poolIds = [previousState.poolId, nextState.poolId, previousVault.poolId, nextVault.poolId];
    const assetIds = [previousState.assetId, nextState.assetId, previousVault.assetId, nextVault.assetId];
    if (poolIds.some(poolId => poolId !== pool.id)) {
        throw new InvariantViolationError('A protocol transition changed or mismatched the pool identity.');
    }
    if (assetIds.some(assetId => assetId !== pool.assetId)) {
        throw new InvariantViolationError('A protocol transition changed or mismatched the asset identity.');
    }
    if (previousState.denomination !== pool.denomination || nextState.denomination !== pool.denomination) {
        throw new InvariantViolationError('A protocol transition changed the fixed denomination.');
    }
    if (nextState.sequence !== previousState.sequence + 1n) {
        throw new InvariantViolationError('A protocol transition must increment state sequence by exactly one.');
    }
}

export function assertAcceptanceTransition(input: {
    readonly pool: V1PoolConfig;
    readonly previousState: V1PoolState;
    readonly nextState: V1PoolState;
    readonly previousVault: V1VaultState;
    readonly nextVault: V1VaultState;
}): void {
    assertV1StateAndVault(input.pool, input.previousState, input.previousVault);
    assertV1StateAndVault(input.pool, input.nextState, input.nextVault);
    assertSameIdentity(
        input.pool,
        input.previousState,
        input.nextState,
        input.previousVault,
        input.nextVault,
    );
    const leafDelta = input.nextState.nextLeafIndex - input.previousState.nextLeafIndex;
    if (leafDelta < 1 || leafDelta > V1_MAX_ACCEPTED_STAGING) {
        throw new InvariantViolationError(
            `Acceptance must append between 1 and ${V1_MAX_ACCEPTED_STAGING} commitments.`,
        );
    }
    if (input.nextState.commitmentRoot === input.previousState.commitmentRoot) {
        throw new InvariantViolationError('Acceptance must update the commitment root.');
    }
    if (input.nextState.nullifierRoot !== input.previousState.nullifierRoot) {
        throw new InvariantViolationError('Acceptance must not change the nullifier root.');
    }
    if (arraysEqual(input.nextState.frontier, input.previousState.frontier)) {
        throw new InvariantViolationError('Acceptance must update the commitment frontier.');
    }
    assertRootHistoryAppend(input.pool, input.previousState, input.nextState);
    const countDelta = BigInt(leafDelta);
    const valueDelta = input.pool.denomination * countDelta;
    if (input.nextState.outstandingCount !== input.previousState.outstandingCount + countDelta ||
        input.nextState.outstandingValue !== input.previousState.outstandingValue + valueDelta) {
        throw new InvariantViolationError('Acceptance accounting must equal the staged commitment batch.');
    }
    if (input.nextVault.amount !== input.previousVault.amount + valueDelta) {
        throw new InvariantViolationError('Acceptance must increase Vault CT by the exact staged batch value.');
    }
    if (input.nextVault.amount !== input.nextState.outstandingValue ||
        input.previousVault.amount !== input.previousState.outstandingValue) {
        throw new InvariantViolationError('Vault CT value must equal PoolState outstanding value.');
    }
}

export function assertWithdrawalTransition(input: {
    readonly pool: V1PoolConfig;
    readonly previousState: V1PoolState;
    readonly nextState: V1PoolState;
    readonly previousVault: V1VaultState;
    readonly nextVault: V1VaultState;
}): void {
    assertV1StateAndVault(input.pool, input.previousState, input.previousVault);
    assertV1StateAndVault(input.pool, input.nextState, input.nextVault);
    assertSameIdentity(
        input.pool,
        input.previousState,
        input.nextState,
        input.previousVault,
        input.nextVault,
    );
    if (input.nextState.nextLeafIndex !== input.previousState.nextLeafIndex ||
        !arraysEqual(input.nextState.frontier, input.previousState.frontier)) {
        throw new InvariantViolationError('Withdrawal must not change the commitment frontier.');
    }
    if (input.nextState.commitmentRoot !== input.previousState.commitmentRoot) {
        throw new InvariantViolationError('Withdrawal must preserve the commitment root.');
    }
    if (input.nextState.nullifierRoot === input.previousState.nullifierRoot) {
        throw new InvariantViolationError('Withdrawal must update the nullifier root.');
    }
    if (!arraysEqual(input.nextState.acceptedRoots, input.previousState.acceptedRoots)) {
        throw new InvariantViolationError('Withdrawal must preserve the accepted commitment roots.');
    }
    if (input.previousState.outstandingCount === 0n ||
        input.nextState.outstandingCount !== input.previousState.outstandingCount - 1n ||
        input.nextState.outstandingValue !== input.previousState.outstandingValue - input.pool.denomination) {
        throw new InvariantViolationError('Withdrawal must decrement outstanding count and value exactly once.');
    }
    if (input.previousVault.amount < input.pool.denomination) {
        throw new InvariantViolationError('Vault does not contain one full denomination.');
    }
    if (input.nextVault.amount !== input.previousVault.amount - input.pool.denomination) {
        throw new InvariantViolationError('Withdrawal must decrease Vault CT by exactly one denomination.');
    }
    if (input.nextVault.amount !== input.nextState.outstandingValue ||
        input.previousVault.amount !== input.previousState.outstandingValue) {
        throw new InvariantViolationError('Vault CT value must equal PoolState outstanding value.');
    }
}

export function assertAcceptedRoot(state: V1PoolState, root: FieldHex): void {
    const canonicalRoot = assertFieldHex(root, 'root');
    const accepted = state.commitmentRoot === canonicalRoot || state.acceptedRoots.includes(canonicalRoot);
    if (!accepted) {
        throw new InvariantViolationError('Withdrawal root is not accepted by the authoritative PoolState.');
    }
}
