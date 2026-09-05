import type { PrivacyOperation } from '../core/operations.js';
import { InvariantViolationError, StaleStateError } from '../core/errors.js';
import {
    assertProtocolSnapshot,
    outPointsEqual,
    type V1ProtocolSnapshot,
} from '../protocol/state.js';
import { assertOwnedNote, type OwnedNote } from './models.js';

export interface PrivacyStateStore {
    readonly protection: 'encrypted-at-rest' | 'memory-only';
    listNotes(poolId: string): Promise<readonly OwnedNote[]>;
    getNote(noteId: string): Promise<OwnedNote | undefined>;
    putNote(note: OwnedNote): Promise<void>;
    getPoolSnapshot(poolId: string): Promise<V1ProtocolSnapshot | undefined>;
    putPoolSnapshot(snapshot: V1ProtocolSnapshot): Promise<void>;
    /**
     * Atomically persist one validated sync result only if the stored checkpoint
     * still equals expectedPrevious. StaleStateError is safe to retry from a
     * freshly read snapshot. Initial synchronization must pass undefined.
     */
    commitSync(
        snapshot: V1ProtocolSnapshot,
        notes: readonly OwnedNote[],
        expectedPrevious: V1ProtocolSnapshot | undefined,
    ): Promise<void>;
    getOperation(operationId: string): Promise<PrivacyOperation | undefined>;
    putOperation(operation: PrivacyOperation): Promise<void>;
}

function cloneNote(note: OwnedNote): OwnedNote {
    return Object.freeze({ ...note });
}

export function samePrivacySyncCheckpoint(
    current: V1ProtocolSnapshot | undefined,
    expected: V1ProtocolSnapshot | undefined,
): boolean {
    if (current === undefined || expected === undefined) {
        return current === expected;
    }
    return current.pool.id === expected.pool.id &&
        current.state.sequence === expected.state.sequence &&
        outPointsEqual(current.state.outPoint, expected.state.outPoint) &&
        outPointsEqual(current.vault.outPoint, expected.vault.outPoint) &&
        current.blockHash === expected.blockHash &&
        current.blockNumber === expected.blockNumber;
}

/** Test/development store. Applications must use an encrypted-at-rest implementation. */
export class InMemoryPrivacyStateStore implements PrivacyStateStore {
    readonly protection = 'memory-only' as const;
    private readonly notes = new Map<string, OwnedNote>();
    private readonly snapshots = new Map<string, V1ProtocolSnapshot>();
    private readonly operations = new Map<string, PrivacyOperation>();

    async listNotes(poolId: string): Promise<readonly OwnedNote[]> {
        return [...this.notes.values()]
            .filter(note => note.poolId === poolId)
            .map(cloneNote);
    }

    async getNote(noteId: string): Promise<OwnedNote | undefined> {
        const note = this.notes.get(noteId);
        return note ? cloneNote(note) : undefined;
    }

    async putNote(note: OwnedNote): Promise<void> {
        const valid = assertOwnedNote(note);
        this.notes.set(valid.id, cloneNote(valid));
    }

    async getPoolSnapshot(poolId: string): Promise<V1ProtocolSnapshot | undefined> {
        return this.snapshots.get(poolId);
    }

    async putPoolSnapshot(snapshot: V1ProtocolSnapshot): Promise<void> {
        const valid = assertProtocolSnapshot(snapshot);
        this.snapshots.set(valid.pool.id, valid);
    }

    async commitSync(
        snapshot: V1ProtocolSnapshot,
        notes: readonly OwnedNote[],
        expectedPrevious: V1ProtocolSnapshot | undefined,
    ): Promise<void> {
        const validSnapshot = assertProtocolSnapshot(snapshot);
        const validated = notes.map(note => cloneNote(assertOwnedNote(note)));
        if (validated.some(note => note.poolId !== validSnapshot.pool.id)) {
            throw new InvariantViolationError('Atomic sync notes must all belong to the snapshot pool.');
        }
        const ids = validated.map(note => note.id);
        if (new Set(ids).size !== ids.length) {
            throw new InvariantViolationError('Atomic sync contains duplicate note ids.');
        }

        const current = this.snapshots.get(validSnapshot.pool.id);
        if (!samePrivacySyncCheckpoint(current, expectedPrevious)) {
            throw new StaleStateError(
                'Private state changed during synchronization; retry from the latest snapshot.',
                {
                    retryable: true,
                    expectedSequence: expectedPrevious?.state.sequence.toString() ?? 'none',
                    currentSequence: current?.state.sequence.toString() ?? 'none',
                },
            );
        }

        this.snapshots.set(validSnapshot.pool.id, validSnapshot);
        for (const note of validated) {
            this.notes.set(note.id, note);
        }
    }

    async getOperation(operationId: string): Promise<PrivacyOperation | undefined> {
        return this.operations.get(operationId);
    }

    async putOperation(operation: PrivacyOperation): Promise<void> {
        this.operations.set(operation.id, Object.freeze({ ...operation }));
    }
}
