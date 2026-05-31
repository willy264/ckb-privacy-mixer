import '../env.js';
import fs from 'fs';
import path from 'path';
import { ccc } from '@ckb-ccc/core';
import { requiredEnv, resolveWorkingEndpointPair, SHANNONS, waitForTransaction } from './ccc.js';

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
    const client = new ccc.ClientPublicTestnet({ url: endpoint.rpcUrl });
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signer = new ccc.SignerCkbPrivateKey(client, normalizedKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

    const { hex, bytes } = readBinaryHex(target.file);
    const binaryCapacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;

    const cccTx = ccc.Transaction.from({});

    // Add the code output
    cccTx.addOutput({
        capacity: ccc.numFrom(binaryCapacity),
        lock: lockScript,
    }, hex);

    // Let CCC collect inputs and handle fees
    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, 1000);

    const txHash = await signer.sendTransaction(cccTx);
    await waitForTransaction(txHash);

    return { txHash, index: '0x0' };
}

async function main() {
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
