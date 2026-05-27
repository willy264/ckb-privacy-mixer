import { serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';
import type { DepositNote } from '../types/note';
import type { MixerRuntimeConfig, ContractReference } from '../types/config';
import type {
    CkbCellDep,
    CkbScript,
    CkbTransaction,
    JoyIdSigningRequest,
    NullifierRegistryCell,
    WithdrawalTransaction,
    WithdrawalResolution,
    LiveWithdrawalProvider,
} from '../types/withdrawal';
import { reconstructWithdrawalProof } from '../utils/proof';
import { normalizeHex } from '../utils/encoding';
import { callJsonRpc } from '../utils/rpc';

function parseOutPoint(value: string) {
    const [txHash, index] = value.split(':');
    if (!txHash || !index) {
        throw new Error(`Invalid out point reference: ${value}`);
    }

    return { txHash, index };
}

function serializeProofWitness(outputType: string): string {
    return serializeWitnessArgs({
        lock: '0x',
        inputType: '0x',
        outputType,
    });
}

function serializeEmptyLockWitness(): string {
    return serializeWitnessArgs({
        lock: '0x',
        inputType: '0x',
        outputType: '0x',
    });
}

function normalizeCapacity(capacity: string): string {
    return capacity.startsWith('0x') ? capacity : `0x${BigInt(capacity).toString(16)}`;
}

function isAddressLike(value: string): boolean {
    return value.startsWith('ckb1') || value.startsWith('ckt1');
}

function sameScript(left: CkbScript, right: CkbScript): boolean {
    return left.codeHash === right.codeHash && left.hashType === right.hashType && left.args === right.args;
}

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

        const proof = await reconstructWithdrawalProof(note, this.denomination);
        const registryCell = await this.loadRegistryCell(config);
        note.runtimeMode = config.runtimeMode;
        note.registrySnapshot = {
            outPoint: registryCell.outPoint,
            size: registryCell.nullifiers.length,
            authority: config.withdrawalAuthority,
        };
        return {
            config,
            registryCell,
            proof,
        };
    }

    async prepareJoyIdSigningRequest(
        tx: WithdrawalTransaction,
        signerAddress: string,
    ): Promise<JoyIdSigningRequest> {
        const { txSkeleton, helpers, networkConfig } = await this.buildSkeletonWithFeePayer(tx, signerAddress);
        const signerLock = helpers.parseAddress(signerAddress, { config: networkConfig }) as CkbScript;
        const inputs = txSkeleton.get('inputs').toArray();
        const witnessIndexes = inputs.reduce<number[]>((indexes, input, index) => {
            const inputLock = input.cellOutput.lock as CkbScript;
            if (sameScript(inputLock, signerLock)) {
                indexes.push(index);
            }
            return indexes;
        }, []);

        if (witnessIndexes.length === 0) {
            throw new Error('The connected JoyID address does not control any withdrawal inputs.');
        }

        if (witnessIndexes.length !== inputs.length) {
            throw new Error(
                'The connected JoyID address does not control the nullifier registry cell lock, so browser-side live broadcast cannot complete.',
            );
        }

        return {
            transaction: helpers.createTransactionFromSkeleton(txSkeleton) as CkbTransaction,
            witnessIndexes,
            signerAddress,
        };
    }

    async broadcastSignedWithdrawal(tx: CkbTransaction): Promise<string> {
        const { config: lumosConfig, RPC } = await import('@ckb-lumos/lumos');
        lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

        const rpc = new RPC(this.options.config.ckbRpcUrl);
        return rpc.sendTransaction(tx as any, 'passthrough');
    }

    async submitWithdrawal(tx: WithdrawalTransaction, privateKey?: string): Promise<string> {
        if (!privateKey) {
            throw new Error('privateKey is required to submit a real withdrawal transaction');
        }

        const { config: lumosConfig, RPC, helpers, commons, hd } = await import('@ckb-lumos/lumos');
        lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);
        const networkConfig = lumosConfig.getConfig();
        const secpTemplate = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
        const pubKey = hd.key.privateToPublic(privateKey);
        const args = hd.key.publicKeyToBlake160(pubKey);
        const feePayerLock = {
            codeHash: secpTemplate.CODE_HASH,
            hashType: secpTemplate.HASH_TYPE,
            args,
        };
        const feePayerAddress = helpers.encodeToAddress(feePayerLock, { config: networkConfig });
        let { txSkeleton } = await this.buildSkeletonWithFeePayer(tx, feePayerAddress);

        txSkeleton = commons.common.prepareSigningEntries(txSkeleton, { config: networkConfig });
        
        const signingEntries = txSkeleton.get('signingEntries').toArray();
        const signatures = signingEntries.map(entry => {
            // Only sign with secp key if the entry matches the fee payer's lock hash, 
            // but for simplicity we rely on Lumos' default behavior where entries correspond to injected inputs
            return hd.key.signRecoverable(entry.message, privateKey);
        });

        const sealedTx = helpers.sealTransaction(txSkeleton, signatures);
        const rpc = new RPC(this.options.config.ckbRpcUrl);
        const txHash = await rpc.sendTransaction(sealedTx, 'passthrough');
        
        return txHash;
    }

    private async buildSkeletonWithFeePayer(tx: WithdrawalTransaction, feePayerAddress: string) {
        const { config: lumosConfig, Indexer, helpers, commons } = await import('@ckb-lumos/lumos');
        lumosConfig.initializeConfig(lumosConfig.predefined.AGGRON4);

        const rpcUrl = this.options.config.ckbRpcUrl;
        const indexerUrl = this.options.config.ckbIndexerUrl || rpcUrl;
        const networkConfig = lumosConfig.getConfig();
        const indexer = new Indexer(indexerUrl, rpcUrl);

        let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
        txSkeleton = this.attachCellDeps(txSkeleton, tx, networkConfig);
        txSkeleton = this.attachInputs(txSkeleton, tx, helpers, networkConfig);
        txSkeleton = this.attachOutputs(txSkeleton, tx, helpers, networkConfig);

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
                { config: networkConfig },
            );
        }

        txSkeleton = await commons.common.payFeeByFeeRate(
            txSkeleton,
            [feePayerAddress],
            1000,
            undefined,
            { config: networkConfig },
        );

        txSkeleton = this.attachWitnesses(txSkeleton, tx.rawTransaction.witnesses[0]);
        return { txSkeleton, helpers, networkConfig };
    }

    private attachCellDeps(txSkeleton: any, tx: WithdrawalTransaction, networkConfig: any) {
        for (const dep of tx.rawTransaction.cellDeps) {
            const contractRef = typeof dep.contract === 'string'
                ? this.options.config[dep.contract as keyof MixerRuntimeConfig]
                : dep.contract;
            const contract = contractRef as ContractReference | undefined;

            if (contract?.txHash && contract.index) {
                txSkeleton = this.pushCellDep(txSkeleton, {
                    outPoint: {
                        txHash: contract.txHash,
                        index: contract.index,
                    },
                    depType: contract.depType || 'code',
                });
            }
        }

        const secpTemplate = networkConfig.SCRIPTS.SECP256K1_BLAKE160!;
        txSkeleton = this.pushCellDep(txSkeleton, {
            outPoint: {
                txHash: secpTemplate.TX_HASH,
                index: secpTemplate.INDEX,
            },
            depType: secpTemplate.DEP_TYPE,
        });

        return txSkeleton;
    }

    private attachInputs(txSkeleton: any, tx: WithdrawalTransaction, helpers: any, networkConfig: any) {
        for (const input of tx.rawTransaction.inputs) {
            const outPoint = parseOutPoint(input.previousOutput);
            txSkeleton = txSkeleton.update('inputs', (inputs: any) =>
                inputs.push({
                    cellOutput: {
                        capacity: this.options.config.nullifierRegistry!.capacity ?? '0x2bf55b600',
                        lock: this.parseRegistryLock(helpers, networkConfig),
                        type: {
                            codeHash: (this.options.config.nullifierType as ContractReference).codeHash,
                            hashType: (this.options.config.nullifierType as ContractReference).hashType,
                            args: this.options.config.nullifierRegistry!.typeArgs || '0x',
                        },
                    },
                    data: '0x',
                    outPoint,
                } as any),
            );
        }

        return txSkeleton;
    }

    private attachOutputs(txSkeleton: any, tx: WithdrawalTransaction, helpers: any, networkConfig: any) {
        for (let i = 0; i < tx.rawTransaction.outputs.length; i += 1) {
            const output = tx.rawTransaction.outputs[i];
            const data = tx.rawTransaction.outputsData[i];

            txSkeleton = txSkeleton.update('outputs', (outputs: any) =>
                outputs.push({
                    cellOutput: {
                        capacity: normalizeCapacity(output.capacity),
                        lock: this.resolveLockScript(output.lock, helpers, networkConfig),
                        type: this.resolveTypeScript(output.type, i),
                    },
                    data,
                } as any),
            );
        }

        return txSkeleton;
    }

    private attachWitnesses(txSkeleton: any, proofWitnessHex: string) {
        const inputCount = txSkeleton.get('inputs').size;
        const proofWitness = serializeProofWitness(proofWitnessHex);
        const emptyWitness = serializeEmptyLockWitness();

        return txSkeleton.update('witnesses', (witnesses: any) => {
            const list = witnesses.toArray();
            while (list.length < inputCount) {
                list.push('0x');
            }

            list[0] = proofWitness;
            for (let i = 1; i < inputCount; i += 1) {
                if (!list[i] || list[i] === '0x') {
                    list[i] = emptyWitness;
                }
            }

            return witnesses.clear().push(...list);
        });
    }

    private pushCellDep(txSkeleton: any, cellDep: CkbCellDep) {
        const key = `${cellDep.outPoint.txHash}:${cellDep.outPoint.index}:${cellDep.depType}`;
        const existing = txSkeleton.get('cellDeps').some((dep: any) => {
            const depKey = `${dep.outPoint.txHash}:${dep.outPoint.index}:${dep.depType}`;
            return depKey === key;
        });

        if (existing) {
            return txSkeleton;
        }

        return txSkeleton.update('cellDeps', (cellDeps: any) => cellDeps.push(cellDep));
    }

    private parseRegistryLock(helpers: any, networkConfig: any): CkbScript {
        const raw = this.options.config.nullifierRegistry?.lock;
        if (!raw) {
            return { codeHash: '0x', hashType: 'type', args: '0x' };
        }

        if (raw.startsWith('{')) {
            return JSON.parse(raw) as CkbScript;
        }

        if (isAddressLike(raw)) {
            return helpers.parseAddress(raw, { config: networkConfig }) as CkbScript;
        }

        if (raw.startsWith('0x')) {
            return {
                codeHash: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                hashType: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.HASH_TYPE,
                args: raw,
            };
        }

        throw new Error('Unable to resolve NULLIFIER_REGISTRY_LOCK into a lock script.');
    }

    private resolveTypeScript(contractRef: ContractReference | string | undefined, outputIndex: number): CkbScript | undefined {
        if (!contractRef) {
            return undefined;
        }

        const resolved = typeof contractRef === 'string'
            ? this.options.config[contractRef as keyof MixerRuntimeConfig]
            : contractRef;
        const contract = resolved as ContractReference | undefined;
        if (!contract?.codeHash) {
            return undefined;
        }

        return {
            codeHash: contract.codeHash,
            hashType: contract.hashType,
            args: outputIndex === 0 ? (this.options.config.nullifierRegistry!.typeArgs || '0x') : '0x',
        };
    }

    private resolveLockScript(lock: string, helpers: any, networkConfig: any): CkbScript {
        const trimmed = lock.trim();
        if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed) as CkbScript;
        }

        if (isAddressLike(trimmed)) {
            return helpers.parseAddress(trimmed, { config: networkConfig }) as CkbScript;
        }

        if (trimmed.startsWith('0x')) {
            return {
                codeHash: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.CODE_HASH,
                hashType: networkConfig.SCRIPTS.SECP256K1_BLAKE160!.HASH_TYPE,
                args: trimmed,
            };
        }

        if (trimmed === 'always_success') {
            return {
                codeHash: '0x28e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a5', // Testnet always_success
                hashType: 'type',
                args: '0x',
            };
        }

        throw new Error(`Unable to resolve lock script from value: ${lock}`);
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

    // On-chain format is u32 LE — swap byte pairs before parsing as big-endian hex.
    // e.g. LE bytes [03, 00, 00, 00] → hex "03000000" → swap to "00000003" → parseInt = 3
    const leHex = normalized.slice(0, 8);
    const beHex =
        leHex.slice(6, 8) +
        leHex.slice(4, 6) +
        leHex.slice(2, 4) +
        leHex.slice(0, 2);
    const count = Number.parseInt(beHex, 16);
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
