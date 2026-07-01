import { getCoordinatorUrl, getRelayerUrl, getWaku } from './relayer';
import { publishWakuMessage, subscribeToWakuMessages } from 'mixer-sdk';


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
    onBroadcast?: (poolId: string, txHash: string, sessionCommitments: string[]) => void;
    onError?: (message: string) => void;
};

export class CoordinatorClient {
    private ws: WebSocket | null = null;
    private endpoint: string;
    private wakuHandlers: CoordinatorEventHandler | null = null;
    private wakuMode = false;

    constructor(endpoint?: string) {
        this.wakuMode = (import.meta as any).env?.VITE_USE_WAKU === 'true';
        const base = endpoint ?? getRelayerUrl();
        this.endpoint = getCoordinatorUrl(base).replace(/^http/, 'ws');
    }

    async connect(handlers: CoordinatorEventHandler): Promise<void> {
        if (this.wakuMode) {
            this.wakuHandlers = handlers;
            const waku = await getWaku();
            
            await subscribeToWakuMessages(waku, 'pool_joined', (msg: any) => {
                this.wakuHandlers?.onJoined?.(msg.poolId, msg.participantId, msg.pool);
            });
            await subscribeToWakuMessages(waku, 'pool_update', (msg: any) => {
                this.wakuHandlers?.onPoolUpdate?.(msg.pool);
            });
            await subscribeToWakuMessages(waku, 'pool_full', (msg: any) => {
                this.wakuHandlers?.onPoolFull?.(msg.poolId, msg.pendingTxHex);
            });
            await subscribeToWakuMessages(waku, 'coinjoin_broadcast', (msg: any) => {
                this.wakuHandlers?.onBroadcast?.(msg.poolId, msg.txHash, msg.sessionCommitments || []);
            });
            await subscribeToWakuMessages(waku, 'coinjoin_error', (msg: any) => {
                this.wakuHandlers?.onError?.(msg.message);
            });
            
            // Connected immediately for Waku since we await getWaku()
            return;
        }

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.endpoint);

            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

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
                            handlers.onBroadcast?.(msg.poolId, msg.txHash, msg.sessionCommitments || []);
                            break;
                        case 'error':
                            handlers.onError?.(msg.message);
                            break;
                    }
                } catch (e) {
                    console.error('Failed to parse coordinator message', e);
                }
            };
        });
    }

    async joinPool(denomination: string, commitment: string, stealthOutputAddress: string, walletAddress: string) {
        if (this.wakuMode) {
            const waku = await getWaku();
            await publishWakuMessage(waku, 'deposit_intent', {
                denomination,
                commitment,
                stealthOutputAddress,
                walletAddress,
            });
            return;
        }

        this.send({
            type: 'join',
            denomination,
            commitment,
            stealthOutputAddress,
            walletAddress,
        });
    }

    async signTransaction(poolId: string, participantId: string, signature: string) {
        if (this.wakuMode) {
            const waku = await getWaku();
            await publishWakuMessage(waku, 'coinjoin_signature', {
                poolId,
                participantId,
                signature,
            });
            return;
        }

        this.send({
            type: 'sign',
            poolId,
            participantId,
            signature,
        });
    }

    disconnect() {
        if (this.wakuMode) {
            this.wakuHandlers = null;
        }
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

import { deriveCommitment, randomBlindingFactor } from '../../mixer-sdk/dist/index.js';
import type { DepositResult } from '../../mixer-sdk/dist/index.js';
import { signTransactionWithJoyId } from './joyid';

/**
 * Drop-in replacement for `mixer-sdk`'s local `joinMix`, but routes over
 * real WebSockets to the off-chain Coordinator.
 */
export async function joinLiveMix(params: {
    denomination: bigint;
    stealthOutputAddress: string;
    walletAddress: string;
    onProgress?: (step: number) => void;
}): Promise<DepositResult> {
    const { denomination, stealthOutputAddress, walletAddress, onProgress } = params;
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
            onPoolFull: async (poolId, pendingTxHex) => {
                onProgress?.(95);
                try {
                    // The pool is full and the tx is built. We must sign it with JoyID.
                    const hexPart = pendingTxHex.slice(2);
                    let rawTxStr = '';
                    for (let i = 0; i < hexPart.length; i += 2) {
                        rawTxStr += String.fromCharCode(parseInt(hexPart.substr(i, 2), 16));
                    }
                    const txToSign = JSON.parse(decodeURIComponent(escape(rawTxStr)));
                    
                    // Inject JoyID CellDep into transaction structure
                    const unsignedTransaction = txToSign as any;
                    
                    // We prompt JoyID to sign our specific input. We don't have witnessIndexes
                    // but we can just sign the whole tx. For a real CoinJoin, each participant
                    // signs their own input. JoyID's signRawTransaction signs the entire message.
                    const signedTx = await signTransactionWithJoyId(unsignedTransaction);
                    
                    // Send the full array of witnesses and cell deps so the coordinator can merge them
                    const payload = {
                        witnesses: (signedTx as any).witnesses || [],
                        cellDeps: (signedTx as any).cellDeps || [],
                    };
                    
                    client.signTransaction(poolId, currentParticipantId, JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
                } catch (error) {
                    client.disconnect();
                    reject(new Error(`JoyID signing failed: ${String(error)}`));
                }
            },
            onBroadcast: async (poolId, txHash, sessionCommitments) => {
                onProgress?.(100);
                client.disconnect();

                const inputOutPoint = '0x0_0x0';

                // Re-derive the actual commitment using the real poolId
                const finalCommitment = await deriveCommitment(blindingFactor, poolId);
                
                // If the server didn't provide commitments (e.g. older backend), fallback
                const actualCommitments = sessionCommitments && sessionCommitments.length > 0
                    ? sessionCommitments
                    : [finalCommitment];

                const note = {
                    version: 2 as const,
                    sessionId: poolId,
                    inputOutPoint,
                    blindingFactor,
                    stealthOutputAddress,
                    createdAt: Date.now(),
                    commitment: finalCommitment,
                    sessionCommitments: actualCommitments,
                    leafIndex: actualCommitments.indexOf(finalCommitment) >= 0 ? actualCommitments.indexOf(finalCommitment) : 0,
                    depositTxHash: txHash,
                    runtimeMode: 'live' as const,
                    proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1' as const,
                };

                resolve({
                    sessionId: poolId,
                    participantId: currentParticipantId,
                    status: 'confirmed',
                    confirmedTxHash: txHash,
                    participantCommitments: actualCommitments,
                    stealthOutputAddress,
                    leafIndex: note.leafIndex,
                    inputOutPoint: '0x0_0x0', // Mock outpoint for compatibility
                    note,
                    session: {
                        sessionId: poolId,
                        denomination,
                        participantCount: actualCommitments.length,
                        requiredParticipants: actualCommitments.length,
                        participantCommitments: actualCommitments,
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
            client.joinPool(denomination.toString(), initialCommitment, stealthOutputAddress, walletAddress);
        }).catch(reject);
    });
}
