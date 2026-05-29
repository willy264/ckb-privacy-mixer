import { execFile } from 'child_process';
import { promisify } from 'util';
import { RPC, helpers, config as lumosConfig } from '@ckb-lumos/lumos';
import { blockchain } from '@ckb-lumos/base';
import { deriveCommitment } from 'mixer-sdk/dist/utils/crypto.js';
import { getDepositPool, markDepositPoolFinalized, summarizeDepositPool, type DepositPool } from './deposit-pool.js';
import { logger } from '../utils/logger.js';

const CKB_SHANNON = 100_000_000n;
const MIXED_OUTPUT_CAPACITY = 224n * CKB_SHANNON;
const STAGING_OUTPUT_CAPACITY = 300n * CKB_SHANNON;
const CHANGE_OUTPUT_CAPACITY = STAGING_OUTPUT_CAPACITY - MIXED_OUTPUT_CAPACITY;
const FINALIZATION_FEE_SHANNONS = 10_000n;
const execFileAsync = promisify(execFile);

interface RoundHelperOutput {
    outputs: Array<{
        amount: number;
        blinding_factor_hex: string;
        commitment_hex: string;
    }>;
    range_proof_hex: string;
}

function parseSignaturePayload(signaturePayload: string) {
    const parsed = JSON.parse(signaturePayload) as {
        witnesses?: unknown[];
        cellDeps?: unknown[];
    };

    if (!Array.isArray(parsed.witnesses)) {
        throw new Error('Invalid participant signature payload: missing witnesses array.');
    }

    return parsed;
}

function buildStealthLockScript(args: string) {
    return {
        codeHash: process.env.STEALTH_LOCK_CODE_HASH!,
        hashType: process.env.STEALTH_LOCK_HASH_TYPE! as 'type' | 'data' | 'data1',
        args,
    };
}

function assertReadyParticipants(pool: DepositPool) {
    const participants = pool.participants.filter(
        participant =>
            (participant.status === 'minted' || participant.status === 'registered' || participant.status === 'finalized') &&
            participant.inputOutPoint &&
            participant.stealthOutputAddress,
    );
    if (participants.length < pool.targetParticipants) {
        throw new Error(`Deposit pool ${pool.poolId} is not ready for finalization`);
    }
    return participants.slice(0, pool.targetParticipants);
}

async function fetchLiveCell(rpc: RPC, txHash: string, index: string) {
    const liveCell = await rpc.getLiveCell({ txHash, index } as any, true);
    if (!liveCell.cell || liveCell.status !== 'live') {
        throw new Error(`Live cell ${txHash}:${index} not found for deposit finalization.`);
    }
    return liveCell as typeof liveCell & { cell: NonNullable<typeof liveCell.cell> };
}

async function runRoundHelper(amount: bigint, count: number): Promise<RoundHelperOutput> {
    const { stdout } = await execFileAsync(
        'cargo',
        ['run', '-q', '-p', 'ct-round-helper', '--', amount.toString(), count.toString()],
        { cwd: process.cwd() },
    );
    return JSON.parse(stdout) as RoundHelperOutput;
}

export async function buildUnsignedDepositFinalization(poolId: string) {
    lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
    const pool = await getDepositPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participants = assertReadyParticipants(pool);
    const shuffled = [...participants].sort((left, right) => left.participantId.localeCompare(right.participantId));
    const rpc = new RPC(process.env.CKB_RPC_URL!);
    const roundHelper = await runRoundHelper(100n, shuffled.length);
    let txSkeleton = helpers.TransactionSkeleton({});

    for (const participant of participants) {
        const [txHash, index] = participant.inputOutPoint!.split(':');
        const liveCell = await fetchLiveCell(rpc, txHash, index);
        txSkeleton = txSkeleton.update('inputs', (inputs: any) =>
            inputs.push({
                outPoint: { txHash, index },
                cellOutput: liveCell.cell.output,
                data: liveCell.cell.data.content,
            } as any),
        );
    }

    const outputIndexByParticipantId: Record<string, number> = {};
    const totalChangeCapacity = CHANGE_OUTPUT_CAPACITY * BigInt(shuffled.length);
    if (totalChangeCapacity <= FINALIZATION_FEE_SHANNONS) {
        throw new Error('Not enough staged surplus capacity to pay the finalization transaction fee.');
    }
    const feeAdjustedTotalChange = totalChangeCapacity - FINALIZATION_FEE_SHANNONS;
    const baseChangePerParticipant = feeAdjustedTotalChange / BigInt(shuffled.length);
    const remainder = feeAdjustedTotalChange % BigInt(shuffled.length);
    shuffled.forEach((participant, index) => {
        const capacityForThisOutput = baseChangePerParticipant + (index === 0 ? remainder : 0n);
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${capacityForThisOutput.toString(16)}`,
                    lock: helpers.parseAddress(participant.walletAddress, { config: lumosConfig.getConfig() }),
                },
                data: '0x',
            } as any),
        );
    });

    shuffled.forEach((participant, index) => {
        outputIndexByParticipantId[participant.participantId] = shuffled.length + index;
        const commitmentHex = roundHelper.outputs[index]?.commitment_hex;
        if (!commitmentHex) {
            throw new Error(`Missing generated round commitment for output ${index}`);
        }
        txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
            outputs.push({
                cellOutput: {
                    capacity: `0x${MIXED_OUTPUT_CAPACITY.toString(16)}`,
                    lock: buildStealthLockScript(participant.stealthOutputAddress),
                },
                data: `${commitmentHex}${'00'.repeat(32)}`.replace(/^0x0x/, '0x'),
            } as any),
        );
    });

    if (process.env.STEALTH_LOCK_TX_HASH) {
        txSkeleton = txSkeleton.update('cellDeps', (cellDeps: any) =>
            cellDeps.push({
                outPoint: {
                    txHash: process.env.STEALTH_LOCK_TX_HASH!,
                    index: process.env.STEALTH_LOCK_INDEX ?? '0x0',
                },
                depType: 'code',
            }),
        );
    }

    const inputWitnessPlaceholder = `0x${Buffer.from(
        blockchain.WitnessArgs.pack({
            lock: new Uint8Array(65),
            inputType: undefined,
            outputType: undefined,
        }),
    ).toString('hex')}`;
    const ctTokenWitness = `0x${Buffer.from(
        blockchain.WitnessArgs.pack({
            lock: undefined,
            inputType: undefined,
            outputType: Buffer.from(roundHelper.range_proof_hex.slice(2), 'hex'),
        }),
    ).toString('hex')}`;

    for (let i = 0; i < participants.length; i += 1) {
        txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => witnesses.push(inputWitnessPlaceholder));
    }
    for (let i = 0; i < shuffled.length; i += 1) {
        txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => witnesses.push('0x'));
    }
    txSkeleton = txSkeleton.update('witnesses', (witnesses: any) => witnesses.push(ctTokenWitness));

    const rawTransaction = helpers.createTransactionFromSkeleton(txSkeleton);
    return {
        pool: summarizeDepositPool(pool),
        participants: participants.map(participant => ({
            participantId: participant.participantId,
            walletAddress: participant.walletAddress,
            inputOutPoint: participant.inputOutPoint!,
            stealthOutputAddress: participant.stealthOutputAddress,
        })),
        rawTransaction,
        outputIndexByParticipantId,
        rangeProofHex: roundHelper.range_proof_hex,
    };
}

export async function finalizeSignedDepositRound(poolId: string, signedTransaction: any) {
    const pool = await getDepositPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const unsigned = await buildUnsignedDepositFinalization(poolId);
    const participants = assertReadyParticipants(pool);
    const participantMap = new Map(participants.map(participant => [participant.participantId, participant]));

    const mergedWitnesses = [...(unsigned.rawTransaction as any).witnesses];
    for (let i = 0; i < unsigned.participants.length; i += 1) {
        const participantInfo = unsigned.participants[i];
        const participant = participantMap.get(participantInfo.participantId);
        if (!participant?.signaturePayload) {
            throw new Error(`Missing signature payload for participant ${participantInfo.participantId}`);
        }
        const parsedPayload = parseSignaturePayload(participant.signaturePayload);
        const signedWitness = parsedPayload.witnesses?.[i];
        if (typeof signedWitness !== 'string' || !signedWitness.startsWith('0x')) {
            throw new Error(`Participant ${participantInfo.participantId} did not provide a valid signed witness for input ${i}.`);
        }
        mergedWitnesses[i] = signedWitness;
    }

    const finalTransaction = {
        ...(unsigned.rawTransaction as any),
        witnesses: mergedWitnesses,
    };

    const rpc = new RPC(process.env.CKB_RPC_URL!);
    const txHash = await rpc.sendTransaction(finalTransaction, 'passthrough');

    const finalizedCommitments = await Promise.all(
        unsigned.participants.map(async (participant) => {
            const entry = pool.participants.find(candidate => candidate.participantId === participant.participantId);
            if (!entry?.blindingFactor) {
                throw new Error(`Participant ${participant.participantId} is missing blinding factor for finalization.`);
            }
            return deriveCommitment(entry.blindingFactor, poolId);
        }),
    );

    const finalizedPool = await markDepositPoolFinalized(poolId, finalizedCommitments, unsigned.outputIndexByParticipantId, txHash);

    logger.info('[DepositPool] Broadcast complete', { poolId, txHash });

    return {
        txHash,
        pool: summarizeDepositPool(finalizedPool),
        outputIndexByParticipantId: unsigned.outputIndexByParticipantId,
        transaction: finalTransaction,
    };
}
