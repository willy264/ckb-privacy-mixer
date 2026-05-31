import { execFile } from 'child_process';
import { promisify } from 'util';
import { ccc } from '@ckb-ccc/core';
import { deriveCommitment } from 'mixer-sdk';
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
    return ccc.Script.from({
        codeHash: process.env.STEALTH_LOCK_CODE_HASH!,
        hashType: process.env.STEALTH_LOCK_HASH_TYPE! as 'type' | 'data' | 'data1',
        args,
    });
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

// Removed fetchLiveCell since we'll use client.getCell directly

async function runRoundHelper(amount: bigint, count: number): Promise<RoundHelperOutput> {
    const { stdout } = await execFileAsync(
        'cargo',
        ['run', '-q', '-p', 'ct-round-helper', '--', amount.toString(), count.toString()],
        { cwd: process.cwd() },
    );
    return JSON.parse(stdout) as RoundHelperOutput;
}

export async function buildUnsignedDepositFinalization(poolId: string) {
    const pool = await getDepositPool(poolId);
    if (!pool) {
        throw new Error(`Deposit pool not found: ${poolId}`);
    }

    const participants = assertReadyParticipants(pool);
    const shuffled = [...participants].sort((left, right) => left.participantId.localeCompare(right.participantId));
    const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL! });
    const roundHelper = await runRoundHelper(100n, shuffled.length);
    const cccTx = ccc.Transaction.from({});

    for (const participant of participants) {
        const [txHash, index] = participant.inputOutPoint!.split(':');
        const indexHex = ccc.numToHex(index.startsWith('0x') ? index : parseInt(index, 10));
        
        cccTx.addInput({
            previousOutput: { txHash, index: indexHex },
            since: '0x0',
        });
    }

    const outputIndexByParticipantId: Record<string, number> = {};
    const totalChangeCapacity = CHANGE_OUTPUT_CAPACITY * BigInt(shuffled.length);
    if (totalChangeCapacity <= FINALIZATION_FEE_SHANNONS) {
        throw new Error('Not enough staged surplus capacity to pay the finalization transaction fee.');
    }
    const feeAdjustedTotalChange = totalChangeCapacity - FINALIZATION_FEE_SHANNONS;
    const baseChangePerParticipant = feeAdjustedTotalChange / BigInt(shuffled.length);
    const remainder = feeAdjustedTotalChange % BigInt(shuffled.length);
    
    for (let index = 0; index < shuffled.length; index++) {
        const participant = shuffled[index];
        const capacityForThisOutput = baseChangePerParticipant + (index === 0 ? remainder : 0n);
        const lockObj = await ccc.Address.fromString(participant.walletAddress, client);
        cccTx.addOutput({
            capacity: ccc.numFrom(capacityForThisOutput),
            lock: lockObj.script,
        }, '0x');
    }

    shuffled.forEach((participant, index) => {
        outputIndexByParticipantId[participant.participantId] = shuffled.length + index;
        const commitmentHex = roundHelper.outputs[index]?.commitment_hex;
        if (!commitmentHex) {
            throw new Error(`Missing generated round commitment for output ${index}`);
        }
        cccTx.addOutput({
            capacity: ccc.numFrom(MIXED_OUTPUT_CAPACITY),
            lock: buildStealthLockScript(participant.stealthOutputAddress),
        }, ccc.hexFrom(`${commitmentHex}${'00'.repeat(32)}`.replace(/^0x0x/, '0x')));
    });

    if (process.env.STEALTH_LOCK_TX_HASH) {
        cccTx.addCellDeps({
            outPoint: {
                txHash: process.env.STEALTH_LOCK_TX_HASH!,
                index: ccc.numToHex(process.env.STEALTH_LOCK_INDEX ?? '0x0'),
            },
            depType: 'code',
        });
    }

    const inputWitnessPlaceholder = ccc.hexFrom(ccc.WitnessArgs.from({ lock: '0x' + '00'.repeat(65) }).toBytes());
    const ctTokenWitness = ccc.hexFrom(ccc.WitnessArgs.from({ outputType: roundHelper.range_proof_hex }).toBytes());

    for (let i = 0; i < participants.length; i += 1) {
        cccTx.witnesses.push(inputWitnessPlaceholder);
    }
    for (let i = 0; i < shuffled.length; i += 1) {
        cccTx.witnesses.push('0x');
    }
    cccTx.witnesses.push(ctTokenWitness);

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

    return {
        pool: summarizeDepositPool(pool),
        participants: participants.map(participant => ({
            participantId: participant.participantId,
            walletAddress: participant.walletAddress,
            inputOutPoint: participant.inputOutPoint!,
            stealthOutputAddress: participant.stealthOutputAddress,
        })),
        rawTransaction: txObj,
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

    const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL! });
    const cccTx = ccc.Transaction.from(finalTransaction as any);
    const txHash = await client.sendTransaction(cccTx);

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
