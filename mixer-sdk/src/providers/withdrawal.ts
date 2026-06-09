import { serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';
import { ccc } from '@ckb-ccc/core';
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

function parseOutPoint(value: string) {
    const [txHash, index] = value.split(':');
    if (!txHash || !index) {
        throw new Error(`Invalid out point reference: ${value}`);
    }

    return { txHash, index };
}

function serializeProofWitness(outputType: string): string {
    return serializeWitnessArgs({
        lock: '0x' + '00'.repeat(65),
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

function createCccClient(config: MixerRuntimeConfig) {
    return new ccc.ClientPublicTestnet({
        url: config.ckbRpcUrl,
    });
}

async function parseAddressScriptWithCcc(address: string, config: MixerRuntimeConfig): Promise<CkbScript> {
    const client = createCccClient(config);
    const resolved = await ccc.Address.fromString(address, client);
    const hashType = resolved.script.hashType === 'data2'
        ? 'data1'
        : resolved.script.hashType;
    return {
        codeHash: resolved.script.codeHash,
        hashType,
        args: resolved.script.args,
    };
}

async function getKnownSecpCellDep(config: MixerRuntimeConfig): Promise<CkbCellDep> {
    const client = createCccClient(config);
    const scriptInfo = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
    const cellDepInfo = scriptInfo.cellDeps[0];
    return {
        outPoint: {
            txHash: cellDepInfo.cellDep.outPoint.txHash,
            index: `0x${cellDepInfo.cellDep.outPoint.index.toString(16)}`,
        },
        depType: cellDepInfo.cellDep.depType,
    };
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
        const { cccTx, client } = await this.buildNativeCccTxWithFeePayer(tx, signerAddress);
        const signerLock = (await ccc.Address.fromString(signerAddress, client)).script;
        const inputs = cccTx.inputs;

        const witnessIndexes = [];
        for (let i = 0; i < inputs.length; i++) {
            const cell = await client.getCell(inputs[i].previousOutput!);
            if (!cell) throw new Error(`Cell not found for input ${i}`);
            const inputLock = cell.cellOutput.lock;
            if (inputLock.eq(signerLock)) {
                witnessIndexes.push(i);
            }
        }

        if (witnessIndexes.length === 0) {
            throw new Error('The connected JoyID address does not control any withdrawal inputs.');
        }

        return {
            transaction: cccTx as any,
            witnessIndexes,
            signerAddress,
        };
    }

    async broadcastSignedWithdrawal(tx: CkbTransaction): Promise<string> {
        const client = createCccClient(this.options.config);
        return client.sendTransaction(ccc.Transaction.from(tx as any));
    }

    async submitWithdrawal(tx: WithdrawalTransaction, privateKey?: string): Promise<string> {
        if (!privateKey) {
            throw new Error('privateKey is required to submit a real withdrawal transaction');
        }

        const client = createCccClient(this.options.config);
        const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
        const feePayerAddress = await signer.getRecommendedAddress();
        
        const { cccTx } = await this.buildNativeCccTxWithFeePayer(tx, feePayerAddress);
        return signer.sendTransaction(cccTx);
    }

    private async buildNativeCccTxWithFeePayer(tx: WithdrawalTransaction, feePayerAddress: string): Promise<{ cccTx: ccc.Transaction, client: ccc.Client }> {
        const client = createCccClient(this.options.config);
        const cccTx = ccc.Transaction.from({});
        
        for (const dep of tx.rawTransaction.cellDeps) {
            const contractRef = typeof dep.contract === 'string'
                ? this.options.config[dep.contract as keyof MixerRuntimeConfig]
                : dep.contract;
            const contract = contractRef as ContractReference | undefined;

            if (contract?.txHash && contract.index) {
                cccTx.addCellDeps({
                    outPoint: {
                        txHash: contract.txHash,
                        index: ccc.numToHex(contract.index),
                    },
                    depType: contract.depType || 'code',
                });
            }
        }
        cccTx.addCellDeps(await getKnownSecpCellDep(this.options.config));

        for (const input of tx.rawTransaction.inputs) {
            const outPoint = parseOutPoint(input.previousOutput);
            const cccOutPoint = {
                txHash: outPoint.txHash,
                index: ccc.numFrom(outPoint.index),
            };
            const liveCell = await client.getCellLive(cccOutPoint);
            if (!liveCell) {
                throw new Error(`Input cell ${input.previousOutput} is not live or cannot be found`);
            }
            cccTx.addInput({
                previousOutput: {
                    txHash: cccOutPoint.txHash,
                    index: ccc.numToHex(cccOutPoint.index),
                },
                since: '0x0',
                cellOutput: liveCell.cellOutput,
            });
        }

        for (let i = 0; i < tx.rawTransaction.outputs.length; i += 1) {
            const output = tx.rawTransaction.outputs[i];
            const data = tx.rawTransaction.outputsData[i];

            cccTx.addOutput({
                capacity: ccc.numFrom(output.capacity),
                lock: await this.resolveLockScriptToCcc(output.lock, client),
                type: this.resolveTypeScriptToCcc(output.type, i),
            }, ccc.hexFrom(data));
        }

        // Fix output capacities: CKB requires each cell's capacity >= its occupied bytes.
        // The withdrawal builder uses placeholder values ('1000') for some outputs.
        // We must calculate the real minimum capacity for each output after scripts are resolved.
        for (let i = 0; i < cccTx.outputs.length; i++) {
            const output = cccTx.outputs[i];
            const outputData = cccTx.outputsData[i] ?? '0x';
            // Calculate minimum occupied capacity: 8 (capacity) + lock script + type script + data
            let occupiedBytes = 8n; // capacity field itself
            // Lock script: code_hash(32) + hash_type(1) + args_len
            if (output.lock) {
                occupiedBytes += 32n + 1n + BigInt(ccc.bytesFrom(output.lock.args).length);
            }
            // Type script: code_hash(32) + hash_type(1) + args_len
            if (output.type) {
                occupiedBytes += 32n + 1n + BigInt(ccc.bytesFrom(output.type.args).length);
            }
            // Data
            if (outputData && outputData !== '0x') {
                occupiedBytes += BigInt(ccc.bytesFrom(outputData).length);
            }
            const minCapacity = occupiedBytes * 100000000n; // 1 CKB = 1 byte of cell space
            const currentCapacity = ccc.numFrom(output.capacity);
            if (currentCapacity < minCapacity) {
                output.capacity = minCapacity;
            }
        }

        const feePayerObj = await ccc.Address.fromString(feePayerAddress, client);
        const dummySigner = new ccc.SignerCkbScriptReadonly(client, feePayerObj.script);

        const proofWitness = serializeProofWitness(tx.rawTransaction.witnesses[0]);
        cccTx.witnesses = [proofWitness as ccc.Hex];

        await cccTx.completeInputsByCapacity(dummySigner);
        await cccTx.completeFeeBy(dummySigner, 2000);

        return { cccTx, client };
    }

    private async resolveLockScriptToCcc(lock: string, client: ccc.Client): Promise<ccc.Script> {
        const trimmed = lock.trim();
        if (trimmed.startsWith('{')) {
            return ccc.Script.from(JSON.parse(trimmed));
        }

        if (isAddressLike(trimmed)) {
            return (await ccc.Address.fromString(trimmed, client)).script;
        }

        if (trimmed.startsWith('0x')) {
            const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
            return ccc.Script.from({
                codeHash: secp.codeHash,
                hashType: secp.hashType,
                args: trimmed,
            });
        }

        if (trimmed === 'always_success') {
            return ccc.Script.from({
                codeHash: '0x28e83a1277d48add8e72fadaa9248559e1b632bab2bd60b27955ebc4c03800a5',
                hashType: 'type',
                args: '0x',
            });
        }

        throw new Error(`Unable to resolve lock script from value: ${lock}`);
    }

    private resolveTypeScriptToCcc(contractRef: ContractReference | string | undefined, outputIndex: number): ccc.Script | undefined {
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

        return ccc.Script.from({
            codeHash: contract.codeHash,
            hashType: contract.hashType,
            args: outputIndex === 0 ? (this.options.config.nullifierRegistry!.typeArgs || '0x') : '0x',
        });
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

        const client = createCccClient(config);
        const liveCell = await client.getCellLive({
            txHash: registryRef.txHash,
            index: registryRef.index,
        }, true, true);

        if (!liveCell) {
            throw new Error(
                `Nullifier registry cell ${registryRef.txHash}:${registryRef.index} is not live on ${config.ckbRpcUrl}`,
            );
        }

        const dataHex = liveCell.outputData;
        const nullifiers = parseRegistryNullifiers(dataHex);
        return {
            outPoint: `${registryRef.txHash}:${registryRef.index}`,
            nullifiers,
            lock: registryRef.lock ?? JSON.stringify({
                codeHash: liveCell.cellOutput.lock.codeHash,
                hashType: liveCell.cellOutput.lock.hashType,
                args: liveCell.cellOutput.lock.args,
            }),
            capacity: registryRef.capacity ?? `0x${liveCell.cellOutput.capacity.toString(16)}`,
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
