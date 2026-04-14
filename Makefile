.PHONY: build-contracts test-contracts

build-contracts:
	cargo build --locked --release --target riscv64imac-unknown-none-elf -p mixer-pool-type --target-dir contracts/target

test-contracts: build-contracts
	cargo test --locked -p tests
