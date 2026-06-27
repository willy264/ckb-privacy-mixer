import * as snarkjs from 'snarkjs';
import type { PackedGroth16Proof, ProofEncoding } from '../types/proof.js';

export interface SnarkProofBundle {
    proof: any;
    publicSignals: string[];
}

export const GROTH16_PROOF_ENCODING: ProofEncoding = 'groth16-bn254-arkworks-uncompressed-v1';

export async function generateProof(
    input: any,
    wasmPath: string,
    zkeyPath: string,
): Promise<SnarkProofBundle> {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    return { proof, publicSignals };
}

function packRawProof(proof: any): Uint8Array {
    const result = new Uint8Array(256);
    let offset = 0;

    const writeBigInt = (value: string, length: number) => {
        const bigint = BigInt(value);
        for (let i = 0; i < length; i += 1) {
            result[offset + i] = Number((bigint >> BigInt(i * 8)) & 0xffn);
        }
        offset += length;
    };

    writeBigInt(proof.pi_a[0], 32);
    writeBigInt(proof.pi_a[1], 32);

    writeBigInt(proof.pi_b[0][1], 32);
    writeBigInt(proof.pi_b[0][0], 32);
    writeBigInt(proof.pi_b[1][1], 32);
    writeBigInt(proof.pi_b[1][0], 32);

    writeBigInt(proof.pi_c[0], 32);
    writeBigInt(proof.pi_c[1], 32);

    return result;
}

export function packProofForContract(proof: any): Uint8Array {
    return packGroth16Proof(proof).bytes;
}

export function packGroth16Proof(proof: any): PackedGroth16Proof {
    return {
        encoding: GROTH16_PROOF_ENCODING,
        bytes: packRawProof(proof),
    };
}
