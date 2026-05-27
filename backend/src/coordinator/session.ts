import crypto from 'crypto';
import { RPC, helpers, config as lumosConfig, Indexer } from '@ckb-lumos/lumos';
import { blockchain } from '@ckb-lumos/base';
import type { Cell } from '@ckb-lumos/lumos';
import type { MixPool } from './pool.js';
import { pools } from './pool.js';
import { logger } from '../utils/logger.js';

lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

const CKB_SHANNON = BigInt(1_0000_0000); // 1 CKB = 10^8 shannons
const MIN_CELL_CAPACITY = BigInt(61) * CKB_SHANNON; // ~61 CKB minimum for a cell
const TX_FEE = BigInt(100_000); // 0.001 CKB flat fee

/** Fischer-Yates shuffle using CSPRNG. */
function secureShuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Parse a CKB address into its lock script.
 * Handles both short-format (ckt1qzda...) and full-format (ckt1qr.../JoyID) addresses.
 */
function parseLockScript(address: string) {
    try {
        return helpers.parseAddress(address, { config: lumosConfig.getConfig() });
    } catch {
        return helpers.parseAddress(address);
    }
}

/**
 * Collect live cells from the indexer for a given lock script.
 * Returns cells whose total capacity >= `needed`.
 */
async function collectCells(
    indexer: Indexer,
    lock: ReturnType<typeof parseLockScript>,
    needed: bigint,
): Promise<{ cells: Cell[]; total: bigint }> {
    const collector = indexer.collector({ lock });
    const cells: Cell[] = [];
    let total = 0n;

    for await (const cell of collector.collect()) {
        cells.push(cell);
        total += BigInt(cell.cellOutput.capacity);
        if (total >= needed) break;
    }

    return { cells, total };
}

export async function buildCoinJoinTransaction(pool: MixPool): Promise<string> {
    if (pool.participants.length < pool.requiredParticipants) {
        throw new Error('Pool is not full yet');
    }
    if (pool.status !== 'open') {
        throw new Error(`Cannot build transaction for pool in state: ${pool.status}`);
    }

    const rpcUrl = process.env.CKB_RPC_URL!;
    const indexer = new Indexer(rpcUrl);

    // The denomination from the frontend is in CKB units (e.g. 100 = 100 CKB).
    // Convert to shannons for on-chain capacity.
    const denominationShannons = pool.denomination * CKB_SHANNON;

    // Each stealth output needs at least MIN_CELL_CAPACITY to be valid on-chain.
    const outputCapacity = denominationShannons > MIN_CELL_CAPACITY
        ? denominationShannons
        : MIN_CELL_CAPACITY;

    // ── Use Lumos TransactionSkeleton so createTransactionFromSkeleton ──
    // ── produces the exact format JoyID expects                        ──
    let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

    // ── Add stealth outputs (shuffled to break input→output link) ────────
    const shuffledParticipants = secureShuffleArray(pool.participants);

    for (const p of shuffledParticipants) {
        const stealthLock = {
            codeHash: process.env.STEALTH_LOCK_CODE_HASH!,
            hashType: process.env.STEALTH_LOCK_HASH_TYPE! as 'type' | 'data' | 'data1',
            args: p.stealthOutputAddress,
        };
        txSkeleton = txSkeleton.update('outputs', (outputs) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${outputCapacity.toString(16)}`,
                    lock: stealthLock,
                },
                data: '0x',
            })
        );
    }

    // ── Collect input cells for each participant (manual — bypasses lock registration) ──
    for (const p of pool.participants) {
        const lock = parseLockScript(p.walletAddress);
        const needed = outputCapacity + TX_FEE;
        const { cells, total } = await collectCells(indexer, lock, needed);

        if (cells.length === 0) {
            throw new Error(
                `No live cells found for participant ${p.participantId}. ` +
                `Wallet: ${p.walletAddress.slice(0, 12)}...  Ensure the address has CKB on Pudge testnet.`,
            );
        }

        if (total < needed) {
            const haveCkb = (Number(total) / 1e8).toFixed(4);
            const needCkb = (Number(needed) / 1e8).toFixed(4);
            throw new Error(
                `Participant ${p.participantId} has ${haveCkb} CKB but ${needCkb} CKB is required.`,
            );
        }

        // Add each collected cell as an input
        for (const cell of cells) {
            txSkeleton = txSkeleton.update('inputs', (inputs) => inputs.push(cell));
        }

        // Return change to the participant's own lock
        const change = total - needed;
        if (change >= MIN_CELL_CAPACITY) {
            txSkeleton = txSkeleton.update('outputs', (outputs) =>
                outputs.push({
                    cellOutput: {
                        capacity: `0x${change.toString(16)}`,
                        lock,
                    },
                    data: '0x',
                })
            );
        }
    }

    // ── Add cell deps ────────────────────────────────────────────────────
    if (process.env.STEALTH_LOCK_TX_HASH) {
        txSkeleton = txSkeleton.update('cellDeps', (cellDeps) =>
            cellDeps.push({
                outPoint: {
                    txHash: process.env.STEALTH_LOCK_TX_HASH!,
                    index: process.env.STEALTH_LOCK_INDEX ?? '0x0',
                },
                depType: 'code',
            })
        );
    }

    // ── Add empty witnesses (one per input — participants fill in their own) ──
    const emptyWitness = `0x${Buffer.from(
        blockchain.WitnessArgs.pack({
            lock: undefined,
            inputType: undefined,
            outputType: undefined,
        })
    ).toString('hex')}`;
    const inputCount = txSkeleton.get('inputs').size;
    for (let i = 0; i < inputCount; i++) {
        txSkeleton = txSkeleton.update('witnesses', (witnesses) => witnesses.push(emptyWitness));
    }

    // ── Serialize using Lumos (ensures correct molecule-compatible format) ──
    const rawTx = helpers.createTransactionFromSkeleton(txSkeleton);
    const txHex = `0x${Buffer.from(JSON.stringify(rawTx)).toString('hex')}`;

    pool.status = 'building';
    pool.pendingTxHex = txHex;

    logger.info('[CoinJoin] Transaction built', {
        poolId: pool.poolId,
        inputs: rawTx.inputs.length,
        outputs: rawTx.outputs.length,
        denominationCKB: pool.denomination.toString(),
        outputCapacityShannons: outputCapacity.toString(),
    });

    return txHex;
}

export function recordSignature(
    poolId: string,
    participantId: string,
    signature: string,
): boolean {
    const pool = pools.get(poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    if (pool.status !== 'building') throw new Error('Pool is not in building state');

    const participant = pool.participants.find(p => p.participantId === participantId);
    if (!participant) throw new Error(`Participant not found: ${participantId}`);
    if (participant.signature) throw new Error('Participant has already signed');

    participant.signature = signature;
    participant.status = 'signed';

    logger.info('[CoinJoin] Signature received', {
        poolId,
        participantId,
        signedCount: pool.participants.filter(p => p.signature).length,
        required: pool.requiredParticipants,
    });

    const allSigned = pool.participants.every(p => !!p.signature);
    if (allSigned) {
        pool.status = 'broadcasting';
        logger.info('[CoinJoin] All participants signed — ready to broadcast', { poolId });
    }

    return allSigned;
}

export async function broadcastCoinJoin(pool: MixPool, rpcUrl: string): Promise<string> {
    if (pool.status !== 'broadcasting') {
        throw new Error('Pool is not ready to broadcast');
    }
    if (!pool.pendingTxHex) {
        throw new Error('No pending transaction to broadcast');
    }

    const rawTxStr = Buffer.from(pool.pendingTxHex.slice(2), 'hex').toString('utf8');
    const tx = JSON.parse(rawTxStr);

    // Merge witnesses and cellDeps from all participants
    const mergedWitnesses = [...tx.witnesses];
    const mergedCellDeps = tx.cellDeps ? [...tx.cellDeps] : [];
    
    for (const p of pool.participants) {
        if (!p.signature) continue;
        try {
            const parsed = JSON.parse(p.signature);
            const parsedWitnesses = Array.isArray(parsed) ? parsed : (parsed.witnesses || []);
            const parsedCellDeps = Array.isArray(parsed) ? [] : (parsed.cellDeps || []);

            for (let i = 0; i < parsedWitnesses.length; i++) {
                if (parsedWitnesses[i] && parsedWitnesses[i] !== '0x') {
                    mergedWitnesses[i] = parsedWitnesses[i];
                }
            }

            for (const dep of parsedCellDeps) {
                const exists = mergedCellDeps.some((d: any) => 
                    d.outPoint.txHash === dep.outPoint.txHash && 
                    d.outPoint.index === dep.outPoint.index
                );
                if (!exists) {
                    mergedCellDeps.push(dep);
                }
            }
        } catch (e) {
            logger.warn('Failed to parse participant signature as JSON', { err: e });
        }
    }
    
    tx.witnesses = mergedWitnesses;
    tx.cellDeps = mergedCellDeps;

    logger.info('[CoinJoin] Sending transaction to CKB node...', { poolId: pool.poolId });

    try {
        const rpc = new RPC(rpcUrl);
        const txHash = await rpc.sendTransaction(tx, 'passthrough');

        pool.status = 'complete';
        pool.broadcastTxHash = txHash;

        logger.info('[CoinJoin] Broadcast complete', { poolId: pool.poolId, txHash });
        return txHash;
    } catch (error) {
        pool.status = 'failed';
        pool.failureReason = String(error);
        logger.error('[CoinJoin] Broadcast failed', { poolId: pool.poolId, error: pool.failureReason });
        throw error;
    }
}
