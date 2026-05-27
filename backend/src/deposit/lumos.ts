import { RPC, Indexer, hd, helpers, config as lumosConfig } from '@ckb-lumos/lumos';

export const SHANNONS = 100_000_000n;

export function initializePudge() {
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
    const rpcUrl = requiredEnv('CKB_RPC_URL');
    return new RPC(rpcUrl);
}

export function getIndexer() {
    const rpcUrl = requiredEnv('CKB_RPC_URL');
    const indexerUrl = process.env.CKB_INDEXER_URL || rpcUrl;
    return new Indexer(indexerUrl, rpcUrl);
}

export function getDeployerLock(privateKey: string) {
    const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const pubKey = hd.key.privateToPublic(normalized);
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

export async function waitForTransaction(
    txHash: string,
    options: { timeoutMs?: number; pollMs?: number; settleMs?: number } = {},
) {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const pollMs = options.pollMs ?? 5000;
    const settleMs = options.settleMs ?? 10000;
    const rpc = getRpc();
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const tx = await rpc.getTransaction(txHash);
        const status = (tx as any)?.txStatus?.status ?? (tx as any)?.tx_status?.status;
        if (status === 'committed') {
            await new Promise(resolve => setTimeout(resolve, settleMs));
            return;
        }
        if (status === 'rejected') {
            throw new Error(`Transaction ${txHash} was rejected by the node`);
        }
        await new Promise(resolve => setTimeout(resolve, pollMs));
    }

    throw new Error(`Timed out waiting for transaction ${txHash} to commit`);
}

export async function buildAndSendTransaction(
    txSkeleton: ReturnType<typeof helpers.TransactionSkeleton>,
    privateKey: string,
) {
    const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signingEntries = txSkeleton.get('signingEntries').toArray();
    const signatures = signingEntries.map((entry: any) =>
        hd.key.signRecoverable(entry.message, normalized),
    );
    const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
    const txHash = await getRpc().sendTransaction(sealedTx, 'passthrough');
    return { txHash, sealedTx };
}
