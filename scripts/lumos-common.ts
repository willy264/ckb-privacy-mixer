import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { RPC, Indexer, hd, helpers, commons, config as lumosConfig, utils } from '@ckb-lumos/lumos';

export const SHANNONS = 100_000_000n;
export const DEFAULT_FEE_RATE = 1000;

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

dotenvConfig({ path: path.resolve(PROJECT_ROOT, '.env') });

export function initializeAggron() {
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
}

export function requiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export function getRpc() {
    const rpcUrl = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
    return new RPC(rpcUrl);
}

export function getIndexer() {
    const rpcUrl = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
    const indexerUrl = process.env.CKB_INDEXER_URL || rpcUrl;
    return new Indexer(indexerUrl, rpcUrl);
}

export function getDeployerLock(privateKey: string) {
    const pubKey = hd.key.privateToPublic(privateKey);
    const args = hd.key.publicKeyToBlake160(pubKey);
    const networkConfig = lumosConfig.getConfig();
    const template = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
    return {
        codeHash: template.CODE_HASH,
        hashType: template.HASH_TYPE as 'type',
        args,
    };
}

export function getDeployerAddress(privateKey: string) {
    return helpers.encodeToAddress(getDeployerLock(privateKey), {
        config: lumosConfig.getConfig(),
    });
}

export function readBinaryHex(binaryPath: string): { hex: string; bytes: number; codeHash: string } {
    if (!fs.existsSync(binaryPath)) {
        throw new Error(`Binary not found: ${binaryPath}`);
    }

    const binaryData = fs.readFileSync(binaryPath);
    const hex =
        '0x' +
        Array.from(binaryData)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');

    return {
        hex,
        bytes: binaryData.length,
        codeHash: utils.ckbHash(hex),
    };
}

function hexCapacity(value: bigint) {
    return `0x${value.toString(16)}`;
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

export async function buildAndSendTransaction(
    txSkeleton: ReturnType<typeof helpers.TransactionSkeleton>,
    privateKey: string,
) {
    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, privateKey),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
    try {
        const txHash = await getRpc().sendTransaction(sealedTx, 'passthrough');
        return { txHash, sealedTx, duplicated: false };
    } catch (error) {
        const txHash = extractTxHashFromError(error);
        if (txHash) {
            console.warn(`Transaction appears to be already in pool: ${txHash}`);
            return { txHash, sealedTx, duplicated: true };
        }
        throw error;
    }
}

export async function deployBinary(
    binaryPath: string,
    privateKey: string,
    label: string,
): Promise<{ txHash: string; index: string; codeHash: string }> {
    const rpc = getRpc();
    const indexer = getIndexer();
    const { hex, bytes, codeHash } = readBinaryHex(binaryPath);

    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);

    const totalCapacity = 61n * SHANNONS + BigInt(bytes) * SHANNONS;

    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs.push({
            cellOutput: {
                capacity: hexCapacity(totalCapacity),
                lock: lockScript,
            },
            data: hex,
        }),
    );

    txSkeleton = await commons.common.injectCapacity(
        txSkeleton,
        [address],
        totalCapacity,
        undefined,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = await commons.common.payFeeByFeeRate(
        txSkeleton,
        [address],
        DEFAULT_FEE_RATE,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const { txHash, duplicated } = await buildAndSendTransaction(txSkeleton, privateKey);
    console.log(`${label} ${duplicated ? 'already submitted' : 'deployed'}: ${txHash}`);
    return {
        txHash,
        index: '0x0',
        codeHash,
    };
}

export async function bootstrapRegistryCell(
    privateKey: string,
    nullifierTypeCodeHash: string,
    nullifierTypeHashType: 'data' | 'data1' | 'type',
    typeArgs: string = '0x',
) {
    const rpc = getRpc();
    const indexer = getIndexer();
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);
    const data = '0x00000000';
    const typeScript = {
        codeHash: nullifierTypeCodeHash,
        hashType: nullifierTypeHashType,
        args: typeArgs,
    };

    const minimalCapacity = BigInt(
        helpers
            .minimalCellCapacityCompatible(
                {
                    cellOutput: {
                        capacity: '0x0',
                        lock: lockScript,
                        type: typeScript,
                    },
                    data,
                } as any,
                { validate: false },
            )
            .toString(),
    );

    const capacity = minimalCapacity + 20n * SHANNONS;

    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
        outputs.push({
            cellOutput: {
                capacity: hexCapacity(capacity),
                lock: lockScript,
                type: typeScript,
            },
            data,
        }),
    );

    txSkeleton = await commons.common.injectCapacity(
        txSkeleton,
        [address],
        capacity,
        undefined,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = await commons.common.payFeeByFeeRate(
        txSkeleton,
        [address],
        DEFAULT_FEE_RATE,
        undefined,
        { config: lumosConfig.getConfig() },
    );

    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });

    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    return {
        txHash,
        index: '0x0',
        lock: address,
        capacity: hexCapacity(capacity),
        typeArgs,
        data,
    };
}
