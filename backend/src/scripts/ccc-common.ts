import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { ccc } from '@ckb-ccc/core';

export const SHANNONS = 100_000_000n;
export const DEFAULT_FEE_RATE = 1000;

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

dotenvConfig({ path: path.resolve(PROJECT_ROOT, '.env') });

export function requiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export function getClient() {
    const rpcUrl = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
    return new ccc.ClientPublicTestnet({ url: rpcUrl });
}

export function getSigner(client: ccc.Client, privateKey: string) {
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    return new ccc.SignerCkbPrivateKey(client, normalizedKey);
}

export function readBinaryHex(binaryPath: string): { hex: string; bytes: number; codeHash: string } {
    if (!fs.existsSync(binaryPath)) {
        throw new Error(`Binary not found: ${binaryPath}`);
    }

    const binaryData = fs.readFileSync(binaryPath);
    const hex = `0x${Buffer.from(binaryData).toString('hex')}`;

    return {
        hex,
        bytes: binaryData.length,
        codeHash: ccc.hexFrom(ccc.hashCkb(binaryData)),
    };
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callRpc<T>(method: string, params: unknown[]): Promise<T> {
    const rpcUrl = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            method,
            params,
        }),
    });

    const payload = await response.json();
    if (payload.error) {
        throw new Error(JSON.stringify(payload.error));
    }
    return payload.result as T;
}

export async function waitForTransaction(
    txHash: string,
    options: { timeoutMs?: number; pollMs?: number; settleMs?: number } = {},
) {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const pollMs = options.pollMs ?? 5000;
    const settleMs = options.settleMs ?? 10000;
    const startedAt = Date.now();

    console.log(`Waiting for transaction ${txHash} to be committed...`);
    while (Date.now() - startedAt < timeoutMs) {
        const tx = await callRpc<{ tx_status?: { status: string } } | null>('get_transaction', [txHash]);
        const status = tx?.tx_status?.status;
        if (status === 'committed') {
            console.log(`Transaction ${txHash} committed.`);
            await sleep(settleMs);
            return;
        }

        if (status === 'rejected') {
            throw new Error(`Transaction ${txHash} was rejected by the node`);
        }

        console.log(`Current status for ${txHash}: ${status ?? 'unknown'}; waiting...`);
        await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for transaction ${txHash} to commit`);
}

export async function deployBinary(
    binaryPath: string,
    privateKey: string,
    label: string,
): Promise<{ txHash: string; index: string; codeHash: string }> {
    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;
    const { hex, bytes, codeHash } = readBinaryHex(binaryPath);

    const totalCapacity = 61n * SHANNONS + BigInt(bytes) * SHANNONS;

    const cccTx = ccc.Transaction.from({});
    cccTx.addOutput({
        capacity: ccc.numFrom(totalCapacity),
        lock: lockScript,
    }, hex);

    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, DEFAULT_FEE_RATE);

    let txHash: string;
    let duplicated = false;
    try {
        txHash = await signer.sendTransaction(cccTx);
    } catch (error) {
        console.error('deployBinary error:', error);
        const extracted = extractTxHashFromError(error);
        if (extracted) {
            console.warn(`Transaction appears to be already in pool: ${extracted}`);
            txHash = extracted;
            duplicated = true;
        } else {
            throw error;
        }
    }

    console.log(`${label} ${duplicated ? 'already submitted' : 'deployed'}: ${txHash}`);
    return {
        txHash,
        index: '0x0',
        codeHash,
    };
}

function extractTxHashFromError(error: unknown): string | undefined {
    const message =
        typeof error === 'string'
            ? error
            : error instanceof Error
              ? error.message
              : JSON.stringify(error);
    const match = message.match(/0x[a-fA-F0-9]{64}/);
    return match?.[0];
}

export async function deployAllBinaries(
    targets: { path: string; name: string; envPrefix: string }[],
    privateKey: string,
): Promise<Record<string, { txHash: string; index: string; codeHash: string }>> {
    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;

    const binaries = targets.map((t, i) => {
        const { hex, bytes, codeHash } = readBinaryHex(t.path);
        const capacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;
        return { ...t, hex, bytes, codeHash, capacity, index: `0x${i.toString(16)}` };
    });

    const cccTx = ccc.Transaction.from({});

    for (const b of binaries) {
        cccTx.addOutput({
            capacity: ccc.numFrom(b.capacity),
            lock: lockScript,
        }, b.hex);
    }

    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, DEFAULT_FEE_RATE);

    const txHash = await signer.sendTransaction(cccTx);
    console.log(`All binaries deployed in transaction: ${txHash}`);

    const results: Record<string, any> = {};
    for (let i = 0; i < binaries.length; i++) {
        const b = binaries[i];
        results[b.envPrefix] = {
            txHash,
            index: `0x${i.toString(16)}`,
            codeHash: b.codeHash,
        };
    }
    return results;
}

export async function bootstrapRegistryCell(
    privateKey: string,
    nullifierTypeCodeHash: string,
    nullifierTypeHashType: 'data' | 'data1' | 'type',
    typeArgs: string = '0x',
) {
    const client = getClient();
    const signer = getSigner(client, privateKey);
    const lockScript = (await signer.getRecommendedAddressObj()).script;
    const address = await signer.getRecommendedAddress();
    const data = '0x00000000';
    const typeScript = ccc.Script.from({
        codeHash: nullifierTypeCodeHash,
        hashType: nullifierTypeHashType,
        args: typeArgs,
    });

    // Estimate capacity: lock + type + data
    const capacity = 200n * SHANNONS; // generous allocation for registry cell

    const cccTx = ccc.Transaction.from({});

    cccTx.addOutput({
        capacity: ccc.numFrom(capacity),
        lock: lockScript,
        type: typeScript,
    }, data);

    cccTx.addCellDeps({
        outPoint: {
            txHash: requiredEnv('NULLIFIER_TYPE_TX_HASH'),
            index: ccc.numToHex(requiredEnv('NULLIFIER_TYPE_INDEX')),
        },
        depType: 'code',
    });

    await cccTx.completeInputsByCapacity(signer);
    await cccTx.completeFeeBy(signer, DEFAULT_FEE_RATE);

    console.log('Outputs:', JSON.stringify(cccTx.outputs, null, 2));
    const txHash = await signer.sendTransaction(cccTx);
    return {
        txHash,
        index: '0x0',
        lock: address,
        capacity: `0x${capacity.toString(16)}`,
        typeArgs,
        data,
    };
}
