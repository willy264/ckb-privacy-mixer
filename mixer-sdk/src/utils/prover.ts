import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';

export interface SnarkProofBundle {
    proof: any;
    publicSignals: string[];
}

export async function generateProof(
    input: any,
    wasmPath: string,
    zkeyPath: string
): Promise<SnarkProofBundle> {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath,
        zkeyPath
    );
    return { proof, publicSignals };
}

/**
 * Packs the proof into a byte array for the CKB contract.
 * The contract expects the proof in uncompressed canonical form (arkworks).
 * SnarkJS proof format: { pi_a: [x, y, z], pi_b: [[x, y], [x, y], [x, y]], pi_c: [x, y, z] }
 */
export function packProofForContract(proof: any): Uint8Array {
    // Note: For a real production system, we would use a robust serialization helper.
    // Here we'll just demonstrate the structure.
    // In actual implementation, we might send the JSON or a custom binary format.
    return new TextEncoder().encode(JSON.stringify(proof));
}
