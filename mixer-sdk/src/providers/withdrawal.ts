import type { DepositNote } from '../types/note';
import type { MixerRuntimeConfig } from '../types/config';
import type { NullifierRegistryCell, WithdrawalTransaction } from '../types/withdrawal';
import type { LocalWithdrawalProofResult } from '../utils/proof';

export interface WithdrawalResolution {
    config: Partial<MixerRuntimeConfig>;
    registryCell: NullifierRegistryCell;
    proof: LocalWithdrawalProofResult;
}

export interface LiveWithdrawalProvider {
    resolveWithdrawal(note: DepositNote): Promise<WithdrawalResolution>;
    submitWithdrawal?(tx: WithdrawalTransaction): Promise<string>;
}

export class MemoryWithdrawalProvider implements LiveWithdrawalProvider {
    constructor(private readonly resolution: WithdrawalResolution) {}

    async resolveWithdrawal(_note: DepositNote): Promise<WithdrawalResolution> {
        return this.resolution;
    }

    async submitWithdrawal(tx: WithdrawalTransaction): Promise<string> {
        return `0xsubmitted_${tx.nullifier.slice(0, 56)}`;
    }
}
