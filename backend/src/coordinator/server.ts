import http from 'http';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import {
    findOrCreatePool,
    joinPool,
    poolSummary,
    pools,
} from './pool.js';
import { buildCoinJoinTransaction, recordSignature, broadcastCoinJoin } from './session.js';
import { logger } from '../utils/logger.js';

/**
 * WebSocket message shapes sent by the browser.
 */
interface WsJoinMessage {
    type: 'join';
    denomination: string;       // e.g. "100"
    commitment: string;         // Pedersen commitment (public)
    stealthOutputAddress: string;
}

interface WsSignMessage {
    type: 'sign';
    poolId: string;
    participantId: string;
    signature: string;          // JoyID / secp256k1 partial signature
}

type WsInboundMessage = WsJoinMessage | WsSignMessage;

/** Map of poolId → set of connected WebSocket clients in that pool. */
const poolSockets = new Map<string, Set<WebSocket>>();

function broadcastToPool(poolId: string, message: object) {
    const sockets = poolSockets.get(poolId);
    if (!sockets) return;
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    }
}

/**
 * Creates the Coordinator HTTP + WebSocket server.
 *
 * REST Endpoints (for REST polling fallback):
 *   GET  /pools                 — List all open pools
 *   GET  /pools/:poolId         — Get a single pool summary
 *   POST /pools/:poolId/join    — Join a pool (REST fallback)
 *
 * WebSocket Protocol:
 *   Client → Server: { type: 'join', denomination, commitment, stealthOutputAddress }
 *   Server → Client: { type: 'joined', poolId, participantId, pool: <summary> }
 *   Server → All:    { type: 'pool_full', poolId, pendingTxHex }      (when pool fills)
 *   Client → Server: { type: 'sign', poolId, participantId, signature }
 *   Server → All:    { type: 'broadcast', poolId, txHash }            (when all signed)
 */
export function createCoordinatorServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // ── REST: list open pools ──────────────────────────────────────────────────
    app.get('/pools', (_req: Request, res: Response) => {
        const open = [...pools.values()]
            .filter(p => p.status === 'open')
            .map(poolSummary);
        res.json(open);
    });

    // ── REST: get single pool ──────────────────────────────────────────────────
    app.get('/pools/:poolId', (req: Request, res: Response) => {
        const pool = pools.get(req.params.poolId);
        if (!pool) { res.status(404).json({ error: 'Pool not found' }); return; }
        res.json(poolSummary(pool));
    });

    // ── REST: join a pool (fallback for non-WS clients) ───────────────────────
    app.post('/pools/:poolId/join', (req: Request, res: Response, next: NextFunction) => {
        try {
            const { commitment, stealthOutputAddress } = req.body as {
                commitment: string;
                stealthOutputAddress: string;
            };
            const participantId = joinPool(req.params.poolId, commitment, stealthOutputAddress);
            res.json({ participantId });
        } catch (err) { next(err); }
    });

    // ── Error handler ──────────────────────────────────────────────────────────
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: message });
    });

    // ── Attach WebSocket server to the same HTTP server ────────────────────────
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        logger.info('[Coordinator] New WebSocket connection');
        let currentPoolId: string | null = null;
        let currentParticipantId: string | null = null;

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString()) as WsInboundMessage;

                // ── JOIN ───────────────────────────────────────────────────────
                if (msg.type === 'join') {
                    const denomination = BigInt(msg.denomination);
                    const pool = findOrCreatePool(denomination);
                    const participantId = joinPool(pool.poolId, msg.commitment, msg.stealthOutputAddress);

                    currentPoolId = pool.poolId;
                    currentParticipantId = participantId;

                    // Register this socket into the pool's broadcast group
                    if (!poolSockets.has(pool.poolId)) poolSockets.set(pool.poolId, new Set());
                    poolSockets.get(pool.poolId)!.add(ws);

                    // Confirm to the joining participant
                    ws.send(JSON.stringify({
                        type: 'joined',
                        poolId: pool.poolId,
                        participantId,
                        pool: poolSummary(pool),
                    }));

                    // If the pool is now full, build the CoinJoin tx and notify all
                    if (pool.participants.length >= pool.requiredParticipants) {
                        const txHex = buildCoinJoinTransaction(pool);
                        broadcastToPool(pool.poolId, {
                            type: 'pool_full',
                            poolId: pool.poolId,
                            pendingTxHex: txHex,
                            message: 'Pool is full. Please sign the transaction.',
                        });
                        logger.info('[Coordinator] Pool full — signing round started', {
                            poolId: pool.poolId,
                        });
                    } else {
                        // Notify everyone in the pool of the new participant count
                        broadcastToPool(pool.poolId, {
                            type: 'pool_update',
                            pool: poolSummary(pool),
                        });
                    }
                    return;
                }

                // ── SIGN ───────────────────────────────────────────────────────
                if (msg.type === 'sign') {
                    const allSigned = recordSignature(msg.poolId, msg.participantId, msg.signature);

                    if (allSigned) {
                        const pool = pools.get(msg.poolId);
                        if (pool) {
                            const txHash = await broadcastCoinJoin(
                                pool,
                                process.env.CKB_RPC_URL ?? '',
                            );
                            broadcastToPool(msg.poolId, {
                                type: 'broadcast',
                                poolId: msg.poolId,
                                txHash,
                                message: 'CoinJoin transaction successfully broadcast.',
                            });
                            // Clean up sockets for this pool
                            poolSockets.delete(msg.poolId);
                        }
                    } else {
                        // Notify pool of updated signed count
                        const pool = pools.get(msg.poolId);
                        if (pool) broadcastToPool(msg.poolId, { type: 'pool_update', pool: poolSummary(pool) });
                    }
                    return;
                }

                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));

            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger.error('[Coordinator] WS handler error', { error: message });
                ws.send(JSON.stringify({ type: 'error', message }));
            }
        });

        ws.on('close', () => {
            if (currentPoolId) {
                const sockets = poolSockets.get(currentPoolId);
                sockets?.delete(ws);
                logger.info('[Coordinator] Participant disconnected', {
                    poolId: currentPoolId,
                    participantId: currentParticipantId,
                });
            }
        });
    });

    return server;
}
