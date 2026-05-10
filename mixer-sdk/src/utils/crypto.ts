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
 * leaf = Poseidon(blindingFactor, sessionId)
 */
export async function deriveCommitment(blindingFactor: string, sessionId: string): Promise<string> {
    const p = await getPoseidon();
    // Convert hex strings to BigInts for Poseidon
    const bf = BigInt('0x' + normalizeHex(blindingFactor));
    // For sessionId, we'll hash it to a field element if it's a string, or just use it if it's already hex
    const sid = sessionId.startsWith('0x') 
        ? BigInt(sessionId)
        : BigInt('0x' + Array.from(crypto.createHash('sha256').update(sessionId).digest() as any as Uint8Array, b => b.toString(16).padStart(2, '0')).join('')) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    const hash = p([bf, sid]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}

/** Generate a cryptographically secure random blinding factor (32 bytes, hex) */
export function randomBlindingFactor(): string {
    // Ensure the blinding factor is within the field prime
    let bytes = crypto.randomBytes(31) as any as Uint8Array;
    return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').padStart(64, '0');
}

/** 
 * Derive a nullifier from a blinding factor and session id. 
 * nullifier = Poseidon(blindingFactor, sessionId, 1)
 */
export async function deriveNullifier(blindingFactor: string, sessionId: string): Promise<string> {
    const p = await getPoseidon();
    const bf = BigInt('0x' + normalizeHex(blindingFactor));
    const sid = sessionId.startsWith('0x') 
        ? BigInt(sessionId)
        : BigInt('0x' + Array.from(crypto.createHash('sha256').update(sessionId).digest() as any as Uint8Array, b => b.toString(16).padStart(2, '0')).join('')) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

    const hash = p([bf, sid, 1n]);
    return '0x' + BigInt(p.F.toString(hash)).toString(16).padStart(64, '0');
}
