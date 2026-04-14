use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
    },
};
use std::env;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod pool_tests;

pub struct Loader(PathBuf);

impl Default for Loader {
    fn default() -> Self {
        let base_path = match env::var("TOP") {
            Ok(val) => {
                let mut base_path: PathBuf = val.into();
                base_path.push("contracts");
                base_path.push("target");
                base_path.push("riscv64imac-unknown-none-elf");
                base_path.push("release");
                base_path
            }
            Err(_) => {
                let mut base_path = PathBuf::new();
                base_path.push("../contracts/target/riscv64imac-unknown-none-elf/release");
                base_path
            }
        };
        Loader(base_path)
    }
}

impl Loader {
    pub fn load_binary(&self, name: &str) -> Bytes {
        let mut path = self.0.clone();
        path.push(name);

        match fs::read(&path) {
            Ok(binary) => binary.into(),
            Err(err) if name == "stealth-lock" => {
                println!(
                    "Warning: Binary {:?} is missing during test context loading ({err}). Falling back to ALWAYS_SUCCESS for mocked output locks.",
                    path
                );
                ALWAYS_SUCCESS.clone()
            }
            Err(err) => panic!(
                "Required binary {:?} is missing ({err}). Build the root contract first with `cargo build --release --target riscv64imac-unknown-none-elf -p mixer-pool-type` from the repository root.",
                path
            ),
        }
    }
}
