use ckb_testtool::ckb_types::bytes::Bytes;
use std::fs;
use std::path::PathBuf;

#[cfg(test)]
mod pool_tests;

/// Loads binaries needed by tests.
/// - Our contracts: built into workspace target/ by `cargo build --release --target riscv64imac-unknown-none-elf`
/// - External fixtures: pre-compiled binaries in tests/fixtures/ (e.g. stealth-lock from Obscell)
pub struct Loader {
    /// Path to our compiled RISC-V contract binaries
    build_dir: PathBuf,
    /// Path to pre-compiled external contract binaries used as fixtures
    fixture_dir: PathBuf,
}

impl Default for Loader {
    fn default() -> Self {
        // CARGO_MANIFEST_DIR = .../ckb-privacy-mixer/tests
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

        // Go up one level from tests/ to workspace root, then into target/
        let mut build_dir = manifest_dir.clone();
        build_dir.pop(); // -> ckb-privacy-mixer/
        build_dir.push("target");
        build_dir.push("riscv64imac-unknown-none-elf");
        build_dir.push("release");

        // Fixtures live inside tests/fixtures/
        let mut fixture_dir = manifest_dir;
        fixture_dir.push("fixtures");

        Loader { build_dir, fixture_dir }
    }
}

impl Loader {
    /// Load a contract compiled from this project (contracts/*)
    pub fn load_binary(&self, name: &str) -> Bytes {
        let path = self.build_dir.join(name);
        fs::read(&path)
            .unwrap_or_else(|_| {
                panic!(
                    "Contract binary not found at {:?}.\nRun: cargo build --release --target riscv64imac-unknown-none-elf -p {}",
                    path, name
                )
            })
            .into()
    }

    /// Load a pre-compiled external contract fixture (e.g. stealth-lock from Obscell)
    pub fn load_fixture(&self, name: &str) -> Bytes {
        let path = self.fixture_dir.join(name);
        fs::read(&path)
            .unwrap_or_else(|_| panic!("Fixture not found at {:?}", path))
            .into()
    }
}
