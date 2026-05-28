import '../env.js';
import fs from 'fs';
import path from 'path';
import { helpers, commons, config as lumosConfig, hd } from '@ckb-lumos/lumos';
import { getDeployerAddress, getDeployerLock, getIndexer, getRpc, initializePudge, requiredEnv, resolveWorkingEndpointPair, SHANNONS, waitForTransaction } from './lumos.js';

interface DeployTarget {
    envPrefix: 'STEALTH_LOCK' | 'CT_INFO_TYPE' | 'CT_TOKEN_TYPE';
    name: string;
    file: string;
}

function readBinaryHex(binaryPath: string) {
    const binaryData = fs.readFileSync(binaryPath);
    const hex = `0x${Buffer.from(binaryData).toString('hex')}`;
    return {
        hex,
        bytes: binaryData.length,
    };
}

async function deploySingleBinary(target: DeployTarget, privateKey: string) {
    const endpoint = await resolveWorkingEndpointPair();
    const indexer = getIndexer(endpoint);
    const rpc = getRpc(endpoint);
    const { hex, bytes } = readBinaryHex(target.file);
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);
    const binaryCapacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;

    const collector = indexer.collector({ lock: lockScript });
    const inputCells: any[] = [];
    let collectedCapacity = 0n;

    for await (const cell of collector.collect()) {
        const hasType = !!cell.cellOutput.type;
        const dataBytes = cell.data ? (cell.data.length - 2) / 2 : 0;
        if (hasType) {
            continue;
        }
        // Prefer plain CKB cells only. Do not consume old code cells here.
        if (dataBytes > 0) {
            continue;
        }

        inputCells.push(cell);
        collectedCapacity += BigInt(cell.cellOutput.capacity);
        if (collectedCapacity >= binaryCapacity + 200000n + 61n * SHANNONS) {
            break;
        }
    }

    if (collectedCapacity < binaryCapacity) {
        throw new Error(`Not enough capacity for ${target.name}. Have ${collectedCapacity / SHANNONS} CKB, need ${binaryCapacity / SHANNONS} CKB.`);
    }

    let txSkeleton = helpers.TransactionSkeleton({});
    for (const cell of inputCells) {
        txSkeleton = txSkeleton.update('inputs', (inputs: any) => inputs.push(cell));
    }

    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs.push({
            cellOutput: {
                capacity: `0x${binaryCapacity.toString(16)}`,
                lock: lockScript,
            },
            data: hex,
        }),
    );

    const feeEstimate = 200000n;
    const changeCapacity = collectedCapacity - binaryCapacity - feeEstimate;
    if (changeCapacity >= 61n * SHANNONS) {
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${changeCapacity.toString(16)}`,
                    lock: lockScript,
                },
                data: '0x',
            }),
        );
    }

    const networkConfig = lumosConfig.getConfig();
    const secp256k1 = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
    txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
        cellDeps.push({
            outPoint: {
                txHash: secp256k1.TX_HASH,
                index: secp256k1.INDEX,
            },
            depType: secp256k1.DEP_TYPE as any,
        }),
    );

    const { blockchain } = await import('@ckb-lumos/base');
    const witnessArgs = blockchain.WitnessArgs.pack({ lock: new Uint8Array(65) });
    const witnessPlaceholder = '0x' + Array.from(new Uint8Array(witnessArgs)).map(b => b.toString(16).padStart(2, '0')).join('');
    txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => {
        let w = witnesses.push(witnessPlaceholder);
        for (let i = 1; i < inputCells.length; i++) {
            w = w.push('0x');
        }
        return w;
    });

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, privateKey),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
    const txHash = await rpc.sendTransaction(sealedTx, 'passthrough');
    await waitForTransaction(txHash);

    return { txHash, index: '0x0' };
}

async function main() {
    initializePudge();
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const repoRoot = path.resolve(currentDir, '..', '..', '..');
    const releaseDir = path.resolve(repoRoot, 'obscell-source', 'target', 'riscv64imac-unknown-none-elf', 'release');
    const noAtomicReleaseDir = path.resolve(repoRoot, 'obscell-source', 'target-noatomic-all', 'riscv64imac-unknown-none-elf', 'release');

    const targets: DeployTarget[] = [
        { envPrefix: 'STEALTH_LOCK', name: 'stealth-lock', file: path.join(releaseDir, 'stealth-lock') },
        { envPrefix: 'CT_TOKEN_TYPE', name: 'ct-token-type', file: path.join(releaseDir, 'ct-token-type') },
        { envPrefix: 'CT_INFO_TYPE', name: 'ct-info-type', file: path.join(noAtomicReleaseDir, 'ct-info-type') },
    ];

    for (const target of targets) {
        console.log(`Deploying ${target.name}...`);
        const result = await deploySingleBinary(target, privateKey);
        console.log(`${target.envPrefix}_TX_HASH=${result.txHash}`);
        console.log(`${target.envPrefix}_INDEX=${result.index}`);
    }
}

main().catch((error) => {
    console.error('deploy-obscell-missing failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
