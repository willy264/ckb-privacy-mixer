import * as crypto from 'crypto';
import { buildPoseidon } from 'circomlibjs';
import { normalizeHex } from './encoding';

let poseidon: any;

async function getPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
    }
    return poseidon;
}

/**
 * Derives a Poseidon commitment (leaf) for the mixer tree.
 * leaf = Poseidon(secret, nullifier)
 */
export async function deriveCommitment(secret: string, nullifier: string): Promise<string> {
    const p = await getPoseidon();
    const s = BigInt('0x' + normalizeHex(secret));
    const n = BigInt('0x' + normalizeHex(nullifier));

    const hash = p([s, n]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}

/** Generate a cryptographically secure random 31-byte field element (hex) */
export function randomSecret(): string {
    // Ensure the random bytes fit within the BN254 scalar field
    let bytes = crypto.randomBytes(31) as any as Uint8Array;
    return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').padStart(64, '0');
}

/** Backward-compatible alias used by older examples and transitional code. */
export function randomBlindingFactor(): string {
    return randomSecret();
}

/**
 * Backward-compatible nullifier derivation used by the live transitional runtime.
 * The current direct-withdrawal path expects a deterministic 32-byte nullifier hex.
 */
export async function deriveNullifier(blindingFactor: string, sessionId: string): Promise<string> {
    const p = await getPoseidon();
    const blinding = BigInt('0x' + normalizeHex(blindingFactor));
    const session = BigInt(
        sessionId.startsWith('0x')
            ? sessionId
            : `0x${crypto.createHash('sha256').update(sessionId).digest('hex')}`,
    );
    const hash = p([blinding, session, 1n]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}

/** 
 * Derive a nullifier hash from a nullifier secret. 
 * nullifierHash = Poseidon(nullifier)
 */
export async function deriveNullifierHash(nullifier: string): Promise<string> {
    const p = await getPoseidon();
    const n = BigInt('0x' + normalizeHex(nullifier));

    const hash = p([n]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}
