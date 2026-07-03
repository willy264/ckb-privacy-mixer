import '../env.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { generateStealthAddress } from 'mixer-sdk';
import { buildMintedCtNote } from './note.js';
import {
    cancelCoordinatorDepositParticipant,
    fetchCoordinatorDepositParticipant,
    fetchCoordinatorDepositRecovery,
    fetchCoordinatorDepositSession,
    prepareCoordinatorDepositParticipant,
    registerCoordinatorDepositCommitment,
} from '../coordinator/client.js';

const execFileAsync = promisify(execFile);
let depositMintQueue = Promise.resolve();

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

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientMintConflict(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes('poolrejectedrbf')
        || normalized.includes('rbf rejected')
        || normalized.includes('already in pool')
        || normalized.includes('transaction') && normalized.includes('was rejected by the node');
}

function findWorkspaceRoot(startDir = process.cwd()) {
    let current = path.resolve(startDir);

    while (true) {
        if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return path.resolve(startDir);
        }
        current = parent;
    }
}

function getPnpmCommand() {
    return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function buildMintCommand(repoRoot: string, recipientWalletAddress: string) {
    const compiledMintScript = path.join(repoRoot, 'backend', 'dist', 'deposit', 'mint-ct.js');
    if (fs.existsSync(compiledMintScript)) {
        return {
            command: process.execPath,
            args: [compiledMintScript, recipientWalletAddress],
        };
    }

    return {
        command: getPnpmCommand(),
        args: ['--filter', 'ckb-mixer-backend', 'exec', 'tsx', 'src/deposit/mint-ct.ts', recipientWalletAddress],
    };
}

async function runMintCommandSerially(command: string, args: string[], repoRoot: string) {
    const previous = depositMintQueue;
    let release!: () => void;
    depositMintQueue = new Promise<void>(resolve => {
        release = resolve;
    });

    await previous;
    try {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                return await execFileAsync(
                    command,
                    args,
                    {
                        cwd: repoRoot,
                        env: process.env,
                    },
                );
            } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                if (!isTransientMintConflict(message) || attempt === 3) {
                    throw error;
                }
                await sleep(4000 * attempt);
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
        release();
    }
}

export async function performLiveDeposit(
    recipientWalletAddress: string,
    options: {
        zkCommitment: string;
        noteCreatedAt?: number;
    },
): Promise<LiveDepositResult> {
    const stealthArgs = generateStealthAddress(recipientWalletAddress);
    const prepared = await prepareCoordinatorDepositParticipant({
        denomination: 100,
        walletAddress: recipientWalletAddress,
        stealthOutputAddress: stealthArgs,
    });
    const repoRoot = findWorkspaceRoot();
    const mintCommand = buildMintCommand(repoRoot, recipientWalletAddress);
    let stdout = '';
    let stderr = '';

    try {
        const result = await runMintCommandSerially(mintCommand.command, mintCommand.args, repoRoot);
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
    const createdAt = options.noteCreatedAt ?? Date.now();

    const poolMembership = await registerCoordinatorDepositCommitment(prepared.pool.sessionId, prepared.participant.participantId, {
        depositTxHash: mintTxHash,
        inputOutPoint,
        commitment,
        blindingFactor,
        zkCommitment: options.zkCommitment,
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

export async function fetchDepositRecoveryByCommitment(zkCommitment: string) {
    const recovery = await fetchCoordinatorDepositRecovery(zkCommitment);
    if (!recovery.found) {
        return {
            status: 'not_found',
            found: false,
        } as const;
    }

    if (recovery.pool.status === 'complete') {
        const finalized = await fetchFinalizedDepositNote(recovery.sessionId, recovery.participantId);
        return {
            ...recovery,
            status: 'finalized',
            note: finalized.status === 'finalized' ? finalized.note : undefined,
        } as const;
    }

    return {
        ...recovery,
        status: recovery.pool.status,
    } as const;
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

    // participant.finalOutputIndex is the absolute index in the CKB transaction.
    // The first `session.participantCount` outputs are change outputs.
    // The relative index within the commitments array is finalOutputIndex - session.participantCount.
    const relativeLeafIndex = participant.finalOutputIndex !== undefined
        ? participant.finalOutputIndex - session.participantCount
        : 0;
    const leafIndex = relativeLeafIndex >= 0 ? relativeLeafIndex : 0;
    const commitment = session.commitments[leafIndex] ?? session.commitments[0];
    const mixedTxHash = participant.finalTxHash ?? participant.depositTxHash;
    const mixedOutPoint = mixedTxHash && participant.finalOutputIndex !== undefined
        ? `${mixedTxHash}:${`0x${participant.finalOutputIndex.toString(16)}`}`
        : participant.inputOutPoint;

    const note = await buildMintedCtNote({
        sessionId: poolId,
        inputOutPoint: mixedOutPoint,
        blindingFactor: participant.blindingFactor,
        secret: '0x' + '00'.repeat(31), // Note: the backend cannot recover the user's secret/nullifier from DB. The client must supply them!
        nullifierSecret: '0x' + '00'.repeat(31),
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
