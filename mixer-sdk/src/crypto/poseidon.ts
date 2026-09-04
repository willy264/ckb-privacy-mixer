import { buildPoseidon } from 'circomlibjs';
import { InvalidArgumentError } from '../core/errors.js';
import {
    assertFieldHex,
    bytesToBigIntLe,
    fieldFromBigInt,
    fieldToBigInt,
    type FieldHex,
} from './field.js';

let poseidonPromise: Promise<any> | undefined;

export const V1_BYTE_SPONGE_CHUNK_BYTES = 31 as const;

async function getPoseidon(): Promise<any> {
    poseidonPromise ??= buildPoseidon();
    return poseidonPromise;
}

export async function poseidonHash(
    inputs: readonly (FieldHex | string | bigint)[],
): Promise<FieldHex> {
    if (inputs.length === 0) {
        throw new InvalidArgumentError('Poseidon requires at least one input.');
    }

    const canonicalInputs = inputs.map((input, index) => {
        if (typeof input === 'bigint') {
            return fieldToBigInt(fieldFromBigInt(input, `Poseidon input ${index}`));
        }
        return fieldToBigInt(assertFieldHex(input, `Poseidon input ${index}`));
    });

    const poseidon = await getPoseidon();
    const result = poseidon(canonicalInputs);
    return fieldFromBigInt(BigInt(poseidon.F.toString(result)));
}

export async function poseidonHashBytes(
    domain: FieldHex,
    bytes: Uint8Array,
): Promise<FieldHex> {
    // s_0 = Poseidon(domain, byteLength)
    // s_{i+1} = Poseidon(domain, s_i, i, unsignedLE(chunk_i))
    // Chunks are sequential, at most 31 bytes, and are never padded. The
    // explicit total length and index remove trailing-zero/boundary ambiguity.
    let state = await poseidonHash([domain, BigInt(bytes.length)]);
    for (let offset = 0, chunkIndex = 0;
        offset < bytes.length;
        offset += V1_BYTE_SPONGE_CHUNK_BYTES, chunkIndex += 1) {
        const chunk = bytes.subarray(
            offset,
            Math.min(offset + V1_BYTE_SPONGE_CHUNK_BYTES, bytes.length),
        );
        state = await poseidonHash([
            domain,
            state,
            BigInt(chunkIndex),
            bytesToBigIntLe(chunk),
        ]);
    }
    return state;
}
