import type { DepositNote } from '../types/note';
import type { MixerRuntimeConfig } from '../types/config';
import type { NullifierRegistryCell, WithdrawalTransaction } from '../types/withdrawal';
import type { LocalWithdrawalProofResult } from '../utils/proof';
import { reconstructWithdrawalProof } from '../utils/proof';
import { normalizeHex } from '../utils/encoding';

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

export interface EnvBackedWithdrawalProviderOptions {
    config: MixerRuntimeConfig;
    denomination?: bigint;
}

export class AggronWithdrawalProvider implements LiveWithdrawalProvider {
    private readonly denomination: bigint;

    constructor(private readonly options: EnvBackedWithdrawalProviderOptions) {
        this.denomination = options.denomination ?? 100n;
    }

    async resolveWithdrawal(note: DepositNote): Promise<WithdrawalResolution> {
        const { config } = this.options;
        if (!config.nullifierRegistry) {
            throw new Error(
                'Missing NULLIFIER_REGISTRY_TX_HASH / NULLIFIER_REGISTRY_INDEX in runtime config. ' +
                'Deploy and initialize the nullifier registry cell first.',
            );
        }

        const proof = reconstructWithdrawalProof(note, this.denomination);
        return {
            config,
            registryCell: {
                outPoint: `${config.nullifierRegistry.txHash}:${config.nullifierRegistry.index}`,
                nullifiers: (config.nullifierRegistry.nullifiers ?? []).map(normalizeHex),
                lock: config.nullifierRegistry.lock,
                capacity: config.nullifierRegistry.capacity,
            },
            proof,
        };
    }

    async submitWithdrawal(tx: WithdrawalTransaction): Promise<string> {
        return `0xsubmitted_${tx.nullifier.slice(0, 56)}`;
    }
}
