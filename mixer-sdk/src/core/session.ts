// Mock types for CKB SDK compatibility
export interface Cell {
    outPoint: string;
    amount: bigint;
    blindingFactor?: string; // used for testing mock
}

export interface Transaction {
    inputs: any[];
    outputs: any[];
    witnesses: string[];
    isSigned: boolean;
}

export type SessionState = 'WAITING' | 'READY' | 'COMPLETED' | 'ABORTED';

export interface MixParticipant {
    id: string;
    ctInputCell: Cell;
    stealthOutputAddress: string;
    signature?: string;
}

export class MixSession {
    public id: string;
    public denomination: bigint;
    public minParticipants: number;
    public participants: MixParticipant[] = [];
    public state: SessionState = 'WAITING';
    private creationTime: number;
    private readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    
    constructor(id: string, denomination: bigint, minParticipants: number) {
        this.id = id;
        this.denomination = denomination;
        this.minParticipants = minParticipants;
        this.creationTime = Date.now();
    }

    public static createSession(denomination: bigint, minParticipants: number): MixSession {
        const id = `session_${Math.random().toString(36).substring(7)}`;
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

        const participantId = `p_${Math.random().toString(36).substring(7)}`;
        this.participants.push({
            id: participantId,
            ctInputCell,
            stealthOutputAddress
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

        // Output shuffling is required for anonymity
        const shuffledParticipants = [...this.participants].sort(() => Math.random() - 0.5);

        const tx: Transaction = {
            inputs: this.participants.map(p => ({
                previousOutput: p.ctInputCell.outPoint
            })),
            outputs: shuffledParticipants.map(p => ({
                lock: p.stealthOutputAddress,
                capacity: '1000'
            })),
            witnesses: this.participants.map(() => '0x'), // Placeholder for signatures
            isSigned: false
        };

        return tx;
    }

    public signAndSubmit(privateKey: string, participantId: string): Transaction | null {
        this.checkTimeout();
        if (this.state !== 'READY') {
            throw new Error("Cannot sign unless session is READY");
        }

        const participant = this.participants.find(p => p.id === participantId);
        if (!participant) {
            throw new Error("Participant not found");
        }

        // Mock signing process
        participant.signature = `0x_sig_${privateKey.substring(0, 4)}`;

        // If all signed, submit
        const allSigned = this.participants.every(p => !!p.signature);
        if (allSigned) {
            this.state = 'COMPLETED';
            const tx = this.buildTransaction();
            tx.isSigned = true;
            return tx;
        }

        return null; // Waiting for others
    }

    public checkSessionStatus(): SessionState {
        this.checkTimeout();
        return this.state;
    }

    private checkTimeout() {
        if (this.state === 'WAITING' || this.state === 'READY') {
            if (Date.now() - this.creationTime > this.TIMEOUT_MS) {
                this.state = 'ABORTED';
            }
        }
    }
}
