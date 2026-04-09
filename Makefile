.PHONY: build-contracts test-contracts

build-contracts:
	cd contracts && cargo build --release --target riscv64imac-unknown-none-elf

test-contracts:
	cd tests && cargo test
