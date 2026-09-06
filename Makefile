.PHONY: build-contracts test-contracts

build-contracts:
	RUSTFLAGS="-Zunstable-options -Cpanic=immediate-abort -Ctarget-feature=-a,-zaamo,-zalrsc" cargo build -Z build-std=core,alloc --locked --release --target riscv64imac-unknown-none-elf -p pool-state-type-v1 -p vault-lock-v1 -p staging-lock-v1 -p mixer-pool-type -p nullifier-type -p registry-type -p zk-membership-type -j 1

test-contracts: build-contracts
	cargo test --locked -p obscell-v1-types -p tests -j 1
