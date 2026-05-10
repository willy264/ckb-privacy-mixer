import * as crypto from 'crypto';

// Mock types for CKB SDK compatibility
export interface Cell {
    outPoint: string;
    amount: bigint;
    blindingFactor?: string;
}

export interface Transaction {
    inputs: Array<{ previousOutput: string }>;
    outputs: Array<{ lock: string; capacity: string }>;
    witnesses: string[];
    isSigned: boolean;
}

export type SessionState = 'WAITING' | 'READY' | 'COMPLETED' | 'ABORTED';

export interface DepositSessionSnapshot {
    sessionId: string;
    denomination: bigint;
    participantCount: number;
    requiredParticipants: number;
    participantCommitments: string[];
    participantOutputs: string[];
    status: SessionState;
}

export interface DepositResult {
    sessionId: string;
    participantId: string;
    status: 'pending' | 'confirmed';
    confirmedTxHash?: string;
    participantCommitments: string[];
    stealthOutputAddress: string;
    leafIndex: number;
    inputOutPoint: string;
    note: {
        version: 2;
        sessionId: string;
        inputOutPoint: string;
        blindingFactor: string;
        stealthOutputAddress: string;
        createdAt: number;
        commitment: string;
        sessionCommitments: string[];
        leafIndex: number;
        depositTxHash?: string;
        runtimeMode: 'preview' | 'live';
        proofEncoding: 'groth16-bn254-arkworks-uncompressed-v1';
        registrySnapshot?: any;
    };
    session: DepositSessionSnapshot;
}

export interface MixParticipant {
    id: string;
    ctInputCell: Cell;
    stealthOutputAddress: string;
    commitment?: string;
    signature?: string;
}

/** Generate a cryptographically secure random hex ID. */
function cryptoRandomId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

/** Fisher-Yates shuffle using a CSPRNG for unbiased output ordering. */
function secureShuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export class MixSession {
    public id: string;
    public denomination: bigint;
    public minParticipants: number;
    public participants: MixParticipant[] = [];
    public state: SessionState = 'WAITING';
    private creationTime: number;
    private readonly TIMEOUT_MS = 5 * 60 * 1000;

    constructor(id: string, denomination: bigint, minParticipants: number) {
        this.id = id;
        this.denomination = denomination;
        this.minParticipants = minParticipants;
        this.creationTime = Date.now();
    }

    public static createSession(denomination: bigint, minParticipants: number): MixSession {
        const id = cryptoRandomId('session');
        return new MixSession(id, denomination, minParticipants);
    }

    public joinSession(ctInputCell: Cell, stealthOutputAddress: string): string {
        this.checkTimeout();
        if (this.state !== 'WAITING') {
            throw new Error(`Cannot join session in state: ${this.state}`);
        }

        if (ctInputCell.amount !== this.denomination) {
            throw new Error(`Invalid denomination. Expected ${this.denomination}`);
        }

        const participantId = cryptoRandomId('p');
        this.participants.push({
            id: participantId,
            ctInputCell,
            stealthOutputAddress,
        });

        if (this.participants.length >= this.minParticipants) {
            this.state = 'READY';
        }

        return participantId;
    }

    public buildTransaction(): Transaction {
        this.checkTimeout();
        if (this.state !== 'READY') {
            throw new Error(`Session not ready. Current state: ${this.state}`);
        }

        const shuffledParticipants = secureShuffleArray(this.participants);

        return {
            inputs: this.participants.map(participant => ({
                previousOutput: participant.ctInputCell.outPoint,
            })),
            outputs: shuffledParticipants.map(participant => ({
                lock: participant.stealthOutputAddress,
                capacity: '1000',
            })),
            witnesses: this.participants.map(() => '0x'),
            isSigned: false,
        };
    }

    public signAndSubmit(privateKey: string, participantId: string): Transaction | null {
        this.checkTimeout();
        if (this.state !== 'READY') {
            throw new Error('Cannot sign unless session is READY');
        }

        const participant = this.participants.find(item => item.id === participantId);
        if (!participant) {
            throw new Error('Participant not found');
        }

        participant.signature = `0x_sig_${privateKey.substring(0, 4)}`;

        const allSigned = this.participants.every(item => !!item.signature);
        if (allSigned) {
            this.state = 'COMPLETED';
            const tx = this.buildTransaction();
            tx.isSigned = true;
            return tx;
        }

        return null;
    }

    public checkSessionStatus(): SessionState {
        this.checkTimeout();
        return this.state;
    }

    public getSnapshot(): DepositSessionSnapshot {
        return {
            sessionId: this.id,
            denomination: this.denomination,
            participantCount: this.participants.length,
            requiredParticipants: this.minParticipants,
            participantCommitments: this.participants.map(participant => participant.commitment ?? ''),
            participantOutputs: this.participants.map(participant => participant.stealthOutputAddress),
            status: this.state,
        };
    }

    private checkTimeout() {
        if ((this.state === 'WAITING' || this.state === 'READY') && Date.now() - this.creationTime > this.TIMEOUT_MS) {
            this.state = 'ABORTED';
        }
    }
}
