import type { DepositNote } from '../types/note';
import type { MixerRuntimeConfig } from '../types/config';
import type { NullifierRegistryCell, WithdrawalTransaction } from '../types/withdrawal';
import type { LocalWithdrawalProofResult } from '../utils/proof';
import { reconstructWithdrawalProof } from '../utils/proof';
import { normalizeHex } from '../utils/encoding';
import { callJsonRpc } from '../utils/rpc';

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
        const registryCell = await this.loadRegistryCell(config);
        return {
            config,
            registryCell,
            proof,
        };
    }

    async submitWithdrawal(tx: WithdrawalTransaction): Promise<string> {
        return `0xsubmitted_${tx.nullifier.slice(0, 56)}`;
    }

    private async loadRegistryCell(config: MixerRuntimeConfig): Promise<NullifierRegistryCell> {
        const registryRef = config.nullifierRegistry!;
        if (registryRef.nullifiers && registryRef.nullifiers.length > 0) {
            return {
                outPoint: `${registryRef.txHash}:${registryRef.index}`,
                nullifiers: registryRef.nullifiers.map(normalizeHex),
                lock: registryRef.lock,
                capacity: registryRef.capacity,
                typeArgs: registryRef.typeArgs,
            };
        }

        const liveCell = await callJsonRpc<{
            cell: {
                data: {
                    content: string;
                };
                output: {
                    capacity: string;
                    lock: unknown;
                };
            } | null;
            status: string;
        }>(config.ckbRpcUrl, 'get_live_cell', [
            {
                tx_hash: registryRef.txHash,
                index: registryRef.index,
            },
            true,
        ]);

        if (!liveCell.cell || liveCell.status !== 'live') {
            throw new Error(
                `Nullifier registry cell ${registryRef.txHash}:${registryRef.index} is not live on ${config.ckbRpcUrl}`,
            );
        }

        const dataHex = liveCell.cell.data.content;
        const nullifiers = parseRegistryNullifiers(dataHex);
        return {
            outPoint: `${registryRef.txHash}:${registryRef.index}`,
            nullifiers,
            lock: registryRef.lock ?? JSON.stringify(liveCell.cell.output.lock),
            capacity: registryRef.capacity ?? liveCell.cell.output.capacity,
            typeArgs: registryRef.typeArgs,
        };
    }
}

function parseRegistryNullifiers(dataHex: string): string[] {
    const normalized = normalizeHex(dataHex);
    if (normalized.length < 8) {
        throw new Error(`Invalid nullifier registry data: ${dataHex}`);
    }

    const count = Number.parseInt(normalized.slice(0, 8), 16);
    if (Number.isNaN(count)) {
        throw new Error(`Invalid nullifier registry count: ${dataHex}`);
    }

    const expectedLength = 8 + count * 64;
    if (normalized.length !== expectedLength) {
        throw new Error(
            `Nullifier registry data length mismatch. Expected ${expectedLength} hex chars, got ${normalized.length}`,
        );
    }

    const nullifiers: string[] = [];
    for (let i = 0; i < count; i += 1) {
        const start = 8 + i * 64;
        nullifiers.push(normalized.slice(start, start + 64));
    }
    return nullifiers;
}
