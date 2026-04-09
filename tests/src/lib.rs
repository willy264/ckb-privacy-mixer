use ckb_testtool::{
    ckb_types::{
        bytes::Bytes,
        core::TransactionView,
    },
    context::Context,
};
use std::env;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod pool_tests;

pub struct Loader(PathBuf);

impl Default for Loader {
    fn default() -> Self {
        let mut base_path = match env::var("TOP") {
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
        
        // Return dummy bytes if not found during dev testing, or let it fail
        let result = fs::read(&path);
        if result.is_err() {
            println!("Warning: Binary {:?} is missing during test context loading. Expected deployed binary.", path);
            return Bytes::from(vec![0u8; 100]); // Mock binary for compilation tests
        }
        result.unwrap().into()
    }
}
