use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek::scalar::Scalar;
use merlin::Transcript;
use rand_core::OsRng;
use serde::Serialize;

#[derive(Serialize)]
struct OutputCommitment {
    amount: u64,
    blinding_factor_hex: String,
    commitment_hex: String,
}

#[derive(Serialize)]
struct RoundProofOutput {
    outputs: Vec<OutputCommitment>,
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
    let amount_arg = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: cargo run -p ct-round-helper -- <amount> <count>");
        std::process::exit(1);
    });
    let count_arg = std::env::args().nth(2).unwrap_or_else(|| {
        eprintln!("usage: cargo run -p ct-round-helper -- <amount> <count>");
        std::process::exit(1);
    });

    let amount: u64 = amount_arg.parse().unwrap_or_else(|_| {
        eprintln!("amount must be a positive integer");
        std::process::exit(1);
    });

    let count: usize = count_arg.parse().unwrap_or_else(|_| {
        eprintln!("count must be a positive integer");
        std::process::exit(1);
    });

    if count == 0 {
        eprintln!("count must be greater than zero");
        std::process::exit(1);
    }

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, count);
    let mut transcript = Transcript::new(b"ct-token-type");
    let mut rng = OsRng;

    let values = vec![amount; count];
    let blindings: Vec<Scalar> = (0..count).map(|_| Scalar::random(&mut rng)).collect();
    let commitments = values
        .iter()
        .zip(blindings.iter())
        .map(|(value, blinding)| pc_gens.commit(Scalar::from(*value), *blinding))
        .collect::<Vec<_>>();

    let (proof, _) = RangeProof::prove_multiple_with_rng(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        &values,
        &blindings,
        32,
        &mut rng,
    )
    .unwrap_or_else(|error| {
        eprintln!("failed to generate round range proof: {error:?}");
        std::process::exit(1);
    });

    let outputs = commitments
        .iter()
        .zip(blindings.iter())
        .map(|(commitment, blinding)| OutputCommitment {
            amount,
            blinding_factor_hex: format!("0x{}", to_hex(&blinding.to_bytes())),
            commitment_hex: format!("0x{}", to_hex(&commitment.compress().to_bytes())),
        })
        .collect::<Vec<_>>();

    let output = RoundProofOutput {
        outputs,
        range_proof_hex: format!("0x{}", to_hex(&proof.to_bytes())),
    };

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}
