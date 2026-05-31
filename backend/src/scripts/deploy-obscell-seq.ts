/**
 * deploy-obscell-seq.ts
 * Deploy Obscell contracts sequentially, one per transaction using CCC.
 * Usage: npx tsx backend/src/scripts/deploy-obscell-seq.ts
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

interface DeployTarget {
    envPrefix: string;
    name: string;
    path: string;
}

type DeployResult = { txHash: string; index: string; codeHash: string };

async function deploySingleBinary(
    binaryPath: string,
    privateKey: string,
    label: string,
): Promise<DeployResult> {
    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;
    const { hex, bytes, codeHash } = readBinaryHex(binaryPath);

    const binaryCapacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;
    console.log(`  ${label}: ${bytes} bytes, needs ${binaryCapacity / SHANNONS} CKB`);

    const cccTx = ccc.Transaction.from({});

    cccTx.addOutput({
        capacity: ccc.numFrom(binaryCapacity),
        lock: lockScript,
    }, hex);

    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    console.log(`  ${label} deployed: ${txHash}`);

    return { txHash, index: '0x0', codeHash };
}

async function main() {
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, 'obscell-source/target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'obscell_deployment_results.json');

    const targets: DeployTarget[] = [
        { envPrefix: 'STEALTH_LOCK', name: 'stealth-lock', path: path.join(releaseDir, 'stealth-lock') },
    ];

    console.log('=== Aggron Obscell Contract Deployment (Sequential) ===');

    const results: Record<string, DeployResult> = {};

    for (const target of targets) {
        const result = await deploySingleBinary(target.path, privateKey, target.name);
        results[target.envPrefix] = result;

        // Wait for confirmation before deploying next
        await waitForTransaction(result.txHash);
    }

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    console.log('');
    console.log('=== Deployment Summary ===');
    for (const target of targets) {
        const r = results[target.envPrefix];
        console.log(`${target.name}`);
        console.log(`  ${target.envPrefix}_TX_HASH=${r.txHash}`);
        console.log(`  ${target.envPrefix}_INDEX=${r.index}`);
        console.log(`  ${target.envPrefix}_CODE_HASH=${r.codeHash}`);
        console.log(`  ${target.envPrefix}_HASH_TYPE=data1`);
        console.log('');
    }
    console.log(`Saved raw results to ${resultsPath}`);
}

main().catch(err => {
    console.error('Deployment failed:', err?.message || err);
    process.exit(1);
});
