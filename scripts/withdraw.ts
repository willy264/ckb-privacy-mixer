/**
 * withdraw.ts
 * CLI script to simulate a live Phase 3 withdrawal transaction build
 * through the provider/config resolution path.
 * Usage: npx tsx scripts/withdraw.ts
 */
import {
    AggronWithdrawalProvider,
    MemoryWithdrawalProvider,
} from '../mixer-sdk/src/providers/withdrawal';
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
    const env = {
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
        NULLIFIER_REGISTRY_TX_HASH: process.env.NULLIFIER_REGISTRY_TX_HASH,
        NULLIFIER_REGISTRY_INDEX: process.env.NULLIFIER_REGISTRY_INDEX,
        NULLIFIER_REGISTRY_LOCK: process.env.NULLIFIER_REGISTRY_LOCK,
        NULLIFIER_REGISTRY_CAPACITY: process.env.NULLIFIER_REGISTRY_CAPACITY,
        NULLIFIER_REGISTRY_NULLIFIERS: process.env.NULLIFIER_REGISTRY_NULLIFIERS,
    };
    const config = loadMixerRuntimeConfig(env);
    const proof = {
        publicInputs: example.publicInputs,
        witnessBundle: example.witnessBundle,
        serializedWitness: example.serializedWitness,
        proofValid: example.proofValid,
    };

    const provider =
        env.NULLIFIER_REGISTRY_TX_HASH && env.NULLIFIER_REGISTRY_INDEX
            ? new AggronWithdrawalProvider({
                  config,
                  denomination: 100n,
              })
            : new MemoryWithdrawalProvider({
                  config,
                  registryCell: {
                      outPoint: '0xregistry_cell_001',
                      nullifiers: [],
                      lock: 'always_success',
                      capacity: '1000',
                  },
                  proof,
              });

    const privateKey = process.env.OWNER_PRIVATE_KEY;
    if (!privateKey) {
        console.warn('OWNER_PRIVATE_KEY is not set. Run with actual private key to submit to Aggron.');
    }

    try {
        const tx = await prepareLiveWithdrawTransaction(example.target, {
            provider,
            privateKey: privateKey ?? '0xdev_withdraw_key',
        });
        console.log('Prepared withdrawal transaction:');
        console.log(JSON.stringify(tx, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value, 2));
        console.log(
            provider instanceof AggronWithdrawalProvider
                ? 'Using Aggron env-backed provider.'
                : 'Using memory provider fallback until registry deployment details are set.',
        );

        const txHash = await withdrawMix(example.target, {
            provider,
            privateKey: privateKey ?? '0xdev_withdraw_key',
        });
        console.log('Withdrawal submitted:', txHash);
        console.log('Registered nullifiers:', getSpentNullifiers().length);

        console.log('Replaying the same note to verify double-spend protection...');
        await withdrawMix(example.target, {
            provider,
            privateKey: privateKey ?? '0xdev_withdraw_key',
        });
    } catch (e: any) {
        console.log(e.message);
    }
}

main();
