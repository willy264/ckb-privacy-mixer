/**
 * deploy-obscell-all.ts
 * Deploy ALL compiled Obscell contracts to Aggron in ONE transaction using CCC.
 * Usage: npx tsx backend/src/scripts/deploy-obscell-all.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { ccc } from '@ckb-ccc/core';
import {
    __dirname,
    PROJECT_ROOT,
    requiredEnv,
    getClient,
    getSigner,
    readBinaryHex,
    waitForTransaction,
    SHANNONS,
} from './ccc-common.js';

async function main() {
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, 'obscell-source/target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'obscell_deployment_results.json');

    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

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

    const cccTx = ccc.Transaction.from({});

    // Add binary outputs
    for (const b of binaries) {
        cccTx.addOutput({
            capacity: ccc.numFrom(b.capacity),
            lock: lockScript,
        }, b.hex);
    }

    // Let CCC handle input collection and fee calculation
    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    console.log(`\nAll binaries deployed in transaction: ${txHash}`);

    const results: Record<string, any> = {};
    for (let i = 0; i < binaries.length; i++) {
        const b = binaries[i];
        results[b.envPrefix] = {
            txHash,
            index: `0x${i.toString(16)}`,
            codeHash: b.codeHash,
        };
        console.log(`  ${b.name} => output index ${i}`);
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
