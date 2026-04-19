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

export async function buildAndSendTransaction(
    txSkeleton: ReturnType<typeof helpers.TransactionSkeleton>,
    privateKey: string,
) {
    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, privateKey),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
    const txHash = await getRpc().sendTransaction(sealedTx, 'passthrough');
    return { txHash, sealedTx };
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

    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    console.log(`${label} deployed: ${txHash}`);
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
