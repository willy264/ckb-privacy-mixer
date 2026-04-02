import { joinMix } from '../mixer-sdk/src/operations/deposit';
import { Cell } from '../mixer-sdk/src/core/session';

async function runSimulation() {
    console.log("=== CKB Privacy Mixer Phase 2 Simulation ===");
    
    // Mock user cells
    const user1Cell: Cell = { outPoint: '0x_user1_utxo', amount: 100n };
    const user2Cell: Cell = { outPoint: '0x_user2_utxo', amount: 100n };
    const user3Cell: Cell = { outPoint: '0x_user3_utxo', amount: 100n };

    console.log("Starting simultaneous joins for 3 participants...\n");

    const p1 = joinMix({
        ctInputCell: user1Cell,
        stealthOutputAddress: 'ckt1_stealth_user1_dest',
        privateKey: '0x_priv1'
    });

    // Simulate small delays between joins
    await new Promise(r => setTimeout(r, 200));

    const p2 = joinMix({
        ctInputCell: user2Cell,
        stealthOutputAddress: 'ckt1_stealth_user2_dest',
        privateKey: '0x_priv2'
    });

    await new Promise(r => setTimeout(r, 200));

    const p3 = joinMix({
        ctInputCell: user3Cell,
        stealthOutputAddress: 'ckt1_stealth_user3_dest',
        privateKey: '0x_priv3'
    });

    try {
        const results = await Promise.all([p1, p2, p3]);
        console.log("\nMix Simulation Completed Successfully!");
        console.log("Results hashes:", results);
    } catch (e) {
        console.error("Simulation failed:", e);
    }
}

runSimulation();
