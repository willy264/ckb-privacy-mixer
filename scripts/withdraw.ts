/**
 * withdraw.ts
 * CLI script to simulate a live Phase 3 withdrawal transaction build
 * through the provider/config resolution path.
 * Usage: npx tsx scripts/withdraw.ts
 */
import { MemoryWithdrawalProvider } from '../mixer-sdk/src/providers/withdrawal';
import { runPhase4Example } from '../mixer-sdk/src/examples/phase4';
import { loadMixerRuntimeConfig } from '../mixer-sdk/src/utils/config';
import {
    clearSpentNullifiers,
    getSpentNullifiers,
    prepareLiveWithdrawTransaction,
    withdrawMix,
} from '../mixer-sdk/src/operations/withdraw';

async function main() {
    clearSpentNullifiers();
    console.log('Running live Phase 3 withdrawal transaction simulation...');

    const example = runPhase4Example();
    const config = loadMixerRuntimeConfig({
        CKB_RPC_URL: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev',
        CKB_INDEXER_URL: process.env.CKB_INDEXER_URL ?? 'https://testnet.ckb.dev',
        MIXER_POOL_CODE_HASH: process.env.MIXER_POOL_CODE_HASH ?? '0x' + '1'.repeat(64),
        MIXER_POOL_HASH_TYPE: process.env.MIXER_POOL_HASH_TYPE ?? 'data1',
        NULLIFIER_TYPE_CODE_HASH: process.env.NULLIFIER_TYPE_CODE_HASH ?? '0x' + '2'.repeat(64),
        NULLIFIER_TYPE_HASH_TYPE: process.env.NULLIFIER_TYPE_HASH_TYPE ?? 'data1',
        ZK_MEMBERSHIP_TYPE_CODE_HASH: process.env.ZK_MEMBERSHIP_TYPE_CODE_HASH ?? '0x' + '3'.repeat(64),
        ZK_MEMBERSHIP_TYPE_HASH_TYPE: process.env.ZK_MEMBERSHIP_TYPE_HASH_TYPE ?? 'data1',
        STEALTH_LOCK_CODE_HASH: process.env.STEALTH_LOCK_CODE_HASH ?? '0x' + '4'.repeat(64),
        STEALTH_LOCK_HASH_TYPE: process.env.STEALTH_LOCK_HASH_TYPE ?? 'type',
        CT_TOKEN_TYPE_CODE_HASH: process.env.CT_TOKEN_TYPE_CODE_HASH ?? '0x' + '5'.repeat(64),
        CT_TOKEN_TYPE_HASH_TYPE: process.env.CT_TOKEN_TYPE_HASH_TYPE ?? 'type',
    });
    const registryCell = {
        outPoint: '0xregistry_cell_001',
        nullifiers: [],
        lock: 'always_success',
        capacity: '1000',
    };

    const proof = {
        publicInputs: example.publicInputs,
        witnessBundle: example.witnessBundle,
        serializedWitness: example.serializedWitness,
        proofValid: example.proofValid,
    };

    const provider = new MemoryWithdrawalProvider({
        config,
        registryCell,
        proof,
    });

    try {
        const tx = await prepareLiveWithdrawTransaction(example.target, {
            provider,
            privateKey: '0xdev_withdraw_key',
        });
        console.log('Prepared withdrawal transaction:');
        console.log(JSON.stringify(tx, null, 2));

        const txHash = await withdrawMix(example.target, {
            provider,
            privateKey: '0xdev_withdraw_key',
        });
        console.log('Withdrawal submitted:', txHash);
        console.log('Registered nullifiers:', getSpentNullifiers().length);

        console.log('Replaying the same note to verify double-spend protection...');
        await withdrawMix(example.target, {
            provider,
            privateKey: '0xdev_withdraw_key',
        });
    } catch (e: any) {
        console.log(e.message);
    }
}

main();
