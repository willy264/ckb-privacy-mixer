import '../env.js';
import http from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
    findOrCreatePool,
    joinPool,
    poolSummary,
    pools,
} from './pool.js';
import {
    cancelDepositParticipant,
    attachDepositParticipantSignature,
    getDepositPool,
    getLatestDepositPool,
    listDepositPools,
    findDepositParticipantByZkCommitment,
    prepareDepositParticipant,
    registerDepositCommitment,
    summarizeDepositPool,
} from './deposit-pool.js';
import { buildUnsignedDepositFinalization, finalizeSignedDepositRound } from './deposit-finalizer.js';
import { buildCoinJoinTransaction, recordSignature, broadcastCoinJoin } from './session.js';
import { logger } from '../utils/logger.js';
import { initWaku, subscribeToWakuMessages, publishWakuMessage } from 'mixer-sdk';

interface WsJoinMessage {
    type: 'join';
    denomination: string;
    commitment: string;
    stealthOutputAddress: string;
    walletAddress: string;
}

interface WsSignMessage {
    type: 'sign';
    poolId: string;
    participantId: string;
    signature: string;
}

type WsInboundMessage = WsJoinMessage | WsSignMessage;

const app = express();
app.set('trust proxy', 1);

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

const joinRequestSchema = z.object({
    commitment: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Must be a valid hex string'),
    stealthOutputAddress: z.string().regex(/^0x[0-9a-fA-F]{106}$/, 'Must be a valid 53-byte hex string starting with 0x'),
    walletAddress: z.string(),
}).refine((data) => {
    return /^ck[bt]1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{42,}$/i.test(data.walletAddress);
}, { message: 'Invalid wallet address encoding', path: ['walletAddress'] });

const prepareDepositSchema = z.object({
    denomination: z.coerce.number().int().positive(),
    walletAddress: z.string(),
    stealthOutputAddress: z.string().regex(/^0x[0-9a-fA-F]{106}$/, 'Must be a valid 53-byte stealth args hex'),
}).refine((data) => {
    return /^ck[bt]1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{42,}$/i.test(data.walletAddress);
}, { message: 'Invalid wallet address encoding', path: ['walletAddress'] });

const registerDepositSchema = z.object({
    commitment: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Must be a valid hex string'),
    blindingFactor: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 32-byte hex string'),
    zkCommitment: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Must be a valid hex string'),
    depositTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a valid tx hash'),
    inputOutPoint: z.string().regex(/^0x[0-9a-fA-F]{64}:0x[0-9a-fA-F]+$/, 'Must be a txHash:index outpoint'),
    noteCreatedAt: z.coerce.number().int().positive(),
});

const signDepositSchema = z.object({
    participantId: z.string().uuid(),
    signaturePayload: z.string(),
});

const zkCommitmentParamSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 32-byte hex commitment');

export function createCoordinatorServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        message: { error: 'Too many requests, please try again later.' },
    });
    app.use(apiLimiter);

    app.get('/pools', (_req: Request, res: Response) => {
        const open = [...pools.values()]
            .filter(pool => pool.status === 'open')
            .map(poolSummary);
        res.json(open);
    });

    app.get('/pools/:poolId', (req: Request, res: Response) => {
        const pool = pools.get(req.params.poolId);
        if (!pool) {
            res.status(404).json({ error: 'Pool not found' });
            return;
        }
        res.json(poolSummary(pool));
    });

    app.get('/deposit/pools', async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const depositPools = await listDepositPools();
            res.json(depositPools.map(summarizeDepositPool));
        } catch (err) {
            next(err);
        }
    });

    app.get('/deposit/pools/latest/:denomination', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const denomination = Number.parseInt(req.params.denomination, 10);
            if (!Number.isFinite(denomination)) {
                res.status(400).json({ error: 'Invalid denomination' });
                return;
            }

            const pool = await getLatestDepositPool(BigInt(denomination));
            if (!pool) {
                res.status(404).json({ error: 'No deposit pool found for this denomination' });
                return;
            }

            res.json(summarizeDepositPool(pool));
        } catch (err) {
            next(err);
        }
    });

    app.get('/deposit/session/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const pool = await getDepositPool(req.params.sessionId);
            if (!pool) {
                res.status(404).json({ error: 'Deposit session not found' });
                return;
            }

            res.json(summarizeDepositPool(pool));
        } catch (err) {
            next(err);
        }
    });

    app.get('/deposit/recovery/:zkCommitment', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const zkCommitment = zkCommitmentParamSchema.parse(req.params.zkCommitment);
            const match = await findDepositParticipantByZkCommitment(zkCommitment);
            if (!match) {
                res.json({ found: false });
                return;
            }

            res.json({
                found: true,
                sessionId: match.pool.poolId,
                participantId: match.participant.participantId,
                walletAddress: match.participant.walletAddress,
                stealthOutputAddress: match.participant.stealthOutputAddress,
                status: match.participant.status,
                inputOutPoint: match.participant.inputOutPoint,
                depositTxHash: match.participant.depositTxHash,
                finalTxHash: match.participant.finalTxHash,
                blindingFactor: match.participant.blindingFactor,
                noteCreatedAt: match.participant.noteCreatedAt,
                finalOutputIndex: match.participant.finalOutputIndex,
                pool: summarizeDepositPool(match.pool),
            });
        } catch (err) {
            next(err);
        }
    });

    app.post('/deposit/prepare', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = prepareDepositSchema.parse(req.body);
            const { pool, participant } = await prepareDepositParticipant(
                BigInt(parsed.denomination),
                parsed.walletAddress,
                parsed.stealthOutputAddress,
            );

            res.status(201).json({
                pool: summarizeDepositPool(pool),
                participant: {
                    participantId: participant.participantId,
                    walletAddress: participant.walletAddress,
                    stealthOutputAddress: participant.stealthOutputAddress,
                    status: participant.status,
                },
            });
        } catch (err) {
            next(err);
        }
    });

    app.post('/deposit/pools/:poolId/participants/:participantId/register', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = registerDepositSchema.parse(req.body);
            const membership = await registerDepositCommitment(req.params.poolId, req.params.participantId, parsed);
            const pool = await getDepositPool(req.params.poolId);
            if (!pool) {
                res.status(404).json({ error: 'Deposit pool not found after registration' });
                return;
            }

            res.json({
                sessionId: membership.poolId,
                commitments: membership.commitments,
                leafIndex: membership.leafIndex,
                noteCreatedAt: membership.noteCreatedAt,
                pool: summarizeDepositPool(pool),
            });
        } catch (err) {
            next(err);
        }
    });

    app.post('/deposit/pools/:poolId/participants/:participantId/cancel', async (req: Request, res: Response, next: NextFunction) => {
        try {
            await cancelDepositParticipant(
                req.params.poolId,
                req.params.participantId,
                typeof req.body?.reason === 'string' ? req.body.reason : undefined,
            );
            const pool = await getDepositPool(req.params.poolId);
            if (!pool) {
                res.status(404).json({ error: 'Deposit pool not found' });
                return;
            }

            res.json({ ok: true, pool: summarizeDepositPool(pool) });
        } catch (err) {
            next(err);
        }
    });

    app.get('/deposit/pools/:poolId/participants/:participantId', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const pool = await getDepositPool(req.params.poolId);
            if (!pool) {
                res.status(404).json({ error: 'Deposit pool not found' });
                return;
            }

            const participant = pool.participants.find(entry => entry.participantId === req.params.participantId);
            if (!participant) {
                res.status(404).json({ error: 'Deposit participant not found' });
                return;
            }

            res.json({
                participantId: participant.participantId,
                walletAddress: participant.walletAddress,
                stealthOutputAddress: participant.stealthOutputAddress,
                status: participant.status,
                inputOutPoint: participant.inputOutPoint,
                depositTxHash: participant.depositTxHash,
                finalTxHash: participant.finalTxHash,
                blindingFactor: participant.blindingFactor,
                noteCreatedAt: participant.noteCreatedAt,
                finalOutputIndex: participant.finalOutputIndex,
            });
        } catch (err) {
            next(err);
        }
    });

    app.get('/deposit/pools/:poolId/unsigned-tx', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const round = await buildUnsignedDepositFinalization(req.params.poolId);
            res.json(round);
        } catch (err) {
            next(err);
        }
    });

    app.post('/deposit/pools/:poolId/sign', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = signDepositSchema.parse(req.body);
            let pool = await attachDepositParticipantSignature(req.params.poolId, parsed.participantId, parsed.signaturePayload);
            if (!pool) {
                res.status(404).json({ error: 'Deposit pool not found' });
                return;
            }

            const registeredCount = pool.participants.filter(entry => entry.status === 'registered').length;
            if (registeredCount >= pool.targetParticipants) {
                try {
                    const finalized = await finalizeSignedDepositRound(req.params.poolId, {});
                    pool = await getDepositPool(req.params.poolId) ?? pool;
                    res.json({
                        ok: true,
                        finalized: true,
                        txHash: finalized.txHash,
                        pool: summarizeDepositPool(pool),
                    });
                    return;
                } catch (error) {
                    logger.error('[Coordinator] Deposit finalization failed', { poolId: req.params.poolId, error: String(error) });
                    throw error;
                }
            }

            res.json({
                ok: true,
                finalized: false,
                pool: summarizeDepositPool(pool),
            });
        } catch (err) {
            next(err);
        }
    });

    app.post('/deposit/pools/:poolId/finalize', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await finalizeSignedDepositRound(req.params.poolId, {});
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    app.post('/pools/:poolId/join', (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = joinRequestSchema.parse(req.body);
            const participantId = joinPool(
                req.params.poolId,
                parsed.commitment,
                parsed.stealthOutputAddress,
                parsed.walletAddress,
            );
            res.json({ participantId });
        } catch (err) {
            next(err);
        }
    });

    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[Coordinator] Unhandled error', { error: message });
        res.status(500).json({ error: message });
    });

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        logger.info('[Coordinator] New WebSocket connection');
        let currentPoolId: string | null = null;
        let currentParticipantId: string | null = null;

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString()) as WsInboundMessage;

                if (msg.type === 'join') {
                    const parsed = joinRequestSchema.parse({
                        commitment: msg.commitment,
                        stealthOutputAddress: msg.stealthOutputAddress,
                        walletAddress: msg.walletAddress,
                    });

                    const denomination = BigInt(msg.denomination);
                    const minParticipants = parseInt(process.env.COORDINATOR_MIN_PARTICIPANTS ?? '5', 10);
                    const pool = findOrCreatePool(denomination, minParticipants);
                    const participantId = joinPool(pool.poolId, parsed.commitment, parsed.stealthOutputAddress, parsed.walletAddress);

                    currentPoolId = pool.poolId;
                    currentParticipantId = participantId;

                    if (!poolSockets.has(pool.poolId)) poolSockets.set(pool.poolId, new Set());
                    poolSockets.get(pool.poolId)!.add(ws);

                    ws.send(JSON.stringify({
                        type: 'joined',
                        poolId: pool.poolId,
                        participantId,
                        pool: poolSummary(pool),
                    }));

                    if (pool.participants.length >= pool.requiredParticipants) {
                        const txHex = await buildCoinJoinTransaction(pool);
                        broadcastToPool(pool.poolId, {
                            type: 'pool_full',
                            poolId: pool.poolId,
                            pendingTxHex: txHex,
                            message: 'Pool is full. Please sign the transaction.',
                        });
                        logger.info('[Coordinator] Pool full - signing round started', {
                            poolId: pool.poolId,
                        });
                    } else {
                        broadcastToPool(pool.poolId, {
                            type: 'pool_update',
                            pool: poolSummary(pool),
                        });
                    }
                    return;
                }

                if (msg.type === 'sign') {
                    const allSigned = recordSignature(msg.poolId, msg.participantId, msg.signature);

                    if (allSigned) {
                        const pool = pools.get(msg.poolId);
                        if (pool) {
                            broadcastCoinJoin(pool, process.env.CKB_RPC_URL ?? '')
                                .then((txHash) => {
                                    const sessionCommitments = pool.participants.map(participant => participant.commitment);
                                    broadcastToPool(msg.poolId, {
                                        type: 'broadcast',
                                        poolId: msg.poolId,
                                        txHash,
                                        sessionCommitments,
                                        message: 'CoinJoin transaction successfully broadcast.',
                                    });
                                    poolSockets.delete(msg.poolId);
                                })
                                .catch((err) => {
                                    logger.error('[Coordinator] Broadcast error', { error: err.message });
                                    broadcastToPool(msg.poolId, {
                                        type: 'error',
                                        message: `Transaction broadcast failed: ${err.message}`,
                                    });
                                });
                        }
                    } else {
                        const pool = pools.get(msg.poolId);
                        if (pool) {
                            broadcastToPool(msg.poolId, {
                                type: 'pool_update',
                                pool: poolSummary(pool),
                            });
                        }
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

/**
 * Start a Waku P2P listener for CoinJoin coordination.
 *
 * Users broadcast deposit intents over Waku. The coordinator aggregates
 * them into pools, builds the CoinJoin transaction, and broadcasts the
 * unsigned transaction back for signing — all over the P2P network.
 */
export async function startWakuCoordinatorListener() {
    logger.info('[Coordinator/Waku] Initializing Waku light node...');
    const waku = await initWaku();
    logger.info('[Coordinator/Waku] Connected to Waku network. Listening for deposit_intent messages.');

    await subscribeToWakuMessages(waku, 'deposit_intent', async (payload: any) => {
        try {
            const parsed = joinRequestSchema.parse({
                commitment: payload.commitment,
                stealthOutputAddress: payload.stealthOutputAddress,
                walletAddress: payload.walletAddress,
            });

            const denomination = BigInt(payload.denomination);
            const minParticipants = parseInt(process.env.COORDINATOR_MIN_PARTICIPANTS ?? '5', 10);
            const pool = findOrCreatePool(denomination, minParticipants);
            const participantId = joinPool(pool.poolId, parsed.commitment, parsed.stealthOutputAddress, parsed.walletAddress);

            logger.info('[Coordinator/Waku] Participant joined via P2P', {
                poolId: pool.poolId,
                participantId,
            });

            // Broadcast join confirmation
            await publishWakuMessage(waku, 'pool_joined', {
                poolId: pool.poolId,
                participantId,
                pool: poolSummary(pool),
            });

            // Check if pool is full
            if (pool.participants.length >= pool.requiredParticipants) {
                const txHex = await buildCoinJoinTransaction(pool);
                await publishWakuMessage(waku, 'pool_full', {
                    poolId: pool.poolId,
                    pendingTxHex: txHex,
                    message: 'Pool is full. Please sign the transaction.',
                });
                logger.info('[Coordinator/Waku] Pool full — signing round started', {
                    poolId: pool.poolId,
                });
            } else {
                await publishWakuMessage(waku, 'pool_update', {
                    pool: poolSummary(pool),
                });
            }
        } catch (err) {
            logger.error('[Coordinator/Waku] Failed to process deposit intent', {
                error: String(err),
            });
        }
    });

    // Listen for signatures submitted over Waku
    await subscribeToWakuMessages(waku, 'coinjoin_signature', async (payload: any) => {
        try {
            const allSigned = recordSignature(payload.poolId, payload.participantId, payload.signature);

            if (allSigned) {
                const pool = pools.get(payload.poolId);
                if (pool) {
                    try {
                        const txHash = await broadcastCoinJoin(pool, process.env.CKB_RPC_URL ?? '');
                        const sessionCommitments = pool.participants.map(p => p.commitment);
                        await publishWakuMessage(waku, 'coinjoin_broadcast', {
                            poolId: payload.poolId,
                            txHash,
                            sessionCommitments,
                            message: 'CoinJoin transaction successfully broadcast.',
                        });
                    } catch (broadcastErr) {
                        logger.error('[Coordinator/Waku] Broadcast error', { error: String(broadcastErr) });
                        await publishWakuMessage(waku, 'coinjoin_error', {
                            poolId: payload.poolId,
                            message: `Transaction broadcast failed: ${String(broadcastErr)}`,
                        });
                    }
                }
            } else {
                const pool = pools.get(payload.poolId);
                if (pool) {
                    await publishWakuMessage(waku, 'pool_update', {
                        pool: poolSummary(pool),
                    });
                }
            }
        } catch (err) {
            logger.error('[Coordinator/Waku] Failed to process signature', {
                error: String(err),
            });
        }
    });

    return waku;
}
