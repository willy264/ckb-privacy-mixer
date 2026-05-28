import '../env.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { generateStealthAddress } from 'mixer-sdk/dist/utils/stealth.js';
import { buildMintedCtNote } from './note.js';
import {
    cancelCoordinatorDepositParticipant,
    fetchCoordinatorDepositParticipant,
    fetchCoordinatorDepositSession,
    prepareCoordinatorDepositParticipant,
    registerCoordinatorDepositCommitment,
} from '../coordinator/client.js';

const execAsync = promisify(exec);

export interface LiveDepositResult {
    status: 'pending' | 'finalized';
    note?: Awaited<ReturnType<typeof buildMintedCtNote>>;
    mintTxHash: string;
    stealthArgs: string;
    sessionId: string;
    inputOutPoint: string;
    participantId?: string;
}

function extractKeyValue(stdout: string, key: string) {
    const match = stdout.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (!match) {
        throw new Error(`Mint output missing ${key}`);
    }
    return match[1].trim();
}

export async function performLiveDeposit(recipientWalletAddress: string): Promise<LiveDepositResult> {
    const stealthArgs = generateStealthAddress(recipientWalletAddress);
    const prepared = await prepareCoordinatorDepositParticipant({
        denomination: 100,
        walletAddress: recipientWalletAddress,
        stealthOutputAddress: stealthArgs,
    });
    const repoRoot = path.resolve(process.cwd(), '..');
    const command = `pnpm --filter ckb-mixer-backend exec tsx src/deposit/mint-ct.ts ${recipientWalletAddress}`;
    let stdout = '';
    let stderr = '';

    try {
        const result = await execAsync(
            command,
            {
                cwd: repoRoot,
                env: process.env,
                shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
            },
        );
        stdout = result.stdout;
        stderr = result.stderr;
    } catch (error) {
        await cancelCoordinatorDepositParticipant(prepared.pool.sessionId, prepared.participant.participantId, error instanceof Error ? error.message : String(error)).catch(() => undefined);
        throw error;
    }

    if (stderr.trim()) {
        // Keep stderr visible in logs if mint printed anything meaningful there.
        console.warn(stderr);
    }

    const mintTxHash = extractKeyValue(stdout, 'MINT_TX_HASH');
    const inputOutPoint = extractKeyValue(stdout, 'CT_NOTE_INPUT_OUT_POINT');
    const commitment = extractKeyValue(stdout, 'CT_NOTE_TREE_COMMITMENT');
    const blindingFactor = extractKeyValue(stdout, 'CT_NOTE_BLINDING_FACTOR');
    const createdAt = Date.now();

    const poolMembership = await registerCoordinatorDepositCommitment(prepared.pool.sessionId, prepared.participant.participantId, {
        depositTxHash: mintTxHash,
        inputOutPoint,
        commitment,
        blindingFactor,
        noteCreatedAt: createdAt,
    });

    return {
        status: 'pending',
        mintTxHash,
        stealthArgs,
        sessionId: poolMembership.sessionId,
        inputOutPoint,
        participantId: prepared.participant.participantId,
    };
}

export async function fetchFinalizedDepositNote(poolId: string, participantId: string) {
    const [session, participant] = await Promise.all([
        fetchCoordinatorDepositSession(poolId),
        fetchCoordinatorDepositParticipant(poolId, participantId),
    ]);

    if (session.status !== 'complete') {
        return {
            status: session.status,
            session,
            participant,
        } as const;
    }

    if (!participant.inputOutPoint || !participant.blindingFactor || !participant.depositTxHash) {
        throw new Error(`Participant ${participantId} is missing finalized deposit metadata.`);
    }

    const leafIndex = participant.finalOutputIndex ?? 0;
    const commitment = leafIndex >= 0 ? session.commitments[leafIndex] : session.commitments[0];
    const mixedTxHash = participant.finalTxHash ?? participant.depositTxHash;
    const mixedOutPoint = mixedTxHash && participant.finalOutputIndex !== undefined
        ? `${mixedTxHash}:${`0x${participant.finalOutputIndex.toString(16)}`}`
        : participant.inputOutPoint;

    const note = await buildMintedCtNote({
        sessionId: poolId,
        inputOutPoint: mixedOutPoint,
        blindingFactor: participant.blindingFactor,
        stealthOutputAddress: participant.stealthOutputAddress,
        commitment,
        depositTxHash: mixedTxHash,
    });

    note.sessionCommitments = session.commitments as any;
    note.leafIndex = leafIndex >= 0 ? leafIndex : 0;
    note.createdAt = participant.noteCreatedAt ?? Date.now();
    note.registrySnapshot = {
        ...(note.registrySnapshot ?? {}),
        size: session.size,
        authority: note.registrySnapshot?.authority ?? 'direct',
    };

    return {
        status: 'finalized',
        note,
        session,
        participant,
    } as const;
}
