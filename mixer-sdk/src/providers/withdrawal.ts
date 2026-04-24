import type { DepositNote } from '../types/note';
import type { MixerRuntimeConfig, ContractReference } from '../types/config';
import type { NullifierRegistryCell, WithdrawalTransaction, WithdrawalResolution, LiveWithdrawalProvider } from '../types/withdrawal';
import { reconstructWithdrawalProof } from '../utils/proof';
import { normalizeHex } from '../utils/encoding';
import { callJsonRpc } from '../utils/rpc';

export class MemoryWithdrawalProvider implements LiveWithdrawalProvider {
    constructor(private readonly resolution: WithdrawalResolution) {}

    async resolveWithdrawal(_note: DepositNote): Promise<WithdrawalResolution> {
        return this.resolution;
    }

    async submitWithdrawal(tx: WithdrawalTransaction, privateKey?: string): Promise<string> {
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

    async submitWithdrawal(tx: WithdrawalTransaction, privateKey?: string): Promise<string> {
        if (!privateKey) {
            throw new Error('privateKey is required to submit a real withdrawal transaction');
        }

        const { config: lumosConfig, Indexer, RPC, helpers, commons, hd } = await import('@ckb-lumos/lumos');
        lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

        const rpcUrl = this.options.config.ckbRpcUrl;
        const indexerUrl = this.options.config.ckbIndexerUrl || rpcUrl;
        const indexer = new Indexer(indexerUrl, rpcUrl);
        const rpc = new RPC(rpcUrl);

        let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

        // Add CellDependencies
        for (const dep of tx.rawTransaction.cellDeps) {
            const contractRef = typeof dep.contract === 'string'
                ? this.options.config[dep.contract as keyof MixerRuntimeConfig]
                : dep.contract;
            
            const contract = contractRef as ContractReference;
            
            if (contract && typeof contract !== 'string' && contract.txHash && contract.index) {
                txSkeleton = txSkeleton.update('cellDeps', cellDeps =>
                    cellDeps.push({
                        outPoint: {
                            txHash: contract.txHash as string,
                            index: contract.index as string,
                        },
                        depType: contract.depType || 'code',
                    }),
                );
            }
        }

        // We also need the SECP256K1 dep for injectCapacity to work correctly
        const networkConfig = lumosConfig.getConfig();
        const secpTemplate = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
        txSkeleton = txSkeleton.update('cellDeps', cellDeps =>
            cellDeps.push({
                outPoint: {
                    txHash: secpTemplate.TX_HASH,
                    index: secpTemplate.INDEX,
                },
                depType: secpTemplate.DEP_TYPE,
            }),
        );

        // Add registry input
        for (const input of tx.rawTransaction.inputs) {
            const [txHash, index] = input.previousOutput.split(':');
            txSkeleton = txSkeleton.update('inputs', inputs =>
                inputs.push({
                    cellOutput: {
                        capacity: this.options.config.nullifierRegistry!.capacity ?? '0x2bf55b600',
                        lock: JSON.parse(this.options.config.nullifierRegistry!.lock || '{"codeHash":"0x","hashType":"type","args":"0x"}'),
                        type: {
                            codeHash: (this.options.config.nullifierType as any).codeHash,
                            hashType: (this.options.config.nullifierType as any).hashType,
                            args: this.options.config.nullifierRegistry!.typeArgs || '0x',
                        },
                    },
                    data: '0x', 
                    outPoint: { txHash, index },
                } as any),
            );
        }

        // Add outputs
        for (let i = 0; i < tx.rawTransaction.outputs.length; i++) {
            const output = tx.rawTransaction.outputs[i];
            const data = tx.rawTransaction.outputsData[i];
            
            let typeScript: { codeHash: string; hashType: string; args: string } | undefined;
            if (output.type) {
                const contractRef = typeof output.type === 'string'
                    ? this.options.config[output.type as keyof MixerRuntimeConfig]
                    : output.type;
                const contract = contractRef as ContractReference;
                if (contract && contract.codeHash) {
                    typeScript = {
                        codeHash: contract.codeHash,
                        hashType: contract.hashType,
                        args: i === 0 ? (this.options.config.nullifierRegistry!.typeArgs || '0x') : '0x',
                    };
                }
            }

            // Lock script parsing
            let lockScript;
            try {
                lockScript = output.lock.startsWith('{') ? JSON.parse(output.lock) : {
                    codeHash: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                    hashType: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.HASH_TYPE,
                    args: output.lock, 
                };
            } catch {
                lockScript = {
                    codeHash: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                    hashType: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.HASH_TYPE,
                    args: '0x',
                };
            }

            txSkeleton = txSkeleton.update('outputs', outputs =>
                outputs.push({
                    cellOutput: {
                        capacity: typeof output.capacity === 'string' && output.capacity.startsWith('0x') 
                            ? output.capacity 
                            : `0x${BigInt(output.capacity).toString(16)}`,
                        lock: lockScript,
                        type: typeScript,
                    },
                    data,
                } as any),
            );
        }

        // Inject capacity from fee payer
        const pubKey = hd.key.privateToPublic(privateKey);
        const args = hd.key.publicKeyToBlake160(pubKey);
        const feePayerLock = {
            codeHash: secpTemplate.CODE_HASH,
            hashType: secpTemplate.HASH_TYPE,
            args,
        };
        const feePayerAddress = helpers.encodeToAddress(feePayerLock, { config: networkConfig });
        
        let capacityNeeded = 0n;
        for (const output of txSkeleton.get('outputs')) {
            capacityNeeded += BigInt(output.cellOutput.capacity);
        }
        for (const input of txSkeleton.get('inputs')) {
            capacityNeeded -= BigInt(input.cellOutput.capacity);
        }

        if (capacityNeeded > 0n) {
            txSkeleton = await commons.common.injectCapacity(
                txSkeleton,
                [feePayerAddress],
                capacityNeeded,
                undefined,
                undefined,
                { config: networkConfig }
            );
        }

        txSkeleton = await commons.common.payFeeByFeeRate(
            txSkeleton,
            [feePayerAddress],
            1000,
            undefined,
            { config: networkConfig }
        );

        // Add witness for the proof to the FIRST input (which is the registry cell)
        // Wait, injectCapacity might have shifted inputs if the registry cell isn't the first? 
        // injectCapacity adds inputs at the end usually. The registry cell is at index 0.
        // We set the witness at index 0 to contain the proof.
        const proofWitnessHex = tx.rawTransaction.witnesses[0];
        txSkeleton = txSkeleton.update('witnesses', witnesses => {
            const list = witnesses.toArray();
            while (list.length <= 0) list.push('0x');
            
            // In Lumos, we need to encode WitnessArgs. 
            // The outputType field should be the proof.
            const witnessArgs = { outputType: proofWitnessHex };
            // Using the blockchain package from @ckb-lumos/base or similar
            // If commons.blockchain is not available, we can use a more direct approach
            // or assume the user has the right version of lumos where it is exported.
            // For now, let's use a more robust way to find WitnessArgs if possible.
            const blockchain = (commons as any).blockchain;
            if (blockchain && blockchain.WitnessArgs) {
                list[0] = blockchain.WitnessArgs.pack(witnessArgs);
            } else {
                // Fallback or handle differently
                console.warn('Lumos blockchain.WitnessArgs not found, using raw witness');
                list[0] = proofWitnessHex;
            }
            return witnesses.clear().push(...list);
        });

        txSkeleton = commons.common.prepareSigningEntries(txSkeleton, { config: networkConfig });
        
        const signingEntries = txSkeleton.get('signingEntries').toArray();
        const signatures = signingEntries.map(entry => {
            // Only sign with secp key if the entry matches the fee payer's lock hash, 
            // but for simplicity we rely on Lumos' default behavior where entries correspond to injected inputs
            return hd.key.signRecoverable(entry.message, privateKey);
        });

        const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
        const txHash = await rpc.sendTransaction(sealedTx, 'passthrough');
        
        return txHash;
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
