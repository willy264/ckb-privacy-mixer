import '../env.js';
import fs from 'fs';
import path from 'path';
import { ccc } from '@ckb-ccc/core';
import { blake2b, PERSONAL, serializeInput } from '@nervosnetwork/ckb-sdk-utils';
import {
    requiredEnv,
    resolveWorkingEndpointPair,
    waitForTransaction,
} from './ccc.js';
import { createCtInfoData, MINTABLE } from './obscell.js';

const SHANNONS = 100_000_000n;
const FEE_BUFFER = 500_000n;

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
        codeHash: ccc.hexFrom(ccc.hashCkb(bytes)),
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

async function main() {
    const endpoint = await resolveWorkingEndpointPair();
    const client = new ccc.ClientPublicTestnet({ url: endpoint.rpcUrl });
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signer = new ccc.SignerCkbPrivateKey(client, normalizedKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

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

    // Fetch the live ct-info state cell
    const ctInfoCellOutPoint = {
        txHash: requiredEnv('CT_INFO_CELL_TX_HASH'),
        index: requiredEnv('CT_INFO_CELL_INDEX'),
    };
    const liveStateCell = await client.getCell(ctInfoCellOutPoint);
    if (!liveStateCell) {
        throw new Error(`Live ct-info state cell not found at ${ctInfoCellOutPoint.txHash}:${ctInfoCellOutPoint.index}`);
    }

    const cccTx = ccc.Transaction.from({});

    // Add obsolete code cells as inputs (to consume and replace them)
    for (const ref of obsoleteCodeCells) {
        cccTx.addInput({
            previousOutput: {
                txHash: ref.txHash,
                index: ccc.numToHex(ref.index),
            },
            since: '0x0',
        });
    }

    // Add ct-info state cell as input
    cccTx.addInput({
        previousOutput: {
            txHash: ctInfoCellOutPoint.txHash,
            index: ccc.numToHex(ctInfoCellOutPoint.index),
        },
        since: '0x0',
    });

    // Read binaries and add new code outputs
    const binaries = artifacts.map((artifact) => ({
        ...artifact,
        ...readBinary(artifact.file),
    }));

    for (const binary of binaries) {
        cccTx.addOutput({
            capacity: ccc.numFrom(binary.capacity),
            lock: lockScript,
        }, binary.hex);
    }

    // Build the migrated ct-info state output
    const firstInput = {
        previousOutput: { txHash: obsoleteCodeCells[0].txHash, index: obsoleteCodeCells[0].index },
        since: '0x0',
    };
    const typeArgs = createTypeIdArgs(firstInput, BigInt(binaries.length));

    const ctInfoData = createCtInfoData({
        totalSupply: 0n,
        supplyCap: BigInt(process.env.CT_INFO_SUPPLY_CAP ?? '1000000'),
        flags: MINTABLE,
    });

    const migratedCtInfoType = ccc.Script.from({
        codeHash: requiredEnv('CT_INFO_TYPE_CODE_HASH'),
        hashType: requiredEnv('CT_INFO_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type',
        args: typeArgs,
    });

    cccTx.addOutput({
        capacity: ccc.numFrom(liveStateCell.cellOutput.capacity),
        lock: liveStateCell.cellOutput.lock,
        type: migratedCtInfoType,
    }, ccc.hexFrom(ctInfoData));

    // Add secp256k1 cell dep
    const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    cccTx.addCellDeps({
        outPoint: secp.cellDeps[0].cellDep.outPoint,
        depType: secp.cellDeps[0].cellDep.depType,
    });

    // Complete inputs for fees and handle change
    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    await waitForTransaction(txHash);

    const codeHashes = Object.fromEntries(
        binaries.map(binary => [binary.envPrefix, binary.codeHash]),
    );

    const outputIndexes = {
        STEALTH_LOCK: '0x0',
        CT_INFO_TYPE: '0x1',
        CT_TOKEN_TYPE: '0x2',
        CT_INFO_CELL: '0x3',
    };

    console.log('Safe obscell migration committed.');
    console.log(`STEALTH_LOCK_TX_HASH=${txHash}`);
    console.log(`STEALTH_LOCK_INDEX=${outputIndexes.STEALTH_LOCK}`);
    console.log(`CT_INFO_TYPE_TX_HASH=${txHash}`);
    console.log(`CT_INFO_TYPE_INDEX=${outputIndexes.CT_INFO_TYPE}`);
    console.log(`CT_TOKEN_TYPE_TX_HASH=${txHash}`);
    console.log(`CT_TOKEN_TYPE_INDEX=${outputIndexes.CT_TOKEN_TYPE}`);
    console.log(`CT_INFO_CELL_TX_HASH=${txHash}`);
    console.log(`CT_INFO_CELL_INDEX=${outputIndexes.CT_INFO_CELL}`);
    console.log(`CT_INFO_TYPE_ARGS=${typeArgs}`);
    console.log(`STEALTH_LOCK_CODE_HASH=${codeHashes.STEALTH_LOCK}`);
    console.log(`CT_INFO_TYPE_CODE_HASH=${codeHashes.CT_INFO_TYPE}`);
    console.log(`CT_TOKEN_TYPE_CODE_HASH=${codeHashes.CT_TOKEN_TYPE}`);
}

main().catch((error) => {
    console.error('migrate-safe-obscell failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
