import { InvalidEncodingError, InvariantViolationError } from '../core/errors.js';
import { assertOwnedNote, type OwnedNote } from './models.js';

export interface EncryptedPayload {
    readonly algorithm: string;
    readonly nonce: Uint8Array;
    readonly ciphertext: Uint8Array;
}

export interface NoteCipher {
    encrypt(
        plaintext: Uint8Array,
        associatedData: Uint8Array,
    ): Promise<EncryptedPayload>;
    decrypt(
        payload: EncryptedPayload,
        associatedData: Uint8Array,
    ): Promise<Uint8Array>;
}

export interface EncryptedNoteEnvelope {
    readonly version: 1;
    readonly noteId: string;
    readonly poolId: string;
    readonly commitment: string;
    readonly payload: EncryptedPayload;
}

function envelopeAssociatedData(envelope: Pick<EncryptedNoteEnvelope, 'version' | 'noteId' | 'poolId' | 'commitment'>): Uint8Array {
    return new TextEncoder().encode(JSON.stringify([
        envelope.version,
        envelope.noteId,
        envelope.poolId,
        envelope.commitment,
    ]));
}

export async function sealOwnedNote(
    note: OwnedNote,
    cipher: NoteCipher,
): Promise<EncryptedNoteEnvelope> {
    const valid = assertOwnedNote(note);
    const header = {
        version: 1 as const,
        noteId: valid.id,
        poolId: valid.poolId,
        commitment: valid.commitment,
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(valid));
    const payload = await cipher.encrypt(plaintext, envelopeAssociatedData(header));
    if (!payload.algorithm || payload.nonce.length === 0 || payload.ciphertext.length === 0) {
        throw new InvalidEncodingError('Note cipher returned an incomplete encrypted payload.');
    }
    return Object.freeze({ ...header, payload });
}

export async function openOwnedNote(
    envelope: EncryptedNoteEnvelope,
    cipher: NoteCipher,
): Promise<OwnedNote> {
    if (envelope.version !== 1 || !envelope.payload?.algorithm ||
        envelope.payload.nonce.length === 0 || envelope.payload.ciphertext.length === 0) {
        throw new InvalidEncodingError('Encrypted note envelope is malformed.');
    }

    let parsed: unknown;
    try {
        const plaintext = await cipher.decrypt(envelope.payload, envelopeAssociatedData(envelope));
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch (error) {
        throw new InvalidEncodingError('Encrypted note could not be authenticated and decoded.', undefined);
    }

    const note = assertOwnedNote(parsed as OwnedNote);
    if (note.id !== envelope.noteId || note.poolId !== envelope.poolId ||
        note.commitment !== envelope.commitment) {
        throw new InvariantViolationError('Encrypted note metadata does not match its authenticated envelope.');
    }
    return note;
}
