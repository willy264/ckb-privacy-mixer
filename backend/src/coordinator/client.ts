import '../env.js';

export interface CoordinatorDepositPoolSummary {
    sessionId: string;
    denomination: number;
    commitments: string[];
    size: number;
    participantCount: number;
    pendingCount: number;
    registeredCount: number;
    updatedAt: number;
    status: 'open' | 'ready' | 'finalizing' | 'complete' | 'failed';
    targetSize: number;
    finalizedAt?: number;
}

interface CoordinatorPreparedParticipant {
    participantId: string;
    walletAddress: string;
    stealthOutputAddress: string;
    status: 'pending' | 'registered' | 'cancelled';
}

function getCoordinatorUrl() {
    const explicit = process.env.COORDINATOR_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/+$/, '');
    }

    const port = process.env.COORDINATOR_PORT?.trim() || '4001';
    return `http://127.0.0.1:${port}`;
}

async function parseJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({ error: 'Empty coordinator response' }));
    if (!response.ok) {
        throw new Error((body as any)?.error ?? `Coordinator request failed: HTTP ${response.status}`);
    }
    return body as T;
}

export async function prepareCoordinatorDepositParticipant(payload: {
    denomination: number;
    walletAddress: string;
    stealthOutputAddress: string;
}) {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/prepare`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return parseJson<{
        pool: CoordinatorDepositPoolSummary;
        participant: CoordinatorPreparedParticipant;
    }>(response);
}

export async function registerCoordinatorDepositCommitment(
    poolId: string,
    participantId: string,
    payload: {
        commitment: string;
        blindingFactor: string;
        depositTxHash: string;
        inputOutPoint: string;
        noteCreatedAt: number;
    },
) {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/pools/${encodeURIComponent(poolId)}/participants/${encodeURIComponent(participantId)}/register`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return parseJson<{
        sessionId: string;
        commitments: string[];
        leafIndex: number;
        noteCreatedAt: number;
        pool: CoordinatorDepositPoolSummary;
    }>(response);
}

export async function cancelCoordinatorDepositParticipant(poolId: string, participantId: string, reason?: string) {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/pools/${encodeURIComponent(poolId)}/participants/${encodeURIComponent(participantId)}/cancel`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ reason }),
    });

    return parseJson<{ ok: true; pool: CoordinatorDepositPoolSummary }>(response);
}

export async function fetchCoordinatorDepositSession(sessionId: string) {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/session/${encodeURIComponent(sessionId)}`);
    return parseJson<CoordinatorDepositPoolSummary>(response);
}

export async function fetchCoordinatorDepositPools() {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/pools`);
    return parseJson<CoordinatorDepositPoolSummary[]>(response);
}

export async function fetchLatestCoordinatorDepositPool(denomination: number) {
    const response = await fetch(`${getCoordinatorUrl()}/deposit/pools/latest/${denomination}`);
    return parseJson<CoordinatorDepositPoolSummary>(response);
}
