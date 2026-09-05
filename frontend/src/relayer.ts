/**
 * Relayer client for the CKB Privacy Mixer frontend.
 *
 * Instead of broadcasting a withdrawal via the user's JoyID wallet (which
 * leaks their identity through the transaction fee), the user submits their
 * ZK proof to a Relayer. The Relayer pays the CKB gas fee and broadcasts
 * the transaction, then deducts a small service fee from the withdrawal amount.
 *
 * The relayer CANNOT steal funds — the ZK proof constrains the output
 * The relayer CANNOT steal funds — the ZK proof constrains the output
 * destination on-chain, enforced by the `zk-membership-type` contract.
 */
import { initWaku, publishWakuMessage, subscribeToWakuMessages } from 'mixer-sdk/legacy';
import type { LightNode } from '@waku/sdk';

let wakuNode: LightNode | null = null;
const wakuJobs = new Map<string, RelayJobResult>();

export async function getWaku(): Promise<LightNode> {
    if (!wakuNode) {
        wakuNode = await initWaku();
        
        // Listen for results globally
        await subscribeToWakuMessages(wakuNode, 'withdrawal_result', (payload: any) => {
            if (payload.jobId && wakuJobs.has(payload.jobId)) {
                wakuJobs.set(payload.jobId, {
                    jobId: payload.jobId,
                    status: payload.status,
                    txHash: payload.txHash,
                    error: payload.error,
                });
            }
        });
    }
    return wakuNode!;
}


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
    status: 'pending' | 'finalized';
    note?: unknown;
    mintTxHash: string;
    stealthArgs: string;
    sessionId: string;
    inputOutPoint: string;
    participantId?: string;
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

export interface DepositParticipantSnapshot {
    participantId: string;
    walletAddress: string;
    stealthOutputAddress: string;
    status: 'pending' | 'minted' | 'registered' | 'finalized' | 'cancelled';
    inputOutPoint?: string;
    depositTxHash?: string;
    finalTxHash?: string;
    finalOutputIndex?: number;
    signaturePayload?: string;
    noteCreatedAt?: number;
}

export interface DepositRecoveryResult {
    found: boolean;
    status: 'not_found' | 'pending' | 'minted' | 'registered' | 'finalized' | 'open' | 'ready' | 'finalizing' | 'complete' | 'failed' | 'cancelled';
    sessionId?: string;
    participantId?: string;
    walletAddress?: string;
    stealthOutputAddress?: string;
    inputOutPoint?: string;
    depositTxHash?: string;
    finalTxHash?: string;
    blindingFactor?: string;
    noteCreatedAt?: number;
    finalOutputIndex?: number;
    pool?: DepositSessionSnapshot;
    note?: unknown;
}

function cleanEndpoint(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

function readEndpointEnv(name: string): string | undefined {
    const value = (import.meta as any).env?.[name];
    return typeof value === 'string' && value.trim() ? cleanEndpoint(value) : undefined;
}

/** Read the relayer URL from Vite env, defaulting to localhost only for dev. */
export function getRelayerUrl(): string {
    const endpoint = readEndpointEnv('VITE_RELAYER_URL');
    if (endpoint) return endpoint;

    if ((import.meta as any).env?.PROD) {
        throw new Error('Missing VITE_RELAYER_URL. Set it to the public Railway relayer URL and redeploy the frontend.');
    }

    return 'http://localhost:4000';
}

export function getCoordinatorUrl(endpoint = getRelayerUrl()): string {
    const explicit = readEndpointEnv('VITE_COORDINATOR_URL');
    if (explicit) return explicit;

    return endpoint.replace(':4000', ':4001');
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
    const useWaku = (import.meta as any).env?.VITE_USE_WAKU === 'true';

    if (useWaku) {
        const waku = await getWaku();
        const jobId = `waku-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        wakuJobs.set(jobId, { jobId, status: 'queued' });
        
        await publishWakuMessage(waku, 'withdrawal_request', { 
            nullifierHex, 
            transaction,
            // Include jobId so the relayer can mirror it in the result
            jobId 
        });
        
        return wakuJobs.get(jobId)!;
    }

    const res = await fetch(`${endpoint}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nullifierHex,
            transaction,
        }, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
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
    zkCommitment: string,
    noteCreatedAt: number,
    endpoint = getRelayerUrl(),
): Promise<DepositJobResult> {
    const res = await fetch(`${endpoint}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, zkCommitment, noteCreatedAt }),
    });

    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit service' }))) as
        | DepositJobResult
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit failed: HTTP ${res.status}`);
    }

    return body as DepositJobResult;
}

export async function recoverDepositByCommitment(
    zkCommitment: string,
    endpoint = getRelayerUrl(),
): Promise<DepositRecoveryResult> {
    const res = await fetch(`${endpoint}/deposit/recovery/${encodeURIComponent(zkCommitment)}`);
    const body = (await res.json().catch(() => ({ error: 'Empty response from deposit recovery endpoint' }))) as
        | DepositRecoveryResult
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Deposit recovery failed: HTTP ${res.status}`);
    }

    return body as DepositRecoveryResult;
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

export async function fetchFinalizedDepositNote(
    poolId: string,
    participantId: string,
    endpoint = getRelayerUrl(),
): Promise<{
    status: 'pending' | 'open' | 'ready' | 'finalizing' | 'complete' | 'failed' | 'finalized';
    note?: unknown;
}> {
    const res = await fetch(`${endpoint}/deposit/pools/${encodeURIComponent(poolId)}/participants/${encodeURIComponent(participantId)}/note`);
    const body = (await res.json().catch(() => ({ error: 'Empty response from finalized deposit note endpoint' }))) as
        | { status: 'pending' | 'open' | 'ready' | 'finalizing' | 'complete' | 'failed' | 'finalized'; note?: unknown }
        | { error: string };

    if (!res.ok) {
        throw new Error(('error' in body ? body.error : null) ?? `Finalized deposit note lookup failed: HTTP ${res.status}`);
    }

    return body as { status: 'pending' | 'open' | 'ready' | 'finalizing' | 'complete' | 'failed' | 'finalized'; note?: unknown };
}

export async function fetchUnsignedDepositRound(
    poolId: string,
    endpoint = getRelayerUrl(),
): Promise<{
    pool: DepositSessionSnapshot;
    participants: Array<{
        participantId: string;
        walletAddress: string;
        inputOutPoint: string;
        stealthOutputAddress: string;
    }>;
    rawTransaction: any;
    outputIndexByParticipantId: Record<string, number>;
    txHash: string;
}> {
    const res = await fetch(`${getCoordinatorUrl(endpoint)}/deposit/pools/${encodeURIComponent(poolId)}/unsigned-tx`);
    const body = await res.json().catch(() => ({ error: 'Empty response from unsigned deposit round endpoint' }));
    if (!res.ok) {
        throw new Error((body as any)?.error ?? `Unsigned deposit round lookup failed: HTTP ${res.status}`);
    }
    return body as any;
}

export async function fetchDepositParticipantState(
    poolId: string,
    participantId: string,
    endpoint = getRelayerUrl(),
): Promise<DepositParticipantSnapshot> {
    const res = await fetch(`${getCoordinatorUrl(endpoint)}/deposit/pools/${encodeURIComponent(poolId)}/participants/${encodeURIComponent(participantId)}`);
    const body = await res.json().catch(() => ({ error: 'Empty response from deposit participant endpoint' }));
    if (!res.ok) {
        throw new Error((body as any)?.error ?? `Deposit participant lookup failed: HTTP ${res.status}`);
    }
    return body as DepositParticipantSnapshot;
}

export async function submitDepositSignature(
    poolId: string,
    participantId: string,
    signaturePayload: string,
    endpoint = getRelayerUrl(),
): Promise<void> {
    const res = await fetch(`${getCoordinatorUrl(endpoint)}/deposit/pools/${encodeURIComponent(poolId)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, signaturePayload }),
    });
    const body = await res.json().catch(() => ({ error: 'Empty response from deposit sign endpoint' }));
    if (!res.ok) {
        throw new Error((body as any)?.error ?? `Deposit signature submission failed: HTTP ${res.status}`);
    }
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
