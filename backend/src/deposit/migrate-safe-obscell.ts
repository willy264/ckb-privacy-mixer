import '../env.js';
import fs from 'fs';
import path from 'path';
import { helpers, commons, config as lumosConfig, hd, RPC } from '@ckb-lumos/lumos';
import { blake2b, PERSONAL, serializeInput, scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import {
    buildAndSendTransaction,
    getDeployerAddress,
    getDeployerLock,
    getIndexer,
    getRpc,
    initializePudge,
    requiredEnv,
    resolveWorkingEndpointPair,
    waitForTransaction,
} from './lumos.js';
import { createCtInfoData, MINTABLE } from './obscell.js';

const SHANNONS = 100_000_000n;
const FEE_BUFFER = 500_000n;

type OutputPlan = {
    cellOutput: {
        capacity: string;
        lock: any;
        type?: any;
    };
    data: string;
};

type CodeArtifact = {
    envPrefix: 'STEALTH_LOCK' | 'CT_INFO_TYPE' | 'CT_TOKEN_TYPE';
    name: string;
    file: string;
};

function readBinary(binaryPath: string) {
    const bytes = fs.readFileSync(binaryPath);
    return {
        hex: `0x${Buffer.from(bytes).toString('hex')}`,
        capacity: BigInt(bytes.length) * SHANNONS + 61n * SHANNONS,
    };
}

function createTypeIdArgs(firstInput: { previousOutput: { txHash: string; index: string }; since: string }, outputIndex: bigint | number) {
    const serializedInput = serializeInput(firstInput);
    const inputBytes = Buffer.from(serializedInput.replace(/^0x/, ''), 'hex');
    const indexBytes = Buffer.alloc(8);
    indexBytes.writeBigUInt64LE(BigInt(outputIndex));
    const payload = Buffer.concat([inputBytes, indexBytes]);
    const hasher = blake2b(32, null, null, PERSONAL);
    hasher.update(payload);
    return `0x${hasher.digest('hex')}`;
}

async function fetchLiveCell(rpc: RPC, txHash: string, index: string) {
    const liveCell = await rpc.getLiveCell({ txHash, index } as any, true);
    if (!liveCell.cell || liveCell.status !== 'live') {
        throw new Error(`Live cell ${txHash}:${index} not found`);
    }
    return liveCell as typeof liveCell & { cell: NonNullable<typeof liveCell.cell> };
}

async function buildMigrationSkeleton() {
    initializePudge();
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
    const endpoint = await resolveWorkingEndpointPair();
    const rpc = getRpc(endpoint);
    const indexer = getIndexer(endpoint);
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);

    const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const repoRoot = path.resolve(currentDir, '..', '..', '..');
    const releaseDir = path.resolve(repoRoot, 'obscell-source', 'target-noatomic-all', 'riscv64imac-unknown-none-elf', 'release');

    const artifacts: CodeArtifact[] = [
        { envPrefix: 'STEALTH_LOCK', name: 'stealth-lock', file: path.join(releaseDir, 'stealth-lock') },
        { envPrefix: 'CT_INFO_TYPE', name: 'ct-info-type', file: path.join(releaseDir, 'ct-info-type') },
        { envPrefix: 'CT_TOKEN_TYPE', name: 'ct-token-type', file: path.join(releaseDir, 'ct-token-type') },
    ];

    const obsoleteCodeCells = [
        { txHash: requiredEnv('STEALTH_LOCK_TX_HASH'), index: requiredEnv('STEALTH_LOCK_INDEX') },
        { txHash: requiredEnv('CT_INFO_TYPE_TX_HASH'), index: requiredEnv('CT_INFO_TYPE_INDEX') },
        { txHash: requiredEnv('CT_TOKEN_TYPE_TX_HASH'), index: requiredEnv('CT_TOKEN_TYPE_INDEX') },
    ];

    const liveStateCell = await fetchLiveCell(rpc, requiredEnv('CT_INFO_CELL_TX_HASH'), requiredEnv('CT_INFO_CELL_INDEX'));
    const inputCells = [];
    let totalInputCapacity = 0n;

    for (const ref of obsoleteCodeCells) {
        const liveCell = await fetchLiveCell(rpc, ref.txHash, ref.index);
        inputCells.push({
            cellOutput: liveCell.cell.output,
            data: liveCell.cell.data.content,
            outPoint: {
                txHash: ref.txHash,
                index: ref.index,
            },
        });
        totalInputCapacity += BigInt(liveCell.cell.output.capacity);
    }

    // Consume the live ct-info state cell so we can reissue it against the safe ct-info-type code hash.
    inputCells.push({
        cellOutput: liveStateCell.cell.output,
        data: liveStateCell.cell.data.content,
        outPoint: {
            txHash: requiredEnv('CT_INFO_CELL_TX_HASH'),
            index: requiredEnv('CT_INFO_CELL_INDEX'),
        },
    });
    totalInputCapacity += BigInt(liveStateCell.cell.output.capacity);

    const binaries = artifacts.map((artifact) => ({
        ...artifact,
        ...readBinary(artifact.file),
    }));

    const outputPlans: OutputPlan[] = binaries.map(binary => ({
        cellOutput: {
            capacity: `0x${binary.capacity.toString(16)}`,
            lock: lockScript,
        },
        data: binary.hex,
    }));

    const firstInput = {
        previousOutput: inputCells[0].outPoint,
        since: '0x0',
    };

    const safeCtInfoBinary = binaries.find(binary => binary.envPrefix === 'CT_INFO_TYPE');
    if (!safeCtInfoBinary) {
        throw new Error('Missing safe ct-info-type artifact');
    }

    const typeArgs = createTypeIdArgs(firstInput, BigInt(outputPlans.length));
    const ctInfoData = createCtInfoData({
        totalSupply: 0n,
        supplyCap: BigInt(process.env.CT_INFO_SUPPLY_CAP ?? '1000000'),
        flags: MINTABLE,
    });
    const ctInfoTypeScript = {
        codeHash: scriptToHash({
            codeHash: '0x',
            hashType: 'type',
            args: '0x',
        } as any),
        hashType: 'data1' as const,
        args: typeArgs,
    };

    // Replace the temporary codeHash with the safe code hash we are about to deploy.
    ctInfoTypeScript.codeHash = scriptToHash({
        codeHash: safeCtInfoBinary.hex,
        hashType: 'data',
        args: '0x',
    } as any);

    // Use the binary hash itself as the code hash since these are code cells with type = null.
    const safeCtInfoCodeHash = scriptToHash({
        codeHash: '0x',
        hashType: 'data',
        args: '0x',
    } as any);
    void safeCtInfoCodeHash;

    // The deployed code hash is the ckb hash of the binary.
    const safeCtInfoDataHash = scriptToHash({
        codeHash: safeCtInfoBinary.hex,
        hashType: 'data',
        args: '0x',
    } as any);
    void safeCtInfoDataHash;

    const safeCtInfoCodeHashEnv = requiredEnv('CT_INFO_TYPE_CODE_HASH');
    const migratedCtInfoType = {
        codeHash: safeCtInfoCodeHashEnv,
        hashType: requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type',
        args: typeArgs,
    };

    outputPlans.push({
        cellOutput: {
            capacity: liveStateCell.cell.output.capacity,
            lock: liveStateCell.cell.output.lock,
            type: migratedCtInfoType,
        },
        data: ctInfoData,
    });

    const totalOutputCapacity = outputPlans.reduce((sum, output) => sum + BigInt(output.cellOutput.capacity), 0n);
    const changeCapacity = totalInputCapacity - totalOutputCapacity - FEE_BUFFER;
    if (changeCapacity < 61n * SHANNONS) {
        throw new Error(`Not enough capacity to migrate safe obscell contracts. Missing ${(61n * SHANNONS - changeCapacity).toString()} shannons.`);
    }

    outputPlans.push({
        cellOutput: {
            capacity: `0x${changeCapacity.toString(16)}`,
            lock: lockScript,
        },
        data: '0x',
    });

    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    for (const inputCell of inputCells) {
        txSkeleton = txSkeleton.update('inputs', (inputs: any) => inputs.push(inputCell));
    }
    for (const output of outputPlans) {
        txSkeleton = txSkeleton.update('outputs', (outputs: any) => outputs.push(output as any));
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
    const witnessPlaceholder = `0x${Array.from(new Uint8Array(witnessArgs)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
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

    return {
        txSkeleton,
        privateKey,
        typeArgs,
        codeHashes: Object.fromEntries(
            binaries.map(binary => [
                binary.envPrefix,
                scriptToHash({
                    codeHash: binary.hex,
                    hashType: 'data',
                    args: '0x',
                } as any),
            ]),
        ),
        outputIndexes: {
            STEALTH_LOCK: '0x0',
            CT_INFO_TYPE: '0x1',
            CT_TOKEN_TYPE: '0x2',
            CT_INFO_CELL: '0x3',
        },
    };
}

async function main() {
    const plan = await buildMigrationSkeleton();
    const { txHash } = await buildAndSendTransaction(plan.txSkeleton, plan.privateKey);
    await waitForTransaction(txHash);

    console.log('Safe obscell migration committed.');
    console.log(`STEALTH_LOCK_TX_HASH=${txHash}`);
    console.log(`STEALTH_LOCK_INDEX=${plan.outputIndexes.STEALTH_LOCK}`);
    console.log(`CT_INFO_TYPE_TX_HASH=${txHash}`);
    console.log(`CT_INFO_TYPE_INDEX=${plan.outputIndexes.CT_INFO_TYPE}`);
    console.log(`CT_TOKEN_TYPE_TX_HASH=${txHash}`);
    console.log(`CT_TOKEN_TYPE_INDEX=${plan.outputIndexes.CT_TOKEN_TYPE}`);
    console.log(`CT_INFO_CELL_TX_HASH=${txHash}`);
    console.log(`CT_INFO_CELL_INDEX=${plan.outputIndexes.CT_INFO_CELL}`);
    console.log(`CT_INFO_TYPE_ARGS=${plan.typeArgs}`);
    console.log(`STEALTH_LOCK_CODE_HASH=${plan.codeHashes.STEALTH_LOCK}`);
    console.log(`CT_INFO_TYPE_CODE_HASH=${plan.codeHashes.CT_INFO_TYPE}`);
    console.log(`CT_TOKEN_TYPE_CODE_HASH=${plan.codeHashes.CT_TOKEN_TYPE}`);
}

main().catch((error) => {
    console.error('migrate-safe-obscell failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
