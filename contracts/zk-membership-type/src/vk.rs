// Auto-generated verification key
use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_ff::BigInteger256;
use ark_groth16::VerifyingKey;
use ark_ec::pairing::Pairing;

pub fn get_vk() -> VerifyingKey<Bn254> {
    VerifyingKey {
        alpha_g1: G1Affine::new(
            Fq::new(BigInteger256::new([0x781bb39a0983aa2c, 0x75efaa037c4d43cc, 0xade95d37217a3044, 0x1e4f476f6ea72118])),
            Fq::new(BigInteger256::new([0x926a5fe14efaf7d4, 0x38300fc9c5d697aa, 0x2275ff5097636371, 0x28a6d74b32cc23e0]))
        ),
        beta_g2: G2Affine::new(
            Fq2::new(
                Fq::new(BigInteger256::new([0x0e55d724e8d16d02, 0xbdca7659e04e98bf, 0xc7d97af537c74024, 0x0e08c4af56177e70])),
                Fq::new(BigInteger256::new([0x5dc8e77d2fed412b, 0x0c2085f3354fcefa, 0xd36c9a9471da4d7e, 0x2d797ff045c67bb2])),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new([0xe304c18a477ea96e, 0x1e20f05e32de102e, 0xa934b0565a4db3cf, 0x00cbd1aeaf8011d9])),
                Fq::new(BigInteger256::new([0x87450f82a16cf46a, 0x1836908fb0864655, 0xda06c7676b1553aa, 0x02325dcee1a7b178])),
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
                Fq::new(BigInteger256::new([0xa30106ab0299c7d8, 0xd07679edc1803373, 0x45f2eab4d52398b1, 0x1e64ebbe0e113230])),
                Fq::new(BigInteger256::new([0x1c5828b34917638a, 0x904864a55057c519, 0xca8a04fcb6a8303f, 0x15e90833521798de])),
            ),
            Fq2::new(
                Fq::new(BigInteger256::new([0xb5de384943ca633d, 0xaf104c2e3e580d6f, 0x266340a5936da0e0, 0x079b348bd8167ae3])),
                Fq::new(BigInteger256::new([0x4c396e9903452929, 0xf8f98f16989fa6e6, 0xe34922bd8b0422f5, 0x14dde59ff8a210dc])),
            )
        ),
        gamma_abc_g1: alloc::vec![
            G1Affine::new(
                Fq::new(BigInteger256::new([0xfecc0341857d51a6, 0x9367d2eb45ffeae8, 0xdee1b923e5cdbbc4, 0x2b4f1cd8609865ea])),
                Fq::new(BigInteger256::new([0x5b6074e01d04bac3, 0xf671dabce55d2249, 0xa6a63c6d626f5efe, 0x1359e8e29f7b8d28]))
            ),
            G1Affine::new(
                Fq::new(BigInteger256::new([0x93ab124ad1339da9, 0x65d8dc15c17d788d, 0x13a88a084c5ef84b, 0x0a3f1759f5b21393])),
                Fq::new(BigInteger256::new([0xf76fd1cb0d70123b, 0x7b605d16c2e774ac, 0xd5df69d9ac3e1a27, 0x075fa1bdb5b5285b]))
            ),
            G1Affine::new(
                Fq::new(BigInteger256::new([0x53634ace4cf45c53, 0x5d1df198b2db563b, 0x463dadc766f551a4, 0x0d5b1666600d1800])),
                Fq::new(BigInteger256::new([0xc4d73bb168ab0a25, 0x51b6e47bb39f7e40, 0x1a7246159a332995, 0x19ccea50e4039b10]))
            )
        ],
    }
}
