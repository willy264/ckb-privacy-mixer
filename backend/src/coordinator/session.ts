import crypto from 'crypto';
import { ccc } from '@ckb-ccc/core';
import type { MixPool } from './pool.js';
import { pools } from './pool.js';
import { logger } from '../utils/logger.js';


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
 */
async function parseLockScript(address: string, client: ccc.Client) {
    return (await ccc.Address.fromString(address, client)).script;
}

/**
 * Collect live cells from the indexer for a given lock script.
 * Returns cells whose total capacity >= `needed`.
 */
async function collectCells(
    client: ccc.Client,
    lock: ccc.Script,
    needed: bigint,
) {
    const cells: ccc.Cell[] = [];
    let total = 0n;

    for await (const cell of client.findCells({ script: lock, scriptType: 'lock', scriptSearchMode: 'exact' })) {
        cells.push(cell);
        total += cell.cellOutput.capacity;
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
    const client = new ccc.ClientPublicTestnet({ url: rpcUrl });

    // The denomination from the frontend is in CKB units (e.g. 100 = 100 CKB).
    // Convert to shannons for on-chain capacity.
    const denominationShannons = pool.denomination * CKB_SHANNON;

    // Each stealth output needs at least MIN_CELL_CAPACITY to be valid on-chain.
    const outputCapacity = denominationShannons > MIN_CELL_CAPACITY
        ? denominationShannons
        : MIN_CELL_CAPACITY;

    const cccTx = ccc.Transaction.from({});

    // ── Add stealth outputs (shuffled to break input→output link) ────────
    const shuffledParticipants = secureShuffleArray(pool.participants);

    for (const p of shuffledParticipants) {
        const stealthLock = ccc.Script.from({
            codeHash: process.env.STEALTH_LOCK_CODE_HASH!,
            hashType: process.env.STEALTH_LOCK_HASH_TYPE! as 'type' | 'data' | 'data1',
            args: p.stealthOutputAddress,
        });
        cccTx.addOutput({
            capacity: outputCapacity,
            lock: stealthLock,
        }, '0x');
    }

    // ── Collect input cells for each participant (manual — bypasses lock registration) ──
    for (const p of pool.participants) {
        const lock = await parseLockScript(p.walletAddress, client);
        const needed = outputCapacity + TX_FEE;
        const { cells, total } = await collectCells(client, lock, needed);

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
            cccTx.addInput({
                previousOutput: cell.outPoint,
                since: 0n,
            });
        }

        // Return change to the participant's own lock
        const change = total - needed;
        if (change >= MIN_CELL_CAPACITY) {
            cccTx.addOutput({
                capacity: change,
                lock,
            }, '0x');
        }
    }

    // ── Add cell deps ────────────────────────────────────────────────────
    if (process.env.STEALTH_LOCK_TX_HASH) {
        cccTx.addCellDeps({
            outPoint: {
                txHash: process.env.STEALTH_LOCK_TX_HASH!,
                index: ccc.numToHex(process.env.STEALTH_LOCK_INDEX ?? '0x0'),
            },
            depType: 'code',
        });
    }

    // ── Add empty witnesses (one per input — participants fill in their own) ──
    const emptyWitness = ccc.hexFrom(ccc.WitnessArgs.from({}).toBytes());
    const inputCount = cccTx.inputs.length;
    for (let i = 0; i < inputCount; i++) {
        cccTx.witnesses.push(emptyWitness);
    }

    // ── Serialize to JSON string so frontend can decode it ──
    const txObj = {
        version: ccc.numToHex(cccTx.version),
        cellDeps: cccTx.cellDeps.map((d) => ({
            outPoint: {
                txHash: d.outPoint.txHash,
                index: ccc.numToHex(d.outPoint.index),
            },
            depType: d.depType,
        })),
        headerDeps: cccTx.headerDeps,
        inputs: cccTx.inputs.map((i) => ({
            previousOutput: {
                txHash: i.previousOutput.txHash,
                index: ccc.numToHex(i.previousOutput.index),
            },
            since: ccc.numToHex(i.since),
        })),
        outputs: cccTx.outputs.map((o) => ({
            capacity: ccc.numToHex(o.capacity),
            lock: {
                codeHash: o.lock.codeHash,
                hashType: o.lock.hashType,
                args: o.lock.args,
            },
            type: o.type ? {
                codeHash: o.type.codeHash,
                hashType: o.type.hashType,
                args: o.type.args,
            } : undefined,
        })),
        outputsData: cccTx.outputsData,
        witnesses: cccTx.witnesses,
    };
    const txHex = `0x${Buffer.from(JSON.stringify(txObj)).toString('hex')}`;

    pool.status = 'building';
    pool.pendingTxHex = txHex;

    logger.info('[CoinJoin] Transaction built', {
        poolId: pool.poolId,
        inputs: cccTx.inputs.length,
        outputs: cccTx.outputs.length,
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
            logger.error(`Failed to parse signature for participant ${p.participantId}`, e);
        }
    }

    tx.witnesses = mergedWitnesses;
    tx.cellDeps = mergedCellDeps;

    const cccTx = ccc.Transaction.from(tx);
    const client = new ccc.ClientPublicTestnet({ url: rpcUrl });

    try {
        const txHash = await client.sendTransaction(cccTx);

        pool.status = 'broadcasting';
        pool.broadcastTxHash = txHash;
        logger.info('[CoinJoin] Successfully broadcast transaction', { poolId: pool.poolId, txHash });

        return txHash;
    } catch (error: any) {
        pool.status = 'failed';
        pool.failureReason = `Broadcast failed: ${error.message}`;
        logger.error('[CoinJoin] Broadcast failed', { poolId: pool.poolId, error: error.message });
        throw error;
    }
}
