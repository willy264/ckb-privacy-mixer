/**
 * deploy-obscell.ts
 * Deploy the compiled Obscell contracts to Aggron using Lumos.
 * Usage: npx tsx scripts/deploy-obscell.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    __dirname,
    deployBinary,
    initializeAggron,
    PROJECT_ROOT,
    requiredEnv,
} from './lumos-common';

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
    initializeAggron();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, 'obscell-source/target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'obscell_deployment_results.json');
    const existingResults = loadExistingResults(resultsPath);

    const targets: DeployTarget[] = [
        {
            envPrefix: 'STEALTH_LOCK',
            name: 'stealth-lock',
            path: path.join(releaseDir, 'stealth-lock'),
        },
        {
            envPrefix: 'CT_TOKEN_TYPE',
            name: 'ct-token-type',
            path: path.join(releaseDir, 'ct-token-type'),
        },
        {
            envPrefix: 'CT_INFO_TYPE',
            name: 'ct-info-type',
            path: path.join(releaseDir, 'ct-info-type'),
        },
    ];

    console.log('=== Aggron Obscell Contract Deployment (Lumos) ===');
    const results: Record<string, DeployResult> = { ...existingResults };

    for (const target of targets) {
        const envResult = getResultFromEnv(target.envPrefix);
        if (envResult) {
            console.log(`Skipping ${target.name}; found existing deployment in .env`);
            results[target.envPrefix] = envResult;
            continue;
        }

        if (results[target.envPrefix]) {
            console.log(`Skipping ${target.name}; found existing deployment in obscell_deployment_results.json`);
            continue;
        }

        const result = await deployBinary(target.path, privateKey, target.name);
        results[target.envPrefix] = result;
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        const { waitForTransaction } = await import('./lumos-common');
        await waitForTransaction(result.txHash);
    }

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
