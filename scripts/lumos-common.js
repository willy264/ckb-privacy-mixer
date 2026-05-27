import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { RPC, Indexer, hd, helpers, commons, config as lumosConfig, utils } from '@ckb-lumos/lumos';
export const SHANNONS = 100000000n;
export const DEFAULT_FEE_RATE = 1000;
const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');
dotenvConfig({ path: path.resolve(PROJECT_ROOT, '.env') });
export function initializeAggron() {
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
}
export function requiredEnv(key) {
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
export function getDeployerLock(privateKey) {
    const pubKey = hd.key.privateToPublic(privateKey);
    const args = hd.key.publicKeyToBlake160(pubKey);
    const networkConfig = lumosConfig.getConfig();
    const template = networkConfig.SCRIPTS.SECP256K1_BLAKE160;
    return {
        codeHash: template.CODE_HASH,
        hashType: template.HASH_TYPE,
        args,
    };
}
export function getDeployerAddress(privateKey) {
    return helpers.encodeToAddress(getDeployerLock(privateKey), {
        config: lumosConfig.getConfig(),
    });
}
export function readBinaryHex(binaryPath) {
    if (!fs.existsSync(binaryPath)) {
        throw new Error(`Binary not found: ${binaryPath}`);
    }
    const binaryData = fs.readFileSync(binaryPath);
    const hex = '0x' +
        Array.from(binaryData)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    return {
        hex,
        bytes: binaryData.length,
        codeHash: utils.ckbHash(hex),
    };
}
function hexCapacity(value) {
    return `0x${value.toString(16)}`;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function callRpc(method, params) {
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
    return payload.result;
}
function extractTxHashFromError(error) {
    const message = typeof error === 'string'
        ? error
        : error instanceof Error
            ? error.message
            : JSON.stringify(error);
    const match = message.match(/0x[a-fA-F0-9]{64}/);
    return match?.[0];
}
export async function waitForTransaction(txHash, options = {}) {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const pollMs = options.pollMs ?? 5000;
    const settleMs = options.settleMs ?? 10000;
    const startedAt = Date.now();
    console.log(`Waiting for transaction ${txHash} to be committed...`);
    while (Date.now() - startedAt < timeoutMs) {
        const tx = await callRpc('get_transaction', [txHash]);
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
export async function buildAndSendTransaction(txSkeleton, privateKey) {
    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry) => hd.key.signRecoverable(entry.message, privateKey));
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
    try {
        const txHash = await getRpc().sendTransaction(sealedTx, 'passthrough');
        return { txHash, sealedTx, duplicated: false };
    }
    catch (error) {
        console.error('buildAndSendTransaction error:', error);
        const txHash = extractTxHashFromError(error);
        if (txHash) {
            console.warn(`Transaction appears to be already in pool: ${txHash}`);
            return { txHash, sealedTx, duplicated: true };
        }
        throw error;
    }
}
export async function deployBinary(binaryPath, privateKey, label) {
    const rpc = getRpc();
    const indexer = getIndexer();
    const { hex, bytes, codeHash } = readBinaryHex(binaryPath);
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);
    const totalCapacity = 61n * SHANNONS + BigInt(bytes) * SHANNONS;
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = await commons.common.injectCapacity(txSkeleton, [address], totalCapacity, undefined, undefined, { config: lumosConfig.getConfig() });
    txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.update(outputs.size - 1, (cell) => ({
        ...cell,
        data: hex,
    })));
    txSkeleton = await commons.common.payFeeByFeeRate(txSkeleton, [address], DEFAULT_FEE_RATE, undefined, { config: lumosConfig.getConfig() });
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
export async function deployAllBinaries(targets, privateKey) {
    const indexer = getIndexer();
    const lockScript = getDeployerLock(privateKey);
    const address = getDeployerAddress(privateKey);
    const binaries = targets.map((t, i) => {
        const { hex, bytes, codeHash } = readBinaryHex(t.path);
        const capacity = BigInt(bytes) * SHANNONS + 61n * SHANNONS;
        return { ...t, hex, bytes, codeHash, capacity, index: `0x${i.toString(16)}` };
    });
    const totalCapacity = binaries.reduce((acc, b) => acc + b.capacity, 0n);
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = await commons.common.injectCapacity(txSkeleton, [address], totalCapacity, undefined, undefined, { config: lumosConfig.getConfig() });
    // Create a new output for each binary and push it
    for (const b of binaries) {
        txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.push({
            cellOutput: {
                capacity: `0x${b.capacity.toString(16)}`,
                lock: lockScript,
            },
            data: b.hex,
        }));
    }
    txSkeleton = await commons.common.payFeeByFeeRate(txSkeleton, [address], DEFAULT_FEE_RATE, undefined, { config: lumosConfig.getConfig() });
    txSkeleton = commons.common.prepareSigningEntries(txSkeleton, {
        config: lumosConfig.getConfig(),
    });
    const { txHash } = await buildAndSendTransaction(txSkeleton, privateKey);
    console.log(`All binaries deployed in transaction: ${txHash}`);
    const results = {};
    for (const b of binaries) {
        // the outputs we pushed were added to the end, but payFeeByFeeRate might modify the change cell.
        // Actually, the change cell was the LAST one before we pushed our new outputs.
        // Let's find the actual index in the final outputs array.
        const finalOutputs = txSkeleton.get('outputs').toArray();
        const index = finalOutputs.findIndex((o) => o.data === b.hex);
        results[b.envPrefix] = {
            txHash,
            index: `0x${index.toString(16)}`,
            codeHash: b.codeHash,
        };
    }
    return results;
}
export async function bootstrapRegistryCell(privateKey, nullifierTypeCodeHash, nullifierTypeHashType, typeArgs = '0x') {
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
    const minimalCapacity = BigInt(helpers
        .minimalCellCapacityCompatible({
        cellOutput: {
            capacity: '0x0',
            lock: lockScript,
            type: typeScript,
        },
        data,
    }, { validate: false })
        .toString());
    const capacity = minimalCapacity + 20n * SHANNONS;
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = await commons.common.injectCapacity(txSkeleton, [address], capacity, undefined, undefined, { config: lumosConfig.getConfig() });
    txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.update(outputs.size - 1, (cell) => ({
        ...cell,
        cellOutput: {
            ...cell.cellOutput,
            type: typeScript,
        },
        data,
    })));
    txSkeleton = await commons.common.payFeeByFeeRate(txSkeleton, [address], DEFAULT_FEE_RATE, undefined, { config: lumosConfig.getConfig() });
    txSkeleton = txSkeleton.update('cellDeps', cellDeps => cellDeps.push({
        outPoint: {
            txHash: requiredEnv('NULLIFIER_TYPE_TX_HASH'),
            index: requiredEnv('NULLIFIER_TYPE_INDEX')
        },
        depType: 'code'
    }));
    console.log('Outputs after payFeeByFeeRate:', JSON.stringify(txSkeleton.get('outputs').toArray(), null, 2));
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
