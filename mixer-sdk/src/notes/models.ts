import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, assertHex32, type FieldHex, type Hex32 } from '../crypto/field.js';

export type NoteState =
    | 'created'
    | 'staging-submitted'
    | 'staged'
    | 'accepted'
    | 'spent'
    | 'refunded'
    | 'orphaned';

export interface OwnedNote {
    readonly version: 1;
    readonly id: string;
    readonly poolId: Hex32;
    readonly commitment: FieldHex;
    readonly secret: FieldHex;
    readonly nullifierSecret: FieldHex;
    readonly state: NoteState;
    readonly createdAt: number;
    readonly leafIndex?: number;
    readonly acceptedRoot?: FieldHex;
}

export interface NoteMetadata {
    readonly id: string;
    readonly poolId: Hex32;
    readonly commitment: FieldHex;
    readonly state: NoteState;
    readonly createdAt: number;
    readonly leafIndex?: number;
    readonly acceptedRoot?: FieldHex;
    /** Whether the note currently has a retained root usable for withdrawal. */
    readonly proofStatus: 'ready' | 'root-expired' | 'state-unavailable' | 'not-applicable';
    readonly spendable: boolean;
}

const NOTE_TRANSITIONS: Readonly<Record<NoteState, readonly NoteState[]>> = {
    created: ['staging-submitted', 'orphaned'],
    'staging-submitted': ['staged', 'refunded', 'orphaned'],
    staged: ['accepted', 'refunded', 'orphaned'],
    accepted: ['spent', 'staged', 'orphaned'],
    spent: ['accepted', 'orphaned'],
    refunded: ['staged', 'orphaned'],
    orphaned: ['staged', 'accepted'],
};

export function assertOwnedNote(note: OwnedNote): OwnedNote {
    if (note.version !== 1) {
        throw new InvalidArgumentError('Owned note must use the Obscell V1 schema.');
    }
    if (!note.id || note.id.length > 256) {
        throw new InvalidArgumentError('Owned note id must contain between 1 and 256 characters.');
    }
    if (!Object.prototype.hasOwnProperty.call(NOTE_TRANSITIONS, note.state)) {
        throw new InvalidArgumentError(`Unknown owned note state: ${String(note.state)}`);
    }
    assertHex32(note.poolId, 'note.poolId');
    if (BigInt(assertFieldHex(note.commitment, 'note.commitment')) === 0n) {
        throw new InvalidArgumentError('note.commitment must not be zero.');
    }
    if (BigInt(assertFieldHex(note.secret, 'note.secret')) === 0n) {
        throw new InvalidArgumentError('note.secret must not be zero.');
    }
    if (BigInt(assertFieldHex(note.nullifierSecret, 'note.nullifierSecret')) === 0n) {
        throw new InvalidArgumentError('note.nullifierSecret must not be zero.');
    }
    if (!Number.isSafeInteger(note.createdAt) || note.createdAt < 0) {
        throw new InvalidArgumentError('note.createdAt must be a non-negative millisecond timestamp.');
    }
    if (note.leafIndex !== undefined &&
        (!Number.isSafeInteger(note.leafIndex) || note.leafIndex < 0 || note.leafIndex >= 2 ** 20)) {
        throw new InvalidArgumentError('note.leafIndex must be inside the V1 depth-20 tree.');
    }
    if (note.acceptedRoot !== undefined) {
        assertFieldHex(note.acceptedRoot, 'note.acceptedRoot');
    }
    if ((note.state === 'accepted' || note.state === 'spent') &&
        (note.leafIndex === undefined || note.acceptedRoot === undefined)) {
        throw new InvariantViolationError('Accepted and spent notes require a leaf index and accepted root.');
    }
    return note;
}

export function assertNoteTransition(previous: NoteState, next: NoteState): void {
    if (!NOTE_TRANSITIONS[previous].includes(next)) {
        throw new InvariantViolationError(`Invalid note transition: ${previous} -> ${next}`, {
            previous,
            next,
        });
    }
}

export function transitionNote(
    note: OwnedNote,
    next: NoteState,
    update: Partial<Pick<OwnedNote, 'leafIndex' | 'acceptedRoot'>> = {},
): OwnedNote {
    assertOwnedNote(note);
    assertNoteTransition(note.state, next);
    return assertOwnedNote(Object.freeze({ ...note, ...update, state: next }));
}

export function isNoteSpendable(
    note: OwnedNote,
    acceptedRoots?: readonly FieldHex[],
): boolean {
    const valid = assertOwnedNote(note);
    return valid.state === 'accepted' && valid.acceptedRoot !== undefined &&
        acceptedRoots !== undefined && acceptedRoots.includes(valid.acceptedRoot);
}

export function toNoteMetadata(
    note: OwnedNote,
    acceptedRoots?: readonly FieldHex[],
): NoteMetadata {
    const valid = assertOwnedNote(note);
    const proofStatus = valid.state !== 'accepted'
        ? 'not-applicable'
        : acceptedRoots === undefined
            ? 'state-unavailable'
            : acceptedRoots.includes(valid.acceptedRoot!)
                ? 'ready'
                : 'root-expired';
    return Object.freeze({
        id: valid.id,
        poolId: valid.poolId,
        commitment: valid.commitment,
        state: valid.state,
        createdAt: valid.createdAt,
        leafIndex: valid.leafIndex,
        acceptedRoot: valid.acceptedRoot,
        proofStatus,
        spendable: proofStatus === 'ready',
    });
}
