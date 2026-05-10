import { MixSession, type Cell, type DepositResult } from '../core/session';
import { deriveCommitment, randomBlindingFactor } from '../utils/crypto';
import { generateStealthAddress } from '../utils/stealth';

const ACTIVE_SESSIONS: MixSession[] = [];
const MAX_ACTIVE_SESSIONS = 100;

/** Remove completed/aborted sessions to prevent unbounded memory growth. */
function pruneFinishedSessions() {
    for (let i = ACTIVE_SESSIONS.length - 1; i >= 0; i--) {
        const state = ACTIVE_SESSIONS[i].checkSessionStatus();
        if (state === 'COMPLETED' || state === 'ABORTED') {
            ACTIVE_SESSIONS.splice(i, 1);
        }
    }
}

export interface JoinMixParams {
    ctInputCell: Cell;
    stealthOutputAddress: string;
    privateKey: string;
    runtimeMode?: 'preview' | 'live';
    sessionMinParticipants?: number;
}

async function inflatePreviewSession(session: MixSession) {
    while (session.participants.length < session.minParticipants) {
        const peerId = session.joinSession(
            {
                outPoint: `0x_preview_peer_${session.participants.length}_${Date.now().toString(16)}`,
                amount: session.denomination,
                blindingFactor: randomBlindingFactor(),
            },
            generateStealthAddress(`preview_peer_${session.participants.length}`),
        );
        const peer = session.participants.find(item => item.id === peerId);
        if (!peer) {
            throw new Error('Preview participant registration failed');
        }
        peer.commitment = await deriveCommitment(
            peer.ctInputCell.blindingFactor ?? randomBlindingFactor(),
            session.id,
        );
        peer.signature = '0x_preview_signature';
    }
}

export async function joinMix(params: JoinMixParams): Promise<DepositResult> {
    const {
        ctInputCell,
        stealthOutputAddress,
        privateKey,
        runtimeMode = 'preview',
        sessionMinParticipants = 3,
    } = params;
    const denomination = ctInputCell.amount;
    const blindingFactor = ctInputCell.blindingFactor ?? randomBlindingFactor();

    let session = ACTIVE_SESSIONS.find(
        item => item.denomination === denomination && item.state === 'WAITING',
    );
    if (!session) {
        pruneFinishedSessions();
        if (ACTIVE_SESSIONS.length >= MAX_ACTIVE_SESSIONS) {
            throw new Error(`Too many active sessions (max ${MAX_ACTIVE_SESSIONS}). Try again later.`);
        }
        session = MixSession.createSession(denomination, sessionMinParticipants);
        ACTIVE_SESSIONS.push(session);
    }

    const participantId = session.joinSession(ctInputCell, stealthOutputAddress);
    const participant = session.participants.find(item => item.id === participantId);
    if (!participant) {
        throw new Error('Participant registration failed');
    }

    const commitment = await deriveCommitment(blindingFactor, session.id);
    participant.commitment = commitment;

    if (runtimeMode === 'preview') {
        await inflatePreviewSession(session);
    }

    console.log(
        `[${session.id}] Joined as ${participantId}. Pool: ${session.participants.length}/${session.minParticipants}`,
    );

    return new Promise((resolve, reject) => {
        const poll = setInterval(() => {
            const status = session!.checkSessionStatus();

            if (status === 'ABORTED') {
                clearInterval(poll);
                reject(new Error('Session aborted due to timeout. Your funds are safe.'));
                return;
            }

            if (status === 'READY' || status === 'COMPLETED') {
                clearInterval(poll);
                try {
                    const tx = session!.signAndSubmit(privateKey, participantId);
                    const participantCommitments = session!.participants.map(item => item.commitment ?? '');
                    const leafIndex = participantCommitments.findIndex(value => value === commitment);
                    const confirmedTxHash = tx
                        ? `0x_mock_tx_hash_${session!.id}`
                        : `0x_mock_tx_pending_others_${participantId}`;
                    const note = {
                        version: 2 as const,
                        sessionId: session!.id,
                        inputOutPoint: ctInputCell.outPoint,
                        blindingFactor,
                        stealthOutputAddress,
                        createdAt: Date.now(),
                        commitment,
                        sessionCommitments: participantCommitments,
                        leafIndex,
                        depositTxHash: tx ? confirmedTxHash : undefined,
                        runtimeMode,
                        proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1' as const,
                    };

                    resolve({
                        sessionId: session!.id,
                        participantId,
                        status: tx ? 'confirmed' : 'pending',
                        confirmedTxHash,
                        participantCommitments,
                        stealthOutputAddress,
                        leafIndex,
                        inputOutPoint: ctInputCell.outPoint,
                        note,
                        session: session!.getSnapshot(),
                    });
                } catch (error) {
                    reject(error);
                }
            }
        }, 100);
    });
}
