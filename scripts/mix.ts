/**
 * mix.ts
 * Full 3-participant preview simulation using the structured deposit result.
 * Usage: npx tsx scripts/mix.ts
 */
import { joinMix } from '../mixer-sdk/src/operations/deposit';
import { type Cell } from '../mixer-sdk/src/core/session';

async function runSimulation() {
    console.log('=== CKB Privacy Mixer — Deposit Preview Simulation ===\n');

    const user1Cell: Cell = { outPoint: '0x_user1_utxo', amount: 100n };
    const user2Cell: Cell = { outPoint: '0x_user2_utxo', amount: 100n };
    const user3Cell: Cell = { outPoint: '0x_user3_utxo', amount: 100n };

    console.log(
        `Users: user1 (${user1Cell.outPoint}), user2 (${user2Cell.outPoint}), user3 (${user3Cell.outPoint})`,
    );
    console.log('All depositing: 100 CT each\n');

    const p1 = joinMix({
        ctInputCell: user1Cell,
        stealthOutputAddress: 'ckt1_stealth_user1_dest',
        privateKey: '0xpriv1',
        runtimeMode: 'preview',
    });
    await new Promise(resolve => setTimeout(resolve, 150));
    const p2 = joinMix({
        ctInputCell: user2Cell,
        stealthOutputAddress: 'ckt1_stealth_user2_dest',
        privateKey: '0xpriv2',
        runtimeMode: 'preview',
    });
    await new Promise(resolve => setTimeout(resolve, 150));
    const p3 = joinMix({
        ctInputCell: user3Cell,
        stealthOutputAddress: 'ckt1_stealth_user3_dest',
        privateKey: '0xpriv3',
        runtimeMode: 'preview',
    });

    try {
        const results = await Promise.all([p1, p2, p3]);
        console.log('\nCompleted deposit preview results:');
        results.forEach((result, index) => {
            console.log(`  User ${index + 1}: ${result.status} ${result.confirmedTxHash}`);
        });
    } catch (error) {
        console.error('\nSimulation failed:', error);
    }
}

runSimulation();
