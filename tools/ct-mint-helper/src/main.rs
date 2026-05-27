use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek::{ristretto::CompressedRistretto, scalar::Scalar};
use merlin::Transcript;
use rand_core::OsRng;
use serde::Serialize;

#[derive(Serialize)]
struct MintProofOutput {
    amount: u64,
    mint_commitment_hex: String,
    commitment_hex: String,
    blinding_factor_hex: String,
    range_proof_hex: String,
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn main() {
    let arg = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: cargo run -p ct-mint-helper -- <amount>");
        std::process::exit(1);
    });
    let zero_blinding = std::env::args().any(|item| item == "--zero-blinding");

    let amount: u64 = arg.parse().unwrap_or_else(|_| {
        eprintln!("amount must be a positive integer");
        std::process::exit(1);
    });

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut transcript = Transcript::new(b"ct-token-type");
    let mut rng = OsRng;

    let blinding = if zero_blinding { Scalar::ZERO } else { Scalar::random(&mut rng) };
    let commitment = pc_gens.commit(Scalar::from(amount), blinding);
    let mint_commitment = pc_gens.commit(Scalar::from(amount), Scalar::ZERO);

    let (proof, _) = RangeProof::prove_multiple_with_rng(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        &[amount],
        &[blinding],
        32,
        &mut rng,
    )
    .unwrap_or_else(|error| {
        eprintln!("failed to generate range proof: {error:?}");
        std::process::exit(1);
    });

    let commitment_bytes = commitment.compress().to_bytes();
    let mint_commitment_bytes = mint_commitment.compress().to_bytes();
    let commitment_hex = format!("0x{}", to_hex(&commitment_bytes));
    let mint_commitment_hex = format!("0x{}", to_hex(&mint_commitment_bytes));
    let blinding_factor_hex = format!("0x{}", to_hex(&blinding.to_bytes()));
    let range_proof_hex = format!("0x{}", to_hex(&proof.to_bytes()));

    let _check = CompressedRistretto::from_slice(&commitment_bytes)
        .ok()
        .and_then(|point| point.decompress())
        .unwrap_or_else(|| {
            eprintln!("generated commitment is invalid");
            std::process::exit(1);
        });

    let output = MintProofOutput {
        amount,
        mint_commitment_hex,
        commitment_hex,
        blinding_factor_hex,
        range_proof_hex,
    };

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}
