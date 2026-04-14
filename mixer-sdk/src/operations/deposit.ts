import { MixSession, Cell } from '../core/session';

// In-memory session registry (no server needed for Phase 2)
const ACTIVE_SESSIONS: MixSession[] = [];

export interface JoinMixParams {
    ctInputCell: Cell;
    stealthOutputAddress: string;
    privateKey: string;
}

export async function joinMix(params: JoinMixParams): Promise<string> {
    const { ctInputCell, stealthOutputAddress, privateKey } = params;
    const denomination = ctInputCell.amount;

    // Find or create a WAITING session for this denomination
    let session = ACTIVE_SESSIONS.find(
        s => s.denomination === denomination && s.state === 'WAITING'
    );
    if (!session) {
        session = MixSession.createSession(denomination, 3);
        ACTIVE_SESSIONS.push(session);
    }

    const participantId = session.joinSession(ctInputCell, stealthOutputAddress);
    console.log(`[${session.id}] Joined as ${participantId}. Pool: ${session.participants.length}/${session.minParticipants}`);

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
                    if (tx) {
                        console.log(`[${session!.id}] Transaction finalized.`);
                        resolve('0x_mock_tx_hash_' + session!.id);
                    } else {
                        resolve('0x_mock_tx_pending_others_' + participantId);
                    }
                } catch (e) {
                    reject(e);
                }
            }
        }, 100);
    });
}
