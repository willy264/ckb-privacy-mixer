/**
 * deploy-obscell-seq.ts
 * Deploy Obscell contracts sequentially, one per transaction.
 * Manually builds transactions to avoid consuming previously deployed contract cells.
 * Usage: npx tsx scripts/deploy-obscell-seq.ts
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
import { commons, helpers, config as lumosConfig, hd } from '@ckb-lumos/lumos';

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
    skipOutPoints: Set<string>, // "txHash:index" strings of cells to skip
): Promise<DeployResult> {
    const indexer = getIndexer();
    const rpc = getRpc();
    const { hex, bytes, codeHash } = readBinaryHex(binaryPath);
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);

    const binaryCapacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;
    console.log(`  ${label}: ${bytes} bytes, needs ${binaryCapacity / SHANNONS} CKB`);

    // Collect input cells — skip cells with type scripts and cells in skipOutPoints
    const collector = indexer.collector({ lock: lockScript });
    const inputCells: any[] = [];
    let collectedCapacity = 0n;

    for await (const cell of collector.collect()) {
        const hasType = !!cell.cellOutput.type;
        const outPointKey = `${cell.outPoint.txHash}:${cell.outPoint.index}`;
        
        if (hasType) {
            continue; // Skip registry cells
        }
        if (skipOutPoints.has(outPointKey)) {
            console.log(`    Skipping previously deployed: ${outPointKey.slice(0,20)}...`);
            continue;
        }

        inputCells.push(cell);
        collectedCapacity += BigInt(cell.cellOutput.capacity);
        
        if (collectedCapacity >= binaryCapacity + 61n * SHANNONS) break;
    }

    if (collectedCapacity < binaryCapacity) {
        throw new Error(`Not enough capacity for ${label}. Have ${collectedCapacity / SHANNONS} CKB, need ${binaryCapacity / SHANNONS} CKB.`);
    }

    // Build transaction
    let txSkeleton = helpers.TransactionSkeleton({});

    for (const cell of inputCells) {
        txSkeleton = txSkeleton.update('inputs', (inputs: any) => inputs.push(cell));
    }

    // Binary output
    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs.push({
            cellOutput: {
                capacity: `0x${binaryCapacity.toString(16)}`,
                lock: lockScript,
            },
            data: hex,
        })
    );

    // Change output
    const feeEstimate = 200000n; // Increase fee estimate to 0.002 CKB
    const changeCapacity = collectedCapacity - binaryCapacity - feeEstimate;
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

    // Initialize witnesses — first witness needs a WitnessArgs placeholder for secp256k1 signature
    const { blockchain } = await import('@ckb-lumos/base');
    const witnessArgs = blockchain.WitnessArgs.pack({ lock: new Uint8Array(65) });
    const witnessPlaceholder = '0x' + Array.from(new Uint8Array(witnessArgs)).map(b => b.toString(16).padStart(2, '0')).join('');
    txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => {
        let w = witnesses.push(witnessPlaceholder);
        // Add empty witnesses for remaining inputs
        for (let i = 1; i < inputCells.length; i++) {
            w = w.push('0x');
        }
        return w;
    });

    // Sign
    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, privateKey),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);

    const txHash = await rpc.sendTransaction(sealedTx, 'passthrough');
    console.log(`  ${label} deployed: ${txHash}`);

    return { txHash, index: '0x0', codeHash };
}

async function main() {
    initializeAggron();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const releaseDir = path.resolve(PROJECT_ROOT, 'obscell-source/target/riscv64imac-unknown-none-elf/release');
    const resultsPath = path.resolve(__dirname, 'obscell_deployment_results.json');

    // Deploy smallest first so they consume less capacity and leave more for subsequent deploys
    const targets: DeployTarget[] = [
        { envPrefix: 'STEALTH_LOCK', name: 'stealth-lock', path: path.join(releaseDir, 'stealth-lock') },
    ];

    console.log('=== Aggron Obscell Contract Deployment (Sequential) ===');

    const results: Record<string, DeployResult> = {};
    const deployedOutPoints = new Set<string>([
        '0x8beb35dbe76c31cff78d4f4504b0a380eb42f9505b7ad937b2add5ab6d3d9527:0x0', // ct-info-type
        '0x321b1e7ebef8ed5268de74fd8ccaca0f4f0eb631e9add36107f09cc716539e53:0x0', // ct-token-type
    ]);

    for (const target of targets) {
        const result = await deploySingleBinary(target.path, privateKey, target.name, deployedOutPoints);
        results[target.envPrefix] = result;

        // Track this deployment's outpoint so the next deploy doesn't consume it
        deployedOutPoints.add(`${result.txHash}:${result.index}`);

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
