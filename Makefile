.PHONY: build-contracts test-contracts

build-contracts:
	cargo build --locked --release --target riscv64imac-unknown-none-elf -p mixer-pool-type -p nullifier-type -p zk-membership-type -j 1

test-contracts: build-contracts
	cargo test --locked -p tests -j 1
