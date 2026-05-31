import '../env.js';
import fs from 'fs';
import path from 'path';
import { ccc } from '@ckb-ccc/core';
import { requiredEnv, resolveWorkingEndpointPair, SHANNONS, waitForTransaction } from './ccc.js';

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
        codeHash: ccc.hexFrom(ccc.hashCkb(binary)),
        capacity: BigInt(binary.length) * SHANNONS + 61n * SHANNONS,
    };
}

async function main() {
    const endpoint = await resolveWorkingEndpointPair();
    const client = new ccc.ClientPublicTestnet({ url: endpoint.rpcUrl });
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const signer = new ccc.SignerCkbPrivateKey(client, privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

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

    const cccTx = ccc.Transaction.from({});
    for (const ref of requiredInputs) {
        cccTx.addInput({
            previousOutput: {
                txHash: ref.txHash,
                index: ccc.numToHex(ref.index),
            },
            since: '0x0',
        });
    }

    for (const artifact of artifacts) {
        cccTx.addOutput({
            capacity: ccc.numFrom(artifact.capacity),
            lock: lockScript,
        }, artifact.hex);
    }

    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    await waitForTransaction(txHash);

    console.log('Safe obscell code deployment committed.');
    for (let index = 0; index < artifacts.length; index += 1) {
        const artifact = artifacts[index];
        console.log(`${artifact.envPrefix}_TX_HASH=${txHash}`);
        console.log(`${artifact.envPrefix}_INDEX=0x${index.toString(16)}`);
        console.log(`${artifact.envPrefix}_CODE_HASH=${artifact.codeHash}`);
    }
    if (cccTx.outputs.length > artifacts.length) {
        console.log(`SAFE_CODE_CHANGE_INDEX=0x${artifacts.length.toString(16)}`);
    }
}

main().catch((error) => {
    console.error('deploy-safe-obscell failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
