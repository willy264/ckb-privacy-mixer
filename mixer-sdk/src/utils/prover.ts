import * as snarkjs from 'snarkjs';

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
 * SnarkJS proof format: { pi_a: [x, y, z], pi_b: [[x_c0, x_c1], [y_c0, y_c1], [1, 0]], pi_c: [x, y, z] }
 * Arkworks BN254 Proof format (uncompressed):
 * - A: G1 (x: 32 bytes LE, y: 32 bytes LE)
 * - B: G2 (x: 32+32 bytes LE (c0, c1), y: 32+32 bytes LE (c0, c1))
 * - C: G1 (x: 32 bytes LE, y: 32 bytes LE)
 * Total: 64 + 128 + 64 = 256 bytes.
 */
export function packProofForContract(proof: any): Uint8Array {
    const result = new Uint8Array(256);
    let offset = 0;

    const writeBigInt = (val: string, length: number) => {
        const b = BigInt(val);
        for (let i = 0; i < length; i++) {
            result[offset + i] = Number((b >> BigInt(i * 8)) & 0xffn);
        }
        offset += length;
    };

    // Pi_A (G1)
    writeBigInt(proof.pi_a[0], 32);
    writeBigInt(proof.pi_a[1], 32);

    // Pi_B (G2)
    // SnarkJS pi_b is [[x_c1, x_c0], [y_c1, y_c0]] - wait, let me check snarkjs order
    // Actually SnarkJS/Ethereum uses [c1, c0] for G2 components.
    // Arkworks expects [c0, c1].
    writeBigInt(proof.pi_b[0][1], 32); // B.x.c0
    writeBigInt(proof.pi_b[0][0], 32); // B.x.c1
    writeBigInt(proof.pi_b[1][1], 32); // B.y.c0
    writeBigInt(proof.pi_b[1][0], 32); // B.y.c1

    // Pi_C (G1)
    writeBigInt(proof.pi_c[0], 32);
    writeBigInt(proof.pi_c[1], 32);

    return result;
}
