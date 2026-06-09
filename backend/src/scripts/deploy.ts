/**
 * deploy.ts
 * Deploy the local mixer contracts to Aggron using CCC.
 * Usage: npx tsx backend/src/scripts/deploy.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    __dirname,
    PROJECT_ROOT,
    requiredEnv,
    deployAllBinaries,
    waitForTransaction,
} from './ccc-common.js';

interface DeployTarget {
    envPrefix: string;
    name: string;
    path: string;
}

type DeployResult = { txHash: string; index: string; codeHash: string };

function loadExistingResults(resultsPath: string): Record<string, DeployResult> {
    if (!fs.existsSync(resultsPath)) {
        return {};
    }

    try {
        return JSON.parse(fs.readFileSync(resultsPath, 'utf8')) as Record<string, DeployResult>;
    } catch {
        return {};
    }
}

function getResultFromEnv(envPrefix: string): DeployResult | undefined {
    const txHash = process.env[`${envPrefix}_TX_HASH`];
    const codeHash = process.env[`${envPrefix}_CODE_HASH`];
    if (!txHash || !codeHash) {
        return undefined;
    }

    return {
        txHash,
        index: process.env[`${envPrefix}_INDEX`] || '0x0',
        codeHash,
    };
}

async function main() {
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, '..', '..', 'target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'deployment_results.json');

    const targets: DeployTarget[] = [
        {
            envPrefix: 'MIXER_POOL',
            name: 'mixer-pool-type',
            path: path.join(releaseDir, 'mixer-pool-type'),
        },
        {
            envPrefix: 'NULLIFIER_TYPE',
            name: 'nullifier-type',
            path: path.join(releaseDir, 'nullifier-type'),
        },
        {
            envPrefix: 'ZK_MEMBERSHIP_TYPE',
            name: 'zk-membership-type',
            path: path.join(releaseDir, 'zk-membership-type'),
        },
    ];

    console.log('=== Aggron Contract Deployment (CCC) ===');
    
    const results = await deployAllBinaries(targets, privateKey);
    
    const sampleTxHash = Object.values(results)[0].txHash;
    await waitForTransaction(sampleTxHash);

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    console.log('');
    console.log('=== Deployment Summary ===');
    for (const target of targets) {
        const result = results[target.envPrefix];
        console.log(`${target.name}`);
        console.log(`  ${target.envPrefix}_TX_HASH=${result.txHash}`);
        console.log(`  ${target.envPrefix}_INDEX=${result.index}`);
        console.log(`  ${target.envPrefix}_CODE_HASH=${result.codeHash}`);
        console.log(`  ${target.envPrefix}_HASH_TYPE=data1`);
        console.log('');
    }
    console.log(`Saved raw results to ${resultsPath}`);
}

main().catch(err => {
    console.error('Deployment failed:', err?.message || err);
    process.exit(1);
});
