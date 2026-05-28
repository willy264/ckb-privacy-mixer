import { RPC, Indexer, hd, helpers, config as lumosConfig } from '@ckb-lumos/lumos';

export const SHANNONS = 100_000_000n;

type EndpointPair = {
    rpcUrl: string;
    indexerUrl: string;
    label: string;
};

const DEFAULT_ENDPOINTS: EndpointPair[] = [
    {
        label: 'ckbapp',
        rpcUrl: 'https://testnet.ckbapp.dev/rpc',
        indexerUrl: 'https://testnet.ckbapp.dev/indexer',
    },
    {
        label: 'ckb-dev',
        rpcUrl: 'https://testnet.ckb.dev/rpc',
        indexerUrl: 'https://testnet.ckb.dev/indexer',
    },
];

const TRANSIENT_NETWORK_PATTERNS = [
    'fetch failed',
    'bad record mac',
    'tls',
    'econnreset',
    'socket hang up',
    'etimedout',
    'timeout',
    'network',
    'temporarily unavailable',
];

let cachedEndpointPair: EndpointPair | null = null;

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

function normalizeRpcUrl(url: string) {
    return url.trim().replace(/\/+$/, '');
}

function normalizeIndexerUrl(url: string) {
    return url.trim().replace(/\/+$/, '');
}

function inferIndexerUrlFromRpc(rpcUrl: string) {
    const normalizedRpc = normalizeRpcUrl(rpcUrl);
    if (normalizedRpc.endsWith('/rpc')) {
        return `${normalizedRpc.slice(0, -4)}/indexer`;
    }
    return `${normalizedRpc}/indexer`;
}

function endpointKey(endpoint: EndpointPair) {
    return `${endpoint.rpcUrl}::${endpoint.indexerUrl}`;
}

function dedupeEndpoints(endpoints: EndpointPair[]) {
    const seen = new Set<string>();
    const deduped: EndpointPair[] = [];
    for (const endpoint of endpoints) {
        const key = endpointKey(endpoint);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(endpoint);
    }
    return deduped;
}

function collectConfiguredEndpoints(): EndpointPair[] {
    const configuredRpcUrl = process.env.CKB_RPC_URL?.trim();
    const configuredIndexerUrl = process.env.CKB_INDEXER_URL?.trim();
    const configured: EndpointPair[] = [];

    if (configuredRpcUrl) {
        configured.push({
            label: 'configured',
            rpcUrl: normalizeRpcUrl(configuredRpcUrl),
            indexerUrl: configuredIndexerUrl
                ? normalizeIndexerUrl(configuredIndexerUrl)
                : inferIndexerUrlFromRpc(configuredRpcUrl),
        });
    }

    return dedupeEndpoints([
        ...configured,
        ...DEFAULT_ENDPOINTS,
    ]);
}

function isTransientNetworkError(error: unknown) {
    const message =
        typeof error === 'string'
            ? error
            : error instanceof Error
              ? error.message
              : JSON.stringify(error);

    const normalized = message.toLowerCase();
    return TRANSIENT_NETWORK_PATTERNS.some(pattern => normalized.includes(pattern));
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callJsonRpc<T>(rpcUrl: string, method: string, params: unknown[]) {
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

    const payload = await response.json() as { result?: T; error?: { code?: number; message?: string } };
    if (payload.error) {
        throw new Error(`RPC ${method} failed on ${rpcUrl}: ${JSON.stringify(payload.error)}`);
    }

    if (payload.result === undefined) {
        throw new Error(`RPC ${method} returned no result on ${rpcUrl}`);
    }

    return payload.result;
}

async function probeEndpointPair(endpoint: EndpointPair) {
    await callJsonRpc(endpoint.rpcUrl, 'get_tip_header', []);
    await callJsonRpc(endpoint.indexerUrl, 'get_cells', [
        {
            script: {
                code_hash: lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                hash_type: lumosConfig.getConfig().SCRIPTS.SECP256K1_BLAKE160!.HASH_TYPE,
                args: '0x',
            },
            script_type: 'lock',
            filter: null,
            with_data: false,
        },
        'asc',
        '0x1',
    ]);
}

export async function resolveWorkingEndpointPair(forceRefresh = false) {
    if (cachedEndpointPair && !forceRefresh) {
        return cachedEndpointPair;
    }

    const candidates = collectConfiguredEndpoints();
    const errors: string[] = [];

    for (const endpoint of candidates) {
        try {
            await probeEndpointPair(endpoint);
            cachedEndpointPair = endpoint;
            return endpoint;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${endpoint.label}: ${message}`);
        }
    }

    throw new Error(`No working CKB endpoint pair found. Tried ${candidates.length} pair(s): ${errors.join(' | ')}`);
}

export function getRpc(endpoint?: EndpointPair) {
    const resolved = endpoint ?? cachedEndpointPair ?? collectConfiguredEndpoints()[0];
    return new RPC(resolved.rpcUrl);
}

export function getIndexer(endpoint?: EndpointPair) {
    const resolved = endpoint ?? cachedEndpointPair ?? collectConfiguredEndpoints()[0];
    return new Indexer(resolved.indexerUrl, resolved.rpcUrl);
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
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const endpoint = await resolveWorkingEndpointPair();
        const rpc = getRpc(endpoint);

        try {
            const tx = await rpc.getTransaction(txHash);
            const status = (tx as any)?.txStatus?.status ?? (tx as any)?.tx_status?.status;
            if (status === 'committed') {
                await sleep(settleMs);
                return;
            }
            if (status === 'rejected') {
                throw new Error(`Transaction ${txHash} was rejected by the node`);
            }
        } catch (error) {
            if (isTransientNetworkError(error)) {
                await resolveWorkingEndpointPair(true);
            } else {
                throw error;
            }
        }

        await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for transaction ${txHash} to commit`);
}

export async function withEndpointFailover<T>(
    operation: (endpoint: EndpointPair, attempt: number) => Promise<T>,
    options: { maxAttempts?: number; retryDelayMs?: number } = {},
) {
    const maxAttempts = options.maxAttempts ?? 4;
    const retryDelayMs = options.retryDelayMs ?? 1500;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const endpoint = await resolveWorkingEndpointPair(attempt > 1);
        try {
            return await operation(endpoint, attempt);
        } catch (error) {
            lastError = error;
            if (!isTransientNetworkError(error) || attempt === maxAttempts) {
                throw error;
            }
            cachedEndpointPair = null;
            await sleep(retryDelayMs * attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

    const txHash = await withEndpointFailover(async (endpoint) => {
        return getRpc(endpoint).sendTransaction(sealedTx, 'passthrough');
    });

    return { txHash, sealedTx };
}
