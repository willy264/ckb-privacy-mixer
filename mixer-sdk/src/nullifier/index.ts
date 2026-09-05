import { InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, type FieldHex } from '../crypto/field.js';
import { deriveV1NullifierHash } from '../crypto/commitment.js';

export const deriveNullifierForLeaf = deriveV1NullifierHash;

export interface NullifierSmtProof {
    readonly key: FieldHex;
    readonly root: FieldHex;
    readonly isSpent: boolean;
    readonly proof: Uint8Array;
}

export interface NullifierStateReader {
    getRoot(options?: { readonly signal?: AbortSignal }): Promise<FieldHex>;
    getProof(
        nullifierHash: FieldHex,
        options?: { readonly signal?: AbortSignal },
    ): Promise<NullifierSmtProof>;
}

export interface NullifierSmtVerifier {
    /** Verify the sparse-Merkle proof against its root, key, and claimed value. */
    verify(
        proof: NullifierSmtProof,
        options?: { readonly signal?: AbortSignal },
    ): Promise<boolean>;
}

export interface NullifierTransition {
    readonly nullifierHash: FieldHex;
    readonly previousRoot: FieldHex;
    readonly nextRoot: FieldHex;
    readonly previousValue: 0;
    readonly nextValue: 1;
    readonly proof: Uint8Array;
}

export async function assertUnspentNullifierProof(
    expectedRoot: FieldHex,
    expectedNullifier: FieldHex,
    proof: NullifierSmtProof,
    verifier: NullifierSmtVerifier,
    options?: { readonly signal?: AbortSignal },
): Promise<void> {
    if (assertFieldHex(proof.root, 'nullifier proof root') !== assertFieldHex(expectedRoot)) {
        throw new InvariantViolationError('Nullifier proof is for a different authoritative root.');
    }
    if (assertFieldHex(proof.key, 'nullifier proof key') !== assertFieldHex(expectedNullifier)) {
        throw new InvariantViolationError('Nullifier proof is for a different nullifier.');
    }
    if (proof.isSpent) {
        throw new InvariantViolationError('Nullifier is already spent.');
    }
    if (proof.proof.length === 0) {
        throw new InvariantViolationError('Nullifier SMT proof must not be empty.');
    }
    if (!verifier || typeof verifier.verify !== 'function' || !(await verifier.verify(proof, options))) {
        throw new InvariantViolationError('Nullifier SMT proof verification failed.');
    }
}

export function assertNullifierTransition(transition: NullifierTransition): void {
    assertFieldHex(transition.nullifierHash, 'nullifierHash');
    assertFieldHex(transition.previousRoot, 'previousRoot');
    assertFieldHex(transition.nextRoot, 'nextRoot');
    if (transition.previousValue !== 0 || transition.nextValue !== 1) {
        throw new InvariantViolationError('V1 nullifier transition must be exactly 0 -> 1.');
    }
    if (transition.previousRoot === transition.nextRoot) {
        throw new InvariantViolationError('Nullifier transition must change the SMT root.');
    }
    if (transition.proof.length === 0) {
        throw new InvariantViolationError('Nullifier transition must carry an SMT proof.');
    }
}
