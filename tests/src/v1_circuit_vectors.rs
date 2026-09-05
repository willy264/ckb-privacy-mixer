use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

const PUBLIC_SIGNAL_ORDER: [&str; 9] = [
    "poolDomain",
    "assetDomain",
    "denomination",
    "value",
    "root",
    "nullifierHash",
    "recipientDomain",
    "actionHash",
    "authTag",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WithdrawalVector {
    domain_tags: BTreeMap<String, String>,
    public_signal_order: Vec<String>,
    public_signals: BTreeMap<String, String>,
    public_signals_array: Vec<String>,
    public_inputs_le_hex: String,
}

fn vector_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("tests crate must be inside the repository")
        .join("circuits")
        .join("v1")
        .join("test-vectors")
        .join("withdrawal.json")
}

fn fr_le_bytes(decimal: &str) -> [u8; 32] {
    let field = Fr::from_str(decimal).expect("vector must contain a canonical BN254 scalar");
    assert_eq!(
        field.to_string(),
        decimal,
        "field decimal must be canonical"
    );

    let encoded = field.into_bigint().to_bytes_le();
    let mut bytes = [0u8; 32];
    bytes[..encoded.len()].copy_from_slice(&encoded);
    bytes
}

fn decode_lower_hex(hex: &str) -> Vec<u8> {
    let encoded = hex.strip_prefix("0x").expect("ABI hex must have 0x prefix");
    assert_eq!(encoded.len() % 2, 0, "ABI hex must contain whole bytes");
    assert!(
        encoded
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
        "ABI hex must use canonical lowercase characters"
    );

    encoded
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16).expect("valid high nibble");
            let low = (pair[1] as char).to_digit(16).expect("valid low nibble");
            ((high << 4) | low) as u8
        })
        .collect()
}

#[test]
fn withdrawal_v1_vector_has_frozen_public_abi() {
    let vector = serde_json::from_str::<WithdrawalVector>(
        &fs::read_to_string(vector_path()).expect("read V1 withdrawal vector"),
    )
    .expect("parse V1 withdrawal vector");

    assert_eq!(vector.public_signal_order, PUBLIC_SIGNAL_ORDER);
    let ordered_values = PUBLIC_SIGNAL_ORDER
        .iter()
        .map(|name| {
            vector
                .public_signals
                .get(*name)
                .unwrap_or_else(|| panic!("missing public signal {name}"))
                .clone()
        })
        .collect::<Vec<_>>();
    assert_eq!(vector.public_signals_array, ordered_values);

    let encoded = vector
        .public_signals_array
        .iter()
        .flat_map(|value| fr_le_bytes(value))
        .collect::<Vec<_>>();
    assert_eq!(encoded.len(), 9 * 32);
    assert_eq!(decode_lower_hex(&vector.public_inputs_le_hex), encoded);

    for (name, label) in [
        ("leaf", "obscell/v1/leaf"),
        ("nullifier", "obscell/v1/nullifier"),
        ("auth", "obscell/v1/auth"),
        ("merkleEmpty", "obscell/v1/merkle-empty"),
        ("merkleNode", "obscell/v1/merkle-node"),
    ] {
        let tag_bytes = fr_le_bytes(
            vector
                .domain_tags
                .get(name)
                .unwrap_or_else(|| panic!("missing domain tag {name}")),
        );
        assert_eq!(&tag_bytes[..label.len()], label.as_bytes());
        assert!(tag_bytes[label.len()..].iter().all(|byte| *byte == 0));
    }
}
