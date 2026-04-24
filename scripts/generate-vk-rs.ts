import * as fs from 'fs';
import * as path from 'path';

function main() {
    const vkPath = path.resolve('circuits/verification_key.json');
    const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));

    // Helper to format a large decimal string into a Rust big integer (u64 limbs)
    function toLimbs(numStr: string): string {
        let hex = BigInt(numStr).toString(16);
        hex = hex.padStart(64, '0'); // 256 bits = 64 hex chars
        
        // Split into 4 u64 limbs, little endian order
        const limbs = [];
        for (let i = 0; i < 4; i++) {
            const start = 64 - (i + 1) * 16;
            const chunk = hex.slice(start, start + 16);
            limbs.push(`0x${chunk}`);
        }
        return `[${limbs.join(', ')}]`;
    }

    let rsCode = `// Auto-generated verification key
use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_ff::BigInteger256;
use ark_groth16::VerifyingKey;
use ark_ec::pairing::Pairing;

pub fn get_vk() -> VerifyingKey<Bn254> {
    VerifyingKey {
        alpha_g1: G1Affine::new(
            Fq::new(BigInteger256::new(${toLimbs(vk.vk_alpha_1[0])})),
            Fq::new(BigInteger256::new(${toLimbs(vk.vk_alpha_1[1])}))
        ),
        beta_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_beta_2[0][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_beta_2[0][1])})),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_beta_2[1][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_beta_2[1][1])})),
            )
        ),
        gamma_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_gamma_2[0][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_gamma_2[0][1])})),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_gamma_2[1][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_gamma_2[1][1])})),
            )
        ),
        delta_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_delta_2[0][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_delta_2[0][1])})),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_delta_2[1][0])})),
                Fq::new(BigInteger256::new(${toLimbs(vk.vk_delta_2[1][1])})),
            )
        ),
        gamma_abc_g1: alloc::vec![
${vk.IC.map((ic: string[]) => `            G1Affine::new(
                Fq::new(BigInteger256::new(${toLimbs(ic[0])})),
                Fq::new(BigInteger256::new(${toLimbs(ic[1])}))
            )`).join(',\n')}
        ],
    }
}
`;

    fs.writeFileSync(path.resolve('contracts/zk-membership-type/src/vk.rs'), rsCode);
    console.log('Generated vk.rs');
}

main();
