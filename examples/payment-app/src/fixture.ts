import { Script, type Client } from '@ckb-ccc/core';
import {
    V1_MERKLE_DEPTH,
    assertHex32,
    assertOwnedNote,
    assertProtocolSnapshot,
    deriveV1AssetDomain,
    deriveV1PoolDomain,
    fieldFromBigInt,
    samePrivacySyncCheckpoint,
    StaleStateError,
    type Hex32,
    type OwnedNote,
    type PrivacyDeployment,
    type PrivacyIndexerService,
    type PrivacyOperation,
    type PrivacyStateStore,
    type PrivacyStateVerifier,
    type V1ContractDeployment,
    type V1ProtocolSnapshot,
} from 'mixer-sdk';
import { createPaymentPrivacyModel, type PaymentPrivacyModel } from './payment-privacy.js';

type FixtureScript = Readonly<{
    codeHash: Hex32;
    hashType: 'type';
    args: string;
}>;

export interface FixtureDiagnostics {
    fixtureGenesisReads: number;
    indexerSyncs: number;
    verifierChecks: number;
    cellReads: number;
    transactionSubmissions: number;
}

export interface DeterministicPaymentFixture {
    readonly execution: 'deterministic-local-fixture';
    readonly liveChain: false;
    readonly poolId: Hex32;
    readonly model: PaymentPrivacyModel;
    readonly stateStore: PrivacyStateStore;
    readonly diagnostics: FixtureDiagnostics;
}

const HASH_TYPE_BYTES = Object.freeze({ type: 1 });

function h32(nibble: string): Hex32 {
    return assertHex32(`0x${nibble.repeat(64)}`);
}

function bytesHex(bytes: Uint8Array): string {
    return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function hexBytes(value: string): Uint8Array {
    if (!/^0x(?:[0-9a-f]{2})*$/.test(value)) {
        throw new Error('Fixture hex must be canonical lowercase bytes.');
    }
    const bytes = new Uint8Array((value.length - 2) / 2);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16);
    }
    return bytes;
}

function encodePoolTypeArgs(
    poolId: Hex32,
    vaultLock: FixtureScript,
    stagingLock: FixtureScript,
): string {
    const bytes = new Uint8Array(100);
    bytes[0] = 1;
    bytes.set(hexBytes(poolId), 2);
    bytes.set(hexBytes(vaultLock.codeHash), 34);
    bytes[66] = HASH_TYPE_BYTES[vaultLock.hashType];
    bytes.set(hexBytes(stagingLock.codeHash), 67);
    bytes[99] = HASH_TYPE_BYTES[stagingLock.hashType];
    return bytesHex(bytes);
}

function contract(codeNibble: string, outPointNibble: string): V1ContractDeployment {
    return {
        script: { codeHash: h32(codeNibble), hashType: 'type', args: '0x' },
        cellDep: {
            outPoint: { txHash: h32(outPointNibble), index: 0 },
            depType: 'code',
        },
    };
}

class TransientPaymentStateStore implements PrivacyStateStore {
    readonly protection = 'memory-only' as const;
    private readonly notes = new Map<string, OwnedNote>();
    private readonly snapshots = new Map<string, V1ProtocolSnapshot>();
    private readonly operations = new Map<string, PrivacyOperation>();

    async listNotes(poolId: string): Promise<readonly OwnedNote[]> {
        return [...this.notes.values()].filter(note => note.poolId === poolId).map(note => ({ ...note }));
    }

    async getNote(noteId: string): Promise<OwnedNote | undefined> {
        const note = this.notes.get(noteId);
        return note ? { ...note } : undefined;
    }

    async putNote(note: OwnedNote): Promise<void> {
        this.notes.set(note.id, Object.freeze({ ...note }));
    }

    async getPoolSnapshot(poolId: string): Promise<V1ProtocolSnapshot | undefined> {
        return this.snapshots.get(poolId);
    }

    async putPoolSnapshot(snapshot: V1ProtocolSnapshot): Promise<void> {
        this.snapshots.set(snapshot.pool.id, snapshot);
    }

    async commitSync(
        snapshot: V1ProtocolSnapshot,
        notes: readonly OwnedNote[],
        expectedPrevious: V1ProtocolSnapshot | undefined,
    ): Promise<void> {
        const validSnapshot = assertProtocolSnapshot(snapshot);
        const validNotes = notes.map(assertOwnedNote);
        const current = this.snapshots.get(validSnapshot.pool.id);
        if (!samePrivacySyncCheckpoint(current, expectedPrevious)) {
            throw new StaleStateError('Payment fixture sync checkpoint changed; retry the refresh.');
        }
        this.snapshots.set(validSnapshot.pool.id, validSnapshot);
        for (const note of validNotes) {
            this.notes.set(note.id, Object.freeze({ ...note }));
        }
    }

    async getOperation(operationId: string): Promise<PrivacyOperation | undefined> {
        return this.operations.get(operationId);
    }

    async putOperation(operation: PrivacyOperation): Promise<void> {
        this.operations.set(operation.id, Object.freeze({ ...operation }));
    }
}

function createFixtureCccClient(
    diagnostics: FixtureDiagnostics,
    genesisHash: Hex32,
): Client {
    const client = {
        addressPrefix: 'ckt',
        async getCellLive() {
            diagnostics.cellReads += 1;
            return undefined;
        },
        async getBlockByNumber(number: bigint) {
            if (number !== 0n) {
                throw new Error('The fixture client exposes only its deterministic genesis header.');
            }
            diagnostics.fixtureGenesisReads += 1;
            return { header: { hash: genesisHash } };
        },
        async sendTransaction() {
            diagnostics.transactionSubmissions += 1;
            throw new Error('The deterministic payment fixture never submits transactions.');
        },
    };
    return client as unknown as Client;
}

export async function createDeterministicPaymentFixture(): Promise<DeterministicPaymentFixture> {
    const diagnostics: FixtureDiagnostics = {
        fixtureGenesisReads: 0,
        indexerSyncs: 0,
        verifierChecks: 0,
        cellReads: 0,
        transactionSubmissions: 0,
    };
    const poolId = h32('a');
    const genesisHash = h32('e');
    const contracts = {
        poolState: contract('1', '1'),
        vault: contract('3', '3'),
        stagingDeposit: contract('4', '4'),
        nullifier: contract('5', '5'),
        ctToken: contract('8', '8'),
        verifier: contract('9', '9'),
    } satisfies PrivacyDeployment['contracts'];
    const vaultScript = contracts.vault.script as FixtureScript;
    const stagingScript = contracts.stagingDeposit.script as FixtureScript;
    const poolType: FixtureScript = {
        ...(contracts.poolState.script as FixtureScript),
        args: encodePoolTypeArgs(poolId, vaultScript, stagingScript),
    };
    const assetType: FixtureScript = { codeHash: h32('8'), hashType: 'type', args: '0x1234' };
    const assetId = assertHex32(Script.from(assetType).hash());
    const [poolDomain, assetDomain] = await Promise.all([
        deriveV1PoolDomain(poolType),
        deriveV1AssetDomain(assetType),
    ]);
    const pool = {
        id: poolId,
        poolDomain,
        assetId,
        assetDomain,
        denomination: 100n,
        treeDepth: V1_MERKLE_DEPTH,
        rootHistorySize: 8,
        poolType,
        assetType,
    } as const;
    const deployment: PrivacyDeployment = {
        protocolVersion: 'obscell-v1',
        network: 'fixture-only',
        genesisHash,
        addressPrefix: 'ckt',
        contracts,
        pools: [pool],
    };
    const client = createFixtureCccClient(diagnostics, genesisHash);
    const stateStore = new TransientPaymentStateStore();
    const commitment = fieldFromBigInt(44n);
    await stateStore.putNote({
        version: 1,
        id: 'fixture-payment-note',
        poolId,
        commitment,
        secret: fieldFromBigInt(45n),
        nullifierSecret: fieldFromBigInt(46n),
        state: 'staged',
        createdAt: 1,
    });

    const acceptedRoot = fieldFromBigInt(55n);
    const snapshot: V1ProtocolSnapshot = {
        pool,
        state: {
            version: 1,
            poolId,
            assetId,
            denomination: 100n,
            sequence: 1n,
            commitmentRoot: acceptedRoot,
            nullifierRoot: fieldFromBigInt(56n),
            nextLeafIndex: 1,
            outstandingCount: 1n,
            outstandingValue: 100n,
            frontier: Array.from({ length: V1_MERKLE_DEPTH }, () => fieldFromBigInt(0n)),
            acceptedRoots: [acceptedRoot],
            outPoint: { txHash: h32('5'), index: 0 },
        },
        vault: {
            version: 1,
            poolId,
            assetId,
            amount: 100n,
            outPoint: { txHash: h32('6'), index: 0 },
        },
        blockHash: h32('7'),
        blockNumber: 100n,
    };
    const indexer: PrivacyIndexerService = {
        async syncPool(input) {
            diagnostics.indexerSyncs += 1;
            if (input.client !== client || input.pool.id !== poolId) {
                throw new Error('Fixture indexer received an unexpected client or pool.');
            }
            return {
                snapshot,
                noteUpdates: [{
                    commitment,
                    state: 'accepted',
                    leafIndex: 0,
                    acceptedRoot,
                }],
            };
        },
    };
    const stateVerifier: PrivacyStateVerifier = {
        async verifyPoolSync(input) {
            diagnostics.verifierChecks += 1;
            if (input.client !== client || input.result.snapshot !== snapshot || input.pool.id !== poolId) {
                throw new Error('Fixture verifier received an unexpected observation.');
            }
            if (input.localNotes.length !== 1 ||
                input.localNotes.some(note => 'secret' in note || 'nullifierSecret' in note)) {
                throw new Error('Only public note metadata may cross the verifier boundary.');
            }
        },
    };

    return Object.freeze({
        execution: 'deterministic-local-fixture',
        liveChain: false,
        poolId,
        model: createPaymentPrivacyModel({
            cccClient: client,
            deployment,
            stateStore,
            indexer,
            stateVerifier,
        }),
        stateStore,
        diagnostics,
    });
}
