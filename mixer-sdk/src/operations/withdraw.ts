import { DepositNote } from '../types/note';
import { deriveNullifier } from '../utils/crypto';

const SPENT_NULLIFIERS = new Set<string>();

function normalizeHex(value: string): string {
    return value.startsWith('0x') ? value.slice(2) : value;
}

function validateNote(note: DepositNote) {
    if (!note.sessionId) {
        throw new Error('Missing sessionId in deposit note');
    }
    if (!note.inputOutPoint) {
        throw new Error('Missing inputOutPoint in deposit note');
    }
    if (!note.stealthOutputAddress) {
        throw new Error('Missing stealthOutputAddress in deposit note');
    }

    const blindingFactor = normalizeHex(note.blindingFactor);
    if (!/^[0-9a-fA-F]{64}$/.test(blindingFactor)) {
        throw new Error('Deposit note blindingFactor must be a 32-byte hex string');
    }
}

export function getSpentNullifiers(): string[] {
    return [...SPENT_NULLIFIERS];
}

export function clearSpentNullifiers() {
    SPENT_NULLIFIERS.clear();
}

export async function withdrawMix(note: DepositNote): Promise<string> {
    validateNote(note);

    const nullifier = deriveNullifier(normalizeHex(note.blindingFactor), note.sessionId);
    if (SPENT_NULLIFIERS.has(nullifier)) {
        throw new Error(`Nullifier already used: ${nullifier}`);
    }

    SPENT_NULLIFIERS.add(nullifier);

    // Mock tx hash until live nullifier-registry transaction building is added.
    return `0xwithdraw_${nullifier.slice(0, 56)}`;
}
