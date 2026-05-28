import '../env.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { generateStealthAddress } from 'mixer-sdk/dist/utils/stealth.js';
import { buildMintedCtNote } from './note.js';
import {
    cancelCoordinatorDepositParticipant,
    prepareCoordinatorDepositParticipant,
    registerCoordinatorDepositCommitment,
} from '../coordinator/client.js';

const execAsync = promisify(exec);

export interface LiveDepositResult {
    note: Awaited<ReturnType<typeof buildMintedCtNote>>;
    mintTxHash: string;
    stealthArgs: string;
    sessionId: string;
    inputOutPoint: string;
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
    const command = `pnpm --filter ckb-mixer-backend exec tsx src/deposit/mint-ct.ts ${stealthArgs}`;
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

    const note = await buildMintedCtNote({
        sessionId: poolMembership.sessionId,
        inputOutPoint,
        blindingFactor,
        stealthOutputAddress: stealthArgs,
        commitment,
        depositTxHash: mintTxHash,
    });
    note.sessionCommitments = poolMembership.commitments as any;
    note.leafIndex = poolMembership.leafIndex;
    note.createdAt = poolMembership.noteCreatedAt;
    note.registrySnapshot = {
        ...(note.registrySnapshot ?? {}),
        size: poolMembership.pool.size,
    };

    return {
        note,
        mintTxHash,
        stealthArgs,
        sessionId: poolMembership.sessionId,
        inputOutPoint,
    };
}
