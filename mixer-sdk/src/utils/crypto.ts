import * as crypto from 'crypto';
import { bytesToHex, concatBytes, hexToBytes, normalizeHex, utf8ToBytes } from './encoding';

function sha256Hex(payload: Uint8Array | string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Derives a Pedersen commitment to a fixed denomination.
 * In production this uses curve25519-dalek via WASM or native bindings.
 * For now, returns a deterministic mock commitment bytes (hex).
 */
export function mockCommitment(amount: bigint, blindingFactor: string): string {
    return sha256Hex(`${amount}:${normalizeHex(blindingFactor)}`);
}

/** Generate a cryptographically secure random blinding factor (32 bytes, hex) */
export function randomBlindingFactor(): string {
    return crypto.randomBytes(32).toString('hex');
}

/** Derive a nullifier from a blinding factor and session id. */
export function deriveNullifier(blindingFactor: string, sessionId: string): string {
    const payload = concatBytes(
        Uint8Array.from([2]),
        hexToBytes(blindingFactor),
        utf8ToBytes(sessionId),
    );
    return bytesToHex(hexToBytes(sha256Hex(payload)));
}
