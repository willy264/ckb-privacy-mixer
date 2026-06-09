// Auto-generated verification key
use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_ff::BigInteger256;
use ark_groth16::VerifyingKey;

pub fn get_vk() -> VerifyingKey<Bn254> {
    VerifyingKey {
        alpha_g1: G1Affine::new(
            Fq::new(BigInteger256::new([0x4e0c8cd79d1defc5, 0x6333cad27a70b5c0, 0x12954b941b4f1515, 0x240254dd78e8c85e])),
            Fq::new(BigInteger256::new([0x53c2dd6693a58ea9, 0x570595d6d29f682a, 0xd59d0f9419932dfa, 0x01488ed25b1e2f5e]))
        ),
        beta_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new([0x00622267054043b4, 0x8634ff9989ebeac7, 0xeee92b1074aaa799, 0x0f28c31884540030])),
                Fq::new(BigInteger256::new([0x00ebe699d9b97921, 0x4b69dd54f61e7dc5, 0xc7f9a0cde9458efe, 0x0fb751c42af094a9])),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new([0xa1cd7920a967ff25, 0xc8533b763186ab47, 0xadab60eab5eee2c0, 0x17a695380bfc1e3a])),
                Fq::new(BigInteger256::new([0x45e6dc4405f11822, 0x5e21597ba74c088c, 0x22874bcea351e40e, 0x09821f421ab4a0cf])),
            )
        ),
        gamma_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new([0x46debd5cd992f6ed, 0x674322d4f75edadd, 0x426a00665e5c4479, 0x1800deef121f1e76])),
                Fq::new(BigInteger256::new([0x97e485b7aef312c2, 0xf1aa493335a9e712, 0x7260bfb731fb5d25, 0x198e9393920d483a])),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new([0x4ce6cc0166fa7daa, 0xe3d1e7690c43d37b, 0x4aab71808dcb408f, 0x12c85ea5db8c6deb])),
                Fq::new(BigInteger256::new([0x55acdadcd122975b, 0xbc4b313370b38ef3, 0xec9e99ad690c3395, 0x090689d0585ff075])),
            )
        ),
        delta_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new([0xaad66d5417085af0, 0xcd2030fde9962454, 0x3f1a541eafe196cc, 0x1c48ffab9ab7e1d5])),
                Fq::new(BigInteger256::new([0x417498ec4de2f473, 0x5f138cc1611157e7, 0xf8e673fe5a31423a, 0x2232467a3c369f95])),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new([0x8396ff4c505bf0f3, 0x450137eeb927a83a, 0x40bab6cbec536363, 0x213ec28cd1588cde])),
                Fq::new(BigInteger256::new([0xf7b5ecc05d03dec7, 0x5c9d5c97d938ec3c, 0xaa1016f0bb5bff03, 0x2d3bed2f7c11150e])),
            )
        ),
        gamma_abc_g1: alloc::vec![
            G1Affine::new(
            Fq::new(BigInteger256::new([0x22d82c8ac964e1bb, 0xf4e8edb5e06a62ed, 0xc5c52279559140c2, 0x0ae62c667549d2b4])),
            Fq::new(BigInteger256::new([0x1442cddabf3ebd25, 0xd94334a7317faa96, 0x310a5d8f3d50fde5, 0x13ae751f0192e2d9]))
        ),
            G1Affine::new(
            Fq::new(BigInteger256::new([0x686444ae0ce68a5a, 0xf9456b0ab540281a, 0x0bbf7ed44e94ab8c, 0x2639799949c07494])),
            Fq::new(BigInteger256::new([0xb68d9db043fc6a76, 0x15a5d779f31a0a36, 0x5aaf84336bdc06ba, 0x20cddd3476f2cee0]))
        ),
            G1Affine::new(
            Fq::new(BigInteger256::new([0xd437a034ad979a4a, 0x2fe209cbfdbf68b0, 0x21c2c30dfc89867a, 0x0c68de97e6ad8c68])),
            Fq::new(BigInteger256::new([0x81eeac264c28683c, 0x99a447d6005095b7, 0x981bc16d5fa98c5b, 0x06f4bf4aeac2ccc6]))
        ),
            G1Affine::new(
            Fq::new(BigInteger256::new([0x6b59ac99502ca5e9, 0xf14b0fc7dbe327b1, 0xfa95d5b31aa17dae, 0x0f2da1f42b33a4a4])),
            Fq::new(BigInteger256::new([0xdb5deee9c22f7c4f, 0xe35580be24071faa, 0x9ff48703e0be3301, 0x1dce33a61471c42c]))
        )
        ],
    }
}
