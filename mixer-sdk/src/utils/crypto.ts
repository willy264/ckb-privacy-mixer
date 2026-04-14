import * as crypto from 'crypto';

/**
 * Derives a Pedersen commitment to a fixed denomination.
 * In production this uses curve25519-dalek via WASM or native bindings.
 * For now, returns a deterministic mock commitment bytes (hex).
 */
export function mockCommitment(amount: bigint, blindingFactor: string): string {
    const hash = crypto
        .createHash('sha256')
        .update(`${amount}:${blindingFactor}`)
        .digest('hex');
    return hash;
}

/** Generate a cryptographically secure random blinding factor (32 bytes, hex) */
export function randomBlindingFactor(): string {
    return crypto.randomBytes(32).toString('hex');
}

/** Derive a nullifier from a blinding factor and session id (Phase 3 stub) */
export function deriveNullifier(blindingFactor: string, sessionId: string): string {
    return crypto
        .createHash('sha256')
        .update(`nullifier:${blindingFactor}:${sessionId}`)
        .digest('hex');
}
