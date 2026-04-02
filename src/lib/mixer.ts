import { createCommitment, Commitment } from './obscell-adapter';

export interface Participant {
  id: string;
  inputOutPoint: string;
  inputCommitment: Commitment;
  outputStealthAddress: string;
  outputCommitment: Commitment;
  signature?: string;
}

export class MixerSession {
  private participants: Participant[] = [];
  private denomination: number;
  private maxParticipants: number;

  constructor(denomination: number, maxParticipants: number = 5) {
    this.denomination = denomination;
    this.maxParticipants = maxParticipants;
  }

  addParticipant(participant: Participant) {
    if (this.participants.length >= this.maxParticipants) {
      throw new Error("Pool is full");
    }
    this.participants.push(participant);
  }

  isReady(): boolean {
    return this.participants.length === this.maxParticipants;
  }

  getParticipants(): Participant[] {
    return this.participants;
  }

  /**
   * Finalizes the CoinJoin transaction by balancing blinding factors.
   * In a real implementation, the last participant or the coordinator 
   * would adjust the last output's blinding factor to ensure Sum(BF_in) == Sum(BF_out).
   */
  buildTransaction() {
    const inputs = this.participants.map(p => p.inputOutPoint);
    const outputs = this.participants.map(p => p.outputStealthAddress);
    
    // Shuffle outputs to break the index-based link
    const shuffledOutputs = [...outputs].sort(() => Math.random() - 0.5);

    return {
      version: '0x0',
      cellDeps: [],
      headerDeps: [],
      inputs: inputs.map(outpoint => ({ previousOutput: outpoint, since: '0x0' })),
      outputs: shuffledOutputs.map(addr => ({ capacity: '0x0', lock: addr, type: 'ct-token-type' })),
      outputsData: this.participants.map(p => p.outputCommitment.point),
      witnesses: this.participants.map(() => '0x')
    };
  }
}
