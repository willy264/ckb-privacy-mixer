import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { loadRelayerConfig } from './config.js';
import { RelayerWallet } from './wallet.js';
import { submitRelay, type RelayRequest } from './relay.js';
import { logger } from '../utils/logger.js';
import { redis } from '../utils/redis.js';

import { rateLimit } from 'express-rate-limit';

/**
 * Creates and returns the Relayer Express application.
 *
 * Endpoints:
 *   POST /relay         — Submit a ZK proof for the relayer to broadcast
 *   GET  /relay/:jobId  — Poll the status of a relay job
 *   GET  /health        — Relayer liveness + wallet balance
 *   GET  /info          — Public relayer metadata (fee rate, address)
 */
export function createRelayerApp() {
    const cfg = loadRelayerConfig();
    const wallet = new RelayerWallet(cfg);

    // Log the relayer balance on startup
    wallet.checkBalance().catch(err =>
        logger.warn('[Relayer] Could not check balance', { error: String(err) }),
    );

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '512kb' }));

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: { error: 'Too many requests, please try again later.' }
    });
    app.use('/relay', apiLimiter);

    // ── POST /relay ────────────────────────────────────────────────────────────
    app.post('/relay', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = req.body as RelayRequest;
            if (!body.proofHex || !body.recipientAddress || !body.nullifierHex) {
                res.status(400).json({ error: 'Missing required fields: proofHex, recipientAddress, nullifierHex' });
                return;
            }

            const result = await submitRelay(body, wallet, cfg);
            res.status(202).json(result);
        } catch (err) {
            next(err);
        }
    });

    // ── GET /relay/:jobId ──────────────────────────────────────────────────────
    app.get('/relay/:jobId', async (req: Request, res: Response) => {
        const jobStr = await redis.get(`job:${req.params.jobId}`);
        if (!jobStr) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        res.json(JSON.parse(jobStr));
    });

    // ── GET /health ────────────────────────────────────────────────────────────
    app.get('/health', async (_req: Request, res: Response) => {
        try {
            const balance = await wallet.getBalanceShannnons();
            // Count active jobs by scanning keys (for demo purposes)
            // In a production app, we'd use a dedicated set or counter for active jobs
            const jobKeys = await redis.keys('job:*');
            res.json({
                status: 'ok',
                relayerAddress: wallet.getAddress(),
                balanceCKB: (Number(balance) / 1e8).toFixed(4),
                activeJobs: jobKeys.length,
            });
        } catch {
            res.status(503).json({ status: 'degraded', reason: 'Cannot reach CKB node' });
        }
    });

    // ── GET /info ──────────────────────────────────────────────────────────────
    // Public metadata — the frontend reads this to show users the relayer's fee
    app.get('/info', (_req: Request, res: Response) => {
        res.json({
            relayerAddress: wallet.getAddress(),
            feeRate: cfg.feeRate,
            feePercent: `${(cfg.feeRate * 100).toFixed(2)}%`,
            network: process.env.CKB_NETWORK ?? 'testnet',
        });
    });

    // ── Error handler ──────────────────────────────────────────────────────────
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[Relayer] Unhandled error', { error: message });
        res.status(500).json({ error: message });
    });

    return app;
}
