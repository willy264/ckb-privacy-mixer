import crypto from 'crypto';
import { z } from 'zod';
import { AggronWithdrawalProvider } from 'mixer-sdk/legacy';
import { loadMixerRuntimeConfig } from 'mixer-sdk/legacy';
import type { WithdrawalTransaction } from 'mixer-sdk/legacy';
import type { RelayerConfig } from './config.js';
import type { RelayerWallet } from './wallet.js';
import { logger } from '../utils/logger.js';
import { redis } from '../utils/redis.js';

export interface RelayRequest {
    nullifierHex: string;
    transaction: WithdrawalTransaction;
}

const relayRequestSchema = z.object({
    nullifierHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'nullifierHex must be a 32-byte 0x-prefixed hex string'),
    transaction: z.unknown(),
});

export interface RelayResult {
    jobId: string;
    status: 'queued' | 'broadcast' | 'failed';
    txHash?: string;
    error?: string;
    nullifierHex?: string;
}

export async function submitRelay(
    request: RelayRequest,
    wallet: RelayerWallet,
    cfg: RelayerConfig,
): Promise<RelayResult> {
    const parsed = relayRequestSchema.parse(request);

    const transaction = parsed.transaction as WithdrawalTransaction;

    if (transaction.nullifier.replace(/^0x/, '') !== parsed.nullifierHex.replace(/^0x/, '')) {
        throw new Error('Relay request nullifier does not match the transaction nullifier.');
    }

    const lockKey = `nullifier:${parsed.nullifierHex}`;
    const acquiredLock = await redis.set(lockKey, 'locked', 'EX', 900, 'NX');
    if (!acquiredLock) {
        throw new Error('This nullifier is already queued for relay.');
    }

    const jobId = crypto.randomUUID();
    const job: RelayResult = { jobId, status: 'queued', nullifierHex: parsed.nullifierHex };
    await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);

    logger.info('[Relayer] Queued relay job', {
        jobId,
        nullifier: parsed.nullifierHex.slice(0, 18) + '...',
    });

    setImmediate(async () => {
        try {
            const txHash = await broadcastWithdrawal(transaction, wallet, cfg);
            job.status = 'broadcast';
            job.txHash = txHash;
            logger.info('[Relayer] Withdrawal broadcast', { jobId, txHash });
        } catch (err) {
            job.status = 'failed';
            job.error = String(err);
            logger.error('[Relayer] Broadcast failed', { jobId, error: job.error });
            await redis.del(lockKey);
        }

        await redis.set(`job:${jobId}`, JSON.stringify(job), 'EX', 86400);
    });

    return job;
}

function buildProviderConfig(cfg: RelayerConfig) {
    return loadMixerRuntimeConfig({
        CKB_RPC_URL: cfg.ckbRpcUrl,
        CKB_INDEXER_URL: cfg.ckbIndexerUrl,
        MIXER_POOL_CODE_HASH: process.env.MIXER_POOL_CODE_HASH,
        MIXER_POOL_HASH_TYPE: process.env.MIXER_POOL_HASH_TYPE,
        MIXER_POOL_TX_HASH: process.env.MIXER_POOL_TX_HASH,
        MIXER_POOL_INDEX: process.env.MIXER_POOL_INDEX,
        MIXER_POOL_DEP_TYPE: process.env.MIXER_POOL_DEP_TYPE,
        NULLIFIER_TYPE_CODE_HASH: process.env.NULLIFIER_TYPE_CODE_HASH,
        NULLIFIER_TYPE_HASH_TYPE: process.env.NULLIFIER_TYPE_HASH_TYPE,
        NULLIFIER_TYPE_TX_HASH: process.env.NULLIFIER_TYPE_TX_HASH,
        NULLIFIER_TYPE_INDEX: process.env.NULLIFIER_TYPE_INDEX,
        NULLIFIER_TYPE_DEP_TYPE: process.env.NULLIFIER_TYPE_DEP_TYPE,
        ZK_MEMBERSHIP_TYPE_CODE_HASH: process.env.ZK_MEMBERSHIP_TYPE_CODE_HASH,
        ZK_MEMBERSHIP_TYPE_HASH_TYPE: process.env.ZK_MEMBERSHIP_TYPE_HASH_TYPE,
        ZK_MEMBERSHIP_TYPE_TX_HASH: process.env.ZK_MEMBERSHIP_TYPE_TX_HASH,
        ZK_MEMBERSHIP_TYPE_INDEX: process.env.ZK_MEMBERSHIP_TYPE_INDEX,
        ZK_MEMBERSHIP_TYPE_DEP_TYPE: process.env.ZK_MEMBERSHIP_TYPE_DEP_TYPE,
        STEALTH_LOCK_CODE_HASH: process.env.STEALTH_LOCK_CODE_HASH,
        STEALTH_LOCK_HASH_TYPE: process.env.STEALTH_LOCK_HASH_TYPE,
        STEALTH_LOCK_TX_HASH: process.env.STEALTH_LOCK_TX_HASH,
        STEALTH_LOCK_INDEX: process.env.STEALTH_LOCK_INDEX,
        STEALTH_LOCK_DEP_TYPE: process.env.STEALTH_LOCK_DEP_TYPE,
        CT_TOKEN_TYPE_CODE_HASH: process.env.CT_TOKEN_TYPE_CODE_HASH,
        CT_TOKEN_TYPE_HASH_TYPE: process.env.CT_TOKEN_TYPE_HASH_TYPE,
        CT_TOKEN_TYPE_TX_HASH: process.env.CT_TOKEN_TYPE_TX_HASH,
        CT_TOKEN_TYPE_INDEX: process.env.CT_TOKEN_TYPE_INDEX,
        CT_TOKEN_TYPE_DEP_TYPE: process.env.CT_TOKEN_TYPE_DEP_TYPE,
        NULLIFIER_REGISTRY_TX_HASH: process.env.NULLIFIER_REGISTRY_TX_HASH,
        NULLIFIER_REGISTRY_INDEX: process.env.NULLIFIER_REGISTRY_INDEX,
        NULLIFIER_REGISTRY_LOCK: process.env.NULLIFIER_REGISTRY_LOCK,
        NULLIFIER_REGISTRY_CAPACITY: process.env.NULLIFIER_REGISTRY_CAPACITY,
        NULLIFIER_REGISTRY_TYPE_ARGS: process.env.NULLIFIER_REGISTRY_TYPE_ARGS,
        MIXER_RUNTIME_MODE: 'live',
        MIXER_WITHDRAWAL_AUTHORITY: process.env.MIXER_WITHDRAWAL_AUTHORITY,
    });
}

async function broadcastWithdrawal(
    transaction: WithdrawalTransaction,
    wallet: RelayerWallet,
    cfg: RelayerConfig,
): Promise<string> {
    if (transaction.submission.runtimeMode !== 'live') {
        throw new Error('Relayer only accepts live withdrawal transactions.');
    }

    const provider = new AggronWithdrawalProvider({
        config: buildProviderConfig(cfg),
    });

    logger.info('[Relayer] Broadcasting prepared live withdrawal transaction', {
        nullifier: transaction.nullifier,
    });

    return provider.submitWithdrawal(transaction, wallet.getPrivateKey());
}
