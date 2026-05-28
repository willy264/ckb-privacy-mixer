import '../env.js';
import fs from 'fs';
import path from 'path';
import { helpers, commons, config as lumosConfig, utils } from '@ckb-lumos/lumos';
import { buildAndSendTransaction, getDeployerLock, getIndexer, getRpc, initializePudge, requiredEnv, resolveWorkingEndpointPair, SHANNONS, waitForTransaction } from './lumos.js';

const FEE_BUFFER = 500_000n;

type ArtifactName = 'STEALTH_LOCK' | 'CT_INFO_TYPE' | 'CT_TOKEN_TYPE';

interface SafeArtifact {
    envPrefix: ArtifactName;
    name: string;
    file: string;
    hex: string;
    codeHash: string;
    capacity: bigint;
}

interface InputCellRef {
    txHash: string;
    index: string;
}

function normalizeOutPoint(ref: InputCellRef) {
    return `${ref.txHash}:${ref.index}`;
}

function readArtifact(envPrefix: ArtifactName, name: string, file: string): SafeArtifact {
    const binary = fs.readFileSync(file);
    const hex = `0x${Buffer.from(binary).toString('hex')}`;
    return {
        envPrefix,
        name,
        file,
        hex,
        codeHash: utils.ckbHash(hex),
        capacity: BigInt(binary.length) * SHANNONS + 61n * SHANNONS,
    };
}

async function fetchLiveCell(ref: InputCellRef) {
    const endpoint = await resolveWorkingEndpointPair();
    const rpc = getRpc(endpoint);
    const liveCell = await rpc.getLiveCell(ref as any, true);
    if (!liveCell.cell || liveCell.status !== 'live') {
        throw new Error(`Live cell ${ref.txHash}:${ref.index} not found.`);
    }
    return liveCell as typeof liveCell & { cell: NonNullable<typeof liveCell.cell> };
}

async function main() {
    initializePudge();
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

    const endpoint = await resolveWorkingEndpointPair();
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const lockScript = getDeployerLock(privateKey);
    const indexer = getIndexer(endpoint);

    const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const repoRoot = path.resolve(currentDir, '..', '..', '..');
    const safeReleaseDir = path.resolve(repoRoot, 'obscell-source', 'target-noatomic-all', 'riscv64imac-unknown-none-elf', 'release');

    const artifacts: SafeArtifact[] = [
        readArtifact('STEALTH_LOCK', 'stealth-lock', path.join(safeReleaseDir, 'stealth-lock')),
        readArtifact('CT_INFO_TYPE', 'ct-info-type', path.join(safeReleaseDir, 'ct-info-type')),
        readArtifact('CT_TOKEN_TYPE', 'ct-token-type', path.join(safeReleaseDir, 'ct-token-type')),
    ];

    const requiredInputs: InputCellRef[] = [
        { txHash: requiredEnv('STEALTH_LOCK_TX_HASH'), index: requiredEnv('STEALTH_LOCK_INDEX') },
        { txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'), index: requiredEnv('CT_INFO_TYPE_INDEX') },
        { txHash: requiredEnv('CT_TOKEN_TYPE_TX_HASH'), index: requiredEnv('CT_TOKEN_TYPE_INDEX') },
    ];

    const reservedOutPoints = new Set<string>(requiredInputs.map(normalizeOutPoint));
    const inputCells: any[] = [];
    let totalInputCapacity = 0n;

    for (const ref of requiredInputs) {
        const liveCell = await fetchLiveCell(ref);
        inputCells.push({
            cellOutput: liveCell.cell.output,
            data: liveCell.cell.data.content,
            outPoint: ref,
        });
        totalInputCapacity += BigInt(liveCell.cell.output.capacity);
    }

    const totalOutputCapacity = artifacts.reduce((sum, artifact) => sum + artifact.capacity, 0n);
    const minimumRequired = totalOutputCapacity + FEE_BUFFER;

    if (totalInputCapacity < minimumRequired) {
        const collector = indexer.collector({ lock: lockScript });
        for await (const cell of collector.collect()) {
            if (!cell.outPoint) {
                continue;
            }

            const outPointKey = `${cell.outPoint.txHash}:${cell.outPoint.index}`;
            if (reservedOutPoints.has(outPointKey)) {
                continue;
            }

            const hasType = !!cell.cellOutput.type;
            const dataBytes = cell.data ? (cell.data.length - 2) / 2 : 0;
            if (hasType || dataBytes > 0) {
                continue;
            }

            reservedOutPoints.add(outPointKey);
            inputCells.push(cell);
            totalInputCapacity += BigInt(cell.cellOutput.capacity);
            if (totalInputCapacity >= minimumRequired) {
                break;
            }
        }
    }

    if (totalInputCapacity < minimumRequired) {
        throw new Error(
            `Not enough capacity to deploy safe obscell code cells. Have ${(totalInputCapacity / SHANNONS).toString()} CKB, need ${(minimumRequired / SHANNONS).toString()} CKB.`,
        );
    }

    const changeCapacity = totalInputCapacity - totalOutputCapacity - FEE_BUFFER;
    const outputs = artifacts.map(artifact => ({
        cellOutput: {
            capacity: `0x${artifact.capacity.toString(16)}`,
            lock: lockScript,
        },
        data: artifact.hex,
    }));

    if (changeCapacity >= 61n * SHANNONS) {
        outputs.push({
            cellOutput: {
                capacity: `0x${changeCapacity.toString(16)}`,
                lock: lockScript,
            },
            data: '0x',
        });
    }

    let txSkeleton = helpers.TransactionSkeleton({});
    for (const inputCell of inputCells) {
        txSkeleton = txSkeleton.update('inputs', (inputs: any) => inputs.push(inputCell));
    }
    for (const output of outputs) {
        txSkeleton = txSkeleton.update('outputs', (list: any) => list.push(output));
    }

    const secp = lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!;
    txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
        cellDeps.push({
            outPoint: {
                txHash: secp.TX_HASH,
                index: secp.INDEX,
            },
            depType: secp.DEP_TYPE as any,
        }),
    );

    const { blockchain } = await import('@ckb-lumos/base');
    const witnessArgs = blockchain.WitnessArgs.pack({ lock: new Uint8Array(65) });
    const witnessPlaceholder = `0x${Array.from(new Uint8Array(witnessArgs)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => {
        let next = witnesses.push(witnessPlaceholder);
        for (let i = 1; i < inputCells.length; i += 1) {
            next = next.push('0x');
        }
        return next;
    });

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    await waitForTransaction(txHash);

    console.log('Safe obscell code deployment committed.');
    for (let index = 0; index < artifacts.length; index += 1) {
        const artifact = artifacts[index];
        console.log(`${artifact.envPrefix}_TX_HASH=${txHash}`);
        console.log(`${artifact.envPrefix}_INDEX=0x${index.toString(16)}`);
        console.log(`${artifact.envPrefix}_CODE_HASH=${artifact.codeHash}`);
    }
    if (outputs.length > artifacts.length) {
        console.log(`SAFE_CODE_CHANGE_INDEX=0x${artifacts.length.toString(16)}`);
    }
}

main().catch((error) => {
    console.error('deploy-safe-obscell failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
