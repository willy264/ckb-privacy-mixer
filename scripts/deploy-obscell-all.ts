/**
 * deploy-obscell-all.ts
 * Deploy ALL compiled Obscell contracts to Aggron in ONE transaction.
 * Manually selects only empty-data cells to avoid consuming previously deployed contracts.
 * Usage: npx tsx scripts/deploy-obscell-all.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    __dirname,
    initializeAggron,
    PROJECT_ROOT,
    requiredEnv,
    getRpc,
    getIndexer,
    getDeployerLock,
    getDeployerAddress,
    readBinaryHex,
    waitForTransaction,
    SHANNONS,
} from './lumos-common';
import { commons, helpers, config as lumosConfig, hd, utils } from '@ckb-lumos/lumos';

async function main() {
    initializeAggron();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, 'obscell-source/target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'obscell_deployment_results.json');

    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);
    const indexer = getIndexer();
    const rpc = getRpc();

    const targets = [
        { envPrefix: 'STEALTH_LOCK', name: 'stealth-lock', path: path.join(releaseDir, 'stealth-lock') },
        { envPrefix: 'CT_TOKEN_TYPE', name: 'ct-token-type', path: path.join(releaseDir, 'ct-token-type') },
        { envPrefix: 'CT_INFO_TYPE', name: 'ct-info-type', path: path.join(releaseDir, 'ct-info-type') },
    ];

    console.log('=== Aggron Obscell Contract Deployment (All-in-One TX) ===');

    // Read all binaries
    const binaries = targets.map(t => {
        const { hex, bytes, codeHash } = readBinaryHex(t.path);
        const capacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;
        console.log(`  ${t.name}: ${bytes} bytes, needs ${capacity / SHANNONS} CKB`);
        return { ...t, hex, bytes, codeHash, capacity };
    });

    const totalBinaryCapacity = binaries.reduce((acc, b) => acc + b.capacity, 0n);
    console.log(`  Total binary capacity needed: ${totalBinaryCapacity / SHANNONS} CKB`);

    // Manually collect input cells — only those with no data and no type script
    const collector = indexer.collector({ lock: lockScript });
    const inputCells: any[] = [];
    let collectedCapacity = 0n;

    for await (const cell of collector.collect()) {
        // Skip cells with type scripts (registry cells, etc.) — those must not be consumed
        // Cells with data but no type script are safe to consume (old contract binary deployments)
        const hasType = !!cell.cellOutput.type;
        if (hasType) {
            console.log(`  Skipping cell ${cell.outPoint.txHash.slice(0,18)}...:${cell.outPoint.index} (has type script)`);
            continue;
        }
        inputCells.push(cell);
        collectedCapacity += BigInt(cell.cellOutput.capacity);
        const dataLen = cell.data ? (cell.data.length - 2) / 2 : 0;
        console.log(`  Using cell ${cell.outPoint.txHash.slice(0,18)}...:${cell.outPoint.index}, capacity: ${BigInt(cell.cellOutput.capacity) / SHANNONS} CKB, data: ${dataLen} bytes`);
    }

    console.log(`  Collected: ${collectedCapacity / SHANNONS} CKB from ${inputCells.length} cells`);

    if (collectedCapacity < totalBinaryCapacity) {
        throw new Error(`Not enough free capacity. Have ${collectedCapacity / SHANNONS} CKB, need ${totalBinaryCapacity / SHANNONS} CKB. Claim more from the faucet.`);
    }

    // Build the transaction manually
    let txSkeleton = helpers.TransactionSkeleton({});

    // Add inputs
    for (const cell of inputCells) {
        txSkeleton = txSkeleton.update('inputs', (inputs: any) => inputs.push(cell));
    }

    // Add binary outputs
    for (const b of binaries) {
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${b.capacity.toString(16)}`,
                    lock: lockScript,
                },
                data: b.hex,
            })
        );
    }

    // Compute fee and add change output
    // Use a minimal fee — the actual transaction fee on testnet is very small
    const feeEstimate = 50000n; // 0.0005 CKB
    const changeCapacity = collectedCapacity - totalBinaryCapacity - feeEstimate;
    if (changeCapacity >= 61n * SHANNONS) {
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${changeCapacity.toString(16)}`,
                    lock: lockScript,
                },
                data: '0x',
            })
        );
        console.log(`  Change output: ${changeCapacity / SHANNONS} CKB`);
    } else if (changeCapacity > 0n) {
        // Not enough for a separate cell — donate the remainder to the binary outputs
        // Add the change to the last binary output
        const lastBinary = binaries[binaries.length - 1];
        const lastIdx = txSkeleton.get('outputs').size - 1;
        const adjustedCapacity = lastBinary.capacity + changeCapacity;
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.update(lastIdx, (cell: any) => ({
                ...cell,
                cellOutput: {
                    ...cell.cellOutput,
                    capacity: `0x${adjustedCapacity.toString(16)}`,
                },
            }))
        );
        console.log(`  No change cell — added ${changeCapacity} shannons to last output`);
    }

    // Add secp256k1 cell dep
    const networkConfig = lumosConfig.getConfig();
    const secp256k1 = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
    txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
        cellDeps.push({
            outPoint: {
                txHash: secp256k1.TX_HASH,
                index: secp256k1.INDEX,
            },
            depType: secp256k1.DEP_TYPE as any,
        })
    );

    // Prepare signing entries
    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    // Sign and send
    const signingEntries = txSkeleton.get('signingEntries').toArray();
    console.log(`  Signing entries: ${signingEntries.length}`);
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, privateKey),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);

    const txHash = await rpc.sendTransaction(sealedTx, 'passthrough');
    console.log(`\nAll binaries deployed in transaction: ${txHash}`);

    // Find each binary's index in the final outputs
    const finalOutputs = txSkeleton.get('outputs').toArray();
    const results: Record<string, any> = {};
    for (const b of binaries) {
        const index = finalOutputs.findIndex((o: any) => o.data === b.hex);
        results[b.envPrefix] = {
            txHash,
            index: `0x${index.toString(16)}`,
            codeHash: b.codeHash,
        };
        console.log(`  ${b.name} => output index ${index}`);
    }

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    await waitForTransaction(txHash);

    console.log('');
    console.log('=== Deployment Summary ===');
    for (const t of targets) {
        const r = results[t.envPrefix];
        console.log(`${t.name}`);
        console.log(`  ${t.envPrefix}_TX_HASH=${r.txHash}`);
        console.log(`  ${t.envPrefix}_INDEX=${r.index}`);
        console.log(`  ${t.envPrefix}_CODE_HASH=${r.codeHash}`);
        console.log(`  ${t.envPrefix}_HASH_TYPE=data1`);
        console.log('');
    }
    console.log(`Saved raw results to ${resultsPath}`);
}

main().catch(err => {
    console.error('Deployment failed:', err?.message || err);
    process.exit(1);
});
