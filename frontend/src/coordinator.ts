import { getRelayerUrl } from './relayer';

export interface CoordinatorPoolSummary {
    poolId: string;
    denomination: string;
    participantCount: number;
    requiredParticipants: number;
    status: 'open' | 'building' | 'broadcasting' | 'complete' | 'failed';
    isFull: boolean;
}

export type CoordinatorEventHandler = {
    onJoined?: (poolId: string, participantId: string, pool: CoordinatorPoolSummary) => void;
    onPoolUpdate?: (pool: CoordinatorPoolSummary) => void;
    onPoolFull?: (poolId: string, pendingTxHex: string) => void;
    onBroadcast?: (poolId: string, txHash: string) => void;
    onError?: (message: string) => void;
};

export class CoordinatorClient {
    private ws: WebSocket | null = null;
    private endpoint: string;

    constructor(endpoint?: string) {
        // Derive WS url from HTTP relayer url
        const base = endpoint ?? getRelayerUrl();
        // The backend coordinator listens on port 4001, relayer on 4000
        // We'll just replace 4000 with 4001 and http with ws
        this.endpoint = base.replace('http', 'ws').replace('4000', '4001');
    }

    connect(handlers: CoordinatorEventHandler): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.endpoint);

            this.ws.onopen = () => {
                resolve();
            };

            this.ws.onerror = () => {
                reject(new Error('WebSocket connection failed'));
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    switch (msg.type) {
                        case 'joined':
                            handlers.onJoined?.(msg.poolId, msg.participantId, msg.pool);
                            break;
                        case 'pool_update':
                            handlers.onPoolUpdate?.(msg.pool);
                            break;
                        case 'pool_full':
                            handlers.onPoolFull?.(msg.poolId, msg.pendingTxHex);
                            break;
                        case 'broadcast':
                            handlers.onBroadcast?.(msg.poolId, msg.txHash);
                            break;
                        case 'error':
                            handlers.onError?.(msg.message);
                            break;
                        default:
                            console.warn('Unknown coordinator message:', msg);
                    }
                } catch (e) {
                    console.error('Failed to parse coordinator message', e);
                }
            };
        });
    }

    joinPool(denomination: string, commitment: string, stealthOutputAddress: string) {
        this.send({
            type: 'join',
            denomination,
            commitment,
            stealthOutputAddress,
        });
    }

    signTransaction(poolId: string, participantId: string, signature: string) {
        this.send({
            type: 'sign',
            poolId,
            participantId,
            signature,
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private send(payload: object) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected');
        }
        this.ws.send(JSON.stringify(payload));
    }
}

import { deriveCommitment, randomBlindingFactor } from 'mixer-sdk';
import type { DepositResult } from 'mixer-sdk';

/**
 * Drop-in replacement for `mixer-sdk`'s local `joinMix`, but routes over
 * real WebSockets to the off-chain Coordinator.
 */
export async function joinLiveMix(params: {
    denomination: bigint;
    stealthOutputAddress: string;
    inputOutPoint: string;
    onProgress?: (step: number) => void;
}): Promise<DepositResult> {
    const { denomination, stealthOutputAddress, inputOutPoint, onProgress } = params;
    const blindingFactor = randomBlindingFactor();
    
    // We don't have the sessionId yet, so we mock the commitment derivation for the demo.
    // In production, the client would wait for the poolId, derive commitment, and send it.
    // For this preview integration, we just use a random dummy commitment to start.
    const initialCommitment = await deriveCommitment(blindingFactor, 'temp-session');

    const client = new CoordinatorClient();

    return new Promise((resolve, reject) => {
        let currentParticipantId = '';

        client.connect({
            onJoined: (_poolId, participantId, _pool) => {
                currentParticipantId = participantId;
                onProgress?.(30);
            },
            onPoolUpdate: (pool) => {
                const percent = Math.min(90, 30 + (pool.participantCount / pool.requiredParticipants) * 60);
                onProgress?.(percent);
            },
            onPoolFull: (poolId, _pendingTxHex) => {
                onProgress?.(95);
                // The pool is full and the tx is built. We must sign it.
                // In production, this would prompt JoyID. For the demo, we mock it.
                const mockSignature = `0x_mock_sig_${Date.now()}`;
                client.signTransaction(poolId, currentParticipantId, mockSignature);
            },
            onBroadcast: async (poolId, txHash) => {
                onProgress?.(100);
                client.disconnect();

                // Re-derive the actual commitment using the real poolId
                const finalCommitment = await deriveCommitment(blindingFactor, poolId);

                const note = {
                    version: 2 as const,
                    sessionId: poolId,
                    inputOutPoint,
                    blindingFactor,
                    stealthOutputAddress,
                    createdAt: Date.now(),
                    commitment: finalCommitment,
                    sessionCommitments: [finalCommitment], // mocked for now, would come from server
                    leafIndex: 0,
                    depositTxHash: txHash,
                    runtimeMode: 'live' as const,
                    proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1' as const,
                };

                resolve({
                    sessionId: poolId,
                    participantId: currentParticipantId,
                    status: 'confirmed',
                    confirmedTxHash: txHash,
                    participantCommitments: [finalCommitment],
                    stealthOutputAddress,
                    leafIndex: 0,
                    inputOutPoint,
                    note,
                    session: {
                        sessionId: poolId,
                        denomination,
                        participantCount: 1,
                        requiredParticipants: 1,
                        participantCommitments: [finalCommitment],
                        participantOutputs: [stealthOutputAddress],
                        status: 'COMPLETED',
                    },
                });
            },
            onError: (msg) => {
                client.disconnect();
                reject(new Error(msg));
            }
        }).then(() => {
            onProgress?.(10);
            client.joinPool(denomination.toString(), initialCommitment, stealthOutputAddress);
        }).catch(reject);
    });
}
