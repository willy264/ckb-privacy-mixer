import { InvalidEncodingError, InvariantViolationError } from '../core/errors.js';
import { fqFromLeBytes, type FqHex } from '../crypto/field.js';
import { v1PublicSignalsToFields, type V1PublicSignals } from './statement.js';

export const V1_GROTH16_PROOF_ENCODING = 'groth16-bn254-arkworks-uncompressed-v1' as const;
export const V1_GROTH16_PROOF_BYTES = 256 as const;

export interface V1Groth16Coordinates {
    readonly a: readonly [FqHex, FqHex];
    readonly b: readonly [FqHex, FqHex, FqHex, FqHex];
    readonly c: readonly [FqHex, FqHex];
}

export interface V1Groth16Proof {
    readonly encoding: typeof V1_GROTH16_PROOF_ENCODING;
    readonly bytes: Uint8Array;
    readonly publicSignals: V1PublicSignals;
}

/**
 * Canonically decodes coordinates. This does not claim curve or subgroup
 * validity; use assertV1Groth16Proof with a verifier that performs those checks.
 */
export function decodeV1Groth16Coordinates(bytes: Uint8Array): V1Groth16Coordinates {
    if (bytes.length !== V1_GROTH16_PROOF_BYTES) {
        throw new InvalidEncodingError(`Groth16 proof must contain exactly ${V1_GROTH16_PROOF_BYTES} bytes.`);
    }
    const coordinates = Array.from({ length: 8 }, (_, index) =>
        fqFromLeBytes(bytes.subarray(index * 32, (index + 1) * 32), `proof coordinate ${index}`));
    return Object.freeze({
        a: Object.freeze([coordinates[0], coordinates[1]]) as readonly [FqHex, FqHex],
        b: Object.freeze([coordinates[2], coordinates[3], coordinates[4], coordinates[5]]) as
            readonly [FqHex, FqHex, FqHex, FqHex],
        c: Object.freeze([coordinates[6], coordinates[7]]) as readonly [FqHex, FqHex],
    });
}

export interface V1Groth16Verifier {
    /** Must perform complete curve, subgroup, and pairing verification. */
    verify(
        proof: V1Groth16Proof,
        coordinates: V1Groth16Coordinates,
        options?: { readonly signal?: AbortSignal },
    ): Promise<boolean>;
}

export async function assertV1Groth16Proof(
    proof: V1Groth16Proof,
    verifier: V1Groth16Verifier,
    options?: { readonly signal?: AbortSignal },
): Promise<void> {
    if (proof.encoding !== V1_GROTH16_PROOF_ENCODING) {
        throw new InvalidEncodingError(`Unsupported proof encoding: ${String(proof.encoding)}`);
    }
    v1PublicSignalsToFields(proof.publicSignals);
    const coordinates = decodeV1Groth16Coordinates(proof.bytes);
    if (!(await verifier.verify(proof, coordinates, options))) {
        throw new InvariantViolationError('Groth16 proof failed curve/subgroup/pairing verification.');
    }
}
