/**
 * Relayer client for the CKB Privacy Mixer frontend.
 *
 * Instead of broadcasting a withdrawal via the user's JoyID wallet (which
 * leaks their identity through the transaction fee), the user submits their
 * ZK proof to a Relayer. The Relayer pays the CKB gas fee and broadcasts
 * the transaction, then deducts a small service fee from the withdrawal amount.
 *
 * The relayer CANNOT steal funds — the ZK proof constrains the output
 * destination on-chain, enforced by the `zk-membership-type` contract.
 */

export interface RelayerInfo {
    /** Relayer's CKB address (receives the fee). */
    address: string;
    /** Fee as a percentage, e.g. 1.00 = 1%. */
    feePercent: number;
    /** HTTP endpoint of this relayer. */
    endpoint: string;
    /** CKB network the relayer is connected to. */
    network: string;
}

export interface RelayJobResult {
    jobId: string;
    status: 'queued' | 'broadcast' | 'failed';
    txHash?: string;
    error?: string;
}

export interface DepositJobResult {
    note: unknown;
    mintTxHash: string;
    stealthArgs: string;
    sessionId: string;
    inputOutPoint: string;
}

export interface DepositSessionSnapshot {
    sessionId: string;
    denomination: number;
    commitments: string[];
    size: number;
    updatedAt: number;
    participantCount: number;
    pendingCount: number;
    registeredCount: number;
    status: 'open' | 'ready' | 'finalizing' | 'complete' | 'failed';
    targetSize: number;
    finalizedAt?: number;
}

/** Read the relayer URL from Vite env, defaulting to localhost for dev. */
export function getRelayerUrl(): string {
    return (import.meta as any).env?.VITE_RELAYER_URL ?? 'http://localhost:4000';
}

/**
 * Fetch public info (fee rate, address) from the configured relayer.
 * Used to show the user the fee before they commit to relaying.
 */
export async function fetchRelayerInfo(endpoint = getRelayerUrl()): Promise<RelayerInfo> {
    const res = await fetch(`${endpoint}/info`);
    if (!res.ok) throw new Error(`Relayer unreachable: HTTP ${res.status}`);
    const data = (await res.json()) as {
        relayerAddress: string;
        feePercent: number;
        network: string;
    };
    return {
        address:    data.relayerAddress,
        feePercent: data.feePercent,
        endpoint,
        network:    data.network ?? 'testnet',
    };
}

/**
 * POST the ZK proof to the relayer.
 *
 * The user's JoyID wallet is NOT used here — preserving full anonymity.
 * Returns a job ID immediately; the transaction is broadcast asynchronously.
 */
export async function submitToRelayer(
    nullifierHex:     string,
    transaction:      unknown,
    endpoint = getRelayerUrl(),
): Promise<RelayJobResult> {
    const res = await fetch(`${endpoint}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nullifierHex,
            transaction,
        }),
    });

    const body = (await res.json().catch(() => ({ error: 'Empty response from relayer' }))) as
        | RelayJobResult
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Relay failed: HTTP ${res.status}`);
    }

    return body as RelayJobResult;
}

export async function submitLiveDeposit(
    walletAddress: string,
    endpoint = getRelayerUrl(),
): Promise<DepositJobResult> {
    const res = await fetch(`${endpoint}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
    });

    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit service' }))) as
        | DepositJobResult
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit failed: HTTP ${res.status}`);
    }

    return body as DepositJobResult;
}

export async function fetchDepositSession(
    sessionId: string,
    endpoint = getRelayerUrl(),
): Promise<DepositSessionSnapshot> {
    const res = await fetch(`${endpoint}/deposit/session/${encodeURIComponent(sessionId)}`);
    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit session endpoint' }))) as
        | DepositSessionSnapshot
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit session lookup failed: HTTP ${res.status}`);
    }

    return body as DepositSessionSnapshot;
}

export async function fetchLatestDepositPool(
    denomination: number,
    endpoint = getRelayerUrl(),
): Promise<DepositSessionSnapshot> {
    const res = await fetch(`${endpoint}/deposit/pools/latest/${denomination}`);
    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit pool endpoint' }))) as
        | DepositSessionSnapshot
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit pool lookup failed: HTTP ${res.status}`);
    }

    return body as DepositSessionSnapshot;
}

export async function fetchDepositPools(
    endpoint = getRelayerUrl(),
): Promise<DepositSessionSnapshot[]> {
    const res = await fetch(`${endpoint}/deposit/pools`);
    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit pools endpoint' }))) as
        | DepositSessionSnapshot[]
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit pools lookup failed: HTTP ${res.status}`);
    }

    return body as DepositSessionSnapshot[];
}

/**
 * Poll the relayer until the withdrawal is broadcast or fails.
 *
 * Resolves with the on-chain tx hash on success.
 * Rejects on failure or timeout.
 */
export function pollRelayStatus(
    jobId:    string,
    endpoint = getRelayerUrl(),
    options  = { intervalMs: 2000, timeoutMs: 90_000 },
): Promise<string> {
    const deadline = Date.now() + options.timeoutMs;

    return new Promise((resolve, reject) => {
        const tick = async () => {
            if (Date.now() > deadline) {
                reject(new Error('Relay timed out after 90 s. Check the relayer status manually.'));
                return;
            }

            try {
                const res  = await fetch(`${endpoint}/relay/${jobId}`);
                const job  = (await res.json()) as RelayJobResult;

                if (job.status === 'broadcast' && job.txHash) {
                    resolve(job.txHash);
                } else if (job.status === 'failed') {
                    reject(new Error(job.error ?? 'Relayer failed to broadcast the transaction.'));
                } else {
                    // still 'queued' — poll again
                    setTimeout(() => void tick(), options.intervalMs);
                }
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        };

        void tick();
    });
}
