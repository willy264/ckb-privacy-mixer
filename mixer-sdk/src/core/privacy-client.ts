import type { Client, Signer } from '@ckb-ccc/core';
import {
    assertDeploymentClient,
    assertDeploymentDomains,
    assertDeploymentNetwork,
    assertPrivacyDeployment,
    type PrivacyDeployment,
} from '../ccc/deployment.js';
import { assertOperationSigner } from '../ccc/signer.js';
import { findPool, type V1PoolConfig } from '../protocol/pool.js';
import { assertProtocolSnapshot, type V1ProtocolSnapshot } from '../protocol/state.js';
import {
    assertOwnedNote,
    isNoteSpendable,
    toNoteMetadata,
    transitionNote,
    type NoteMetadata,
    type NoteState,
    type OwnedNote,
} from '../notes/models.js';
import type { PrivacyStateStore } from '../notes/storage.js';
import type { PrivacyProver } from '../prover/interface.js';
import type { PrivacyServices } from '../services/index.js';
import type { PrivacyRecipient } from '../validation/recipient.js';
import { validateAndDeriveRecipientDomain } from '../validation/recipient.js';
import { createCapabilities, type PrivacyCapabilities } from './capabilities.js';
import {
    InvalidArgumentError,
    InvariantViolationError,
    StateUnavailableError,
    UnsupportedOperationError,
} from './errors.js';
import type { PrivacyOperation } from './operations.js';

export interface CreatePrivacyClientOptions {
    readonly client: Client;
    readonly deployment: PrivacyDeployment;
    readonly prover?: PrivacyProver;
    readonly stateStore: PrivacyStateStore;
    readonly services?: PrivacyServices;
}

export interface PrivacySyncInput {
    readonly poolId: string;
    readonly signal?: AbortSignal;
}

export interface ListNotesInput {
    readonly poolId: string;
    readonly state?: NoteState | readonly NoteState[];
}

export interface PrivateBalance {
    readonly poolId: string;
    readonly assetId: string;
    readonly denomination: bigint;
    readonly amount: bigint;
    readonly noteCount: number;
    readonly stateSequence: bigint;
}

export interface ShieldInput {
    readonly poolId: string;
    readonly signer: Signer;
    readonly signal?: AbortSignal;
}

export interface RefundInput {
    readonly operationId: string;
    readonly signer: Signer;
    readonly signal?: AbortSignal;
}

export type UnshieldSubmission =
    | { readonly kind: 'direct'; readonly signer: Signer }
    | { readonly kind: 'relayed'; readonly maxFee: bigint };

export interface UnshieldInput {
    readonly noteId: string;
    readonly recipient: PrivacyRecipient;
    readonly submission: UnshieldSubmission;
    readonly signal?: AbortSignal;
}

export interface PrivacyClient {
    getCapabilities(): Promise<PrivacyCapabilities>;
    sync(input: PrivacySyncInput): Promise<V1ProtocolSnapshot>;
    listNotes(input: ListNotesInput): Promise<readonly NoteMetadata[]>;
    getPrivateBalance(input: { readonly poolId: string }): Promise<PrivateBalance>;
    shield(input: ShieldInput): Promise<PrivacyOperation>;
    refund(input: RefundInput): Promise<PrivacyOperation>;
    unshield(input: UnshieldInput): Promise<PrivacyOperation>;
    getOperation(operationId: string): Promise<PrivacyOperation>;
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Operation aborted.', 'AbortError');
    }
}

function assertSnapshotMatchesPool(snapshot: V1ProtocolSnapshot, pool: V1PoolConfig): void {
    assertProtocolSnapshot(snapshot);
    if (snapshot.pool.id !== pool.id || snapshot.pool.assetId !== pool.assetId ||
        snapshot.pool.poolDomain !== pool.poolDomain || snapshot.pool.assetDomain !== pool.assetDomain ||
        snapshot.pool.denomination !== pool.denomination || snapshot.pool.treeDepth !== pool.treeDepth ||
        snapshot.pool.rootHistorySize !== pool.rootHistorySize) {
        throw new InvariantViolationError('Indexer returned state for a different pool configuration.');
    }
}

function statesFilter(state?: NoteState | readonly NoteState[]): readonly NoteState[] | undefined {
    return state === undefined ? undefined : (typeof state === 'string' ? [state] : state);
}

export class DefaultPrivacyClient implements PrivacyClient {
    private readonly services: PrivacyServices;
    private readonly syncTails = new Map<string, Promise<void>>();
    private deploymentDomainCheck?: Promise<void>;

    constructor(private readonly options: CreatePrivacyClientOptions) {
        assertPrivacyDeployment(options.deployment);
        assertDeploymentClient(options.deployment, options.client);
        if (!options.stateStore || typeof options.stateStore.listNotes !== 'function' ||
            typeof options.stateStore.commitSync !== 'function') {
            throw new InvalidArgumentError('createPrivacyClient requires an injected private state store.');
        }
        this.services = options.services ?? {};
    }

    async getCapabilities(): Promise<PrivacyCapabilities> {
        await this.ensureDeploymentDomains();
        return createCapabilities({
            hasIndexer: !!this.services.indexer,
            hasStateVerifier: !!this.services.stateVerifier,
            hasProver: !!this.options.prover,
            stateProtection: this.options.stateStore.protection,
        });
    }

    async sync(input: PrivacySyncInput): Promise<V1ProtocolSnapshot> {
        throwIfAborted(input.signal);
        const pool = this.getPool(input.poolId);
        return this.enqueuePoolSync(pool.id, () => this.performSync(pool, input));
    }

    private async performSync(
        pool: V1PoolConfig,
        input: PrivacySyncInput,
    ): Promise<V1ProtocolSnapshot> {
        throwIfAborted(input.signal);
        await this.ensureDeploymentDomains();
        const indexer = this.services.indexer;
        if (!indexer) {
            throw new UnsupportedOperationError('sync', 'no indexer/state service was injected');
        }
        const stateVerifier = this.services.stateVerifier;
        if (!stateVerifier) {
            throw new UnsupportedOperationError(
                'sync',
                'no authoritative CKB state verifier was injected; indexer observations are untrusted',
            );
        }

        const previousSnapshot = await this.options.stateStore.getPoolSnapshot(pool.id);
        const result = await indexer.syncPool({
            client: this.options.client,
            pool,
            previousSnapshot,
            signal: input.signal,
        });
        throwIfAborted(input.signal);
        assertSnapshotMatchesPool(result.snapshot, pool);

        const localNotes = [...await this.options.stateStore.listNotes(pool.id)];
        await stateVerifier.verifyPoolSync({
            client: this.options.client,
            pool,
            previousSnapshot,
            result,
            localNotes: localNotes.map(note =>
                toNoteMetadata(note, previousSnapshot?.state.acceptedRoots)),
            signal: input.signal,
        });
        throwIfAborted(input.signal);
        const byCommitment = new Map(localNotes.map(note => [note.commitment, note]));
        const seenUpdates = new Set<string>();
        for (const update of result.noteUpdates) {
            if (seenUpdates.has(update.commitment)) {
                throw new InvariantViolationError('Indexer returned duplicate updates for one commitment.');
            }
            seenUpdates.add(update.commitment);
            const current = byCommitment.get(update.commitment);
            if (!current) {
                continue;
            }
            let updated: OwnedNote;
            if (current.state === update.state) {
                updated = assertOwnedNote(Object.freeze({
                    ...current,
                    leafIndex: update.leafIndex ?? current.leafIndex,
                    acceptedRoot: update.acceptedRoot ?? current.acceptedRoot,
                }));
            } else {
                updated = transitionNote(current, update.state, {
                    leafIndex: update.leafIndex ?? current.leafIndex,
                    acceptedRoot: update.acceptedRoot ?? current.acceptedRoot,
                });
            }
            // A verified historical acceptance can outlive the bounded root window.
            const index = localNotes.findIndex(note => note.id === current.id);
            localNotes[index] = updated;
            byCommitment.set(updated.commitment, updated);
        }

        await this.options.stateStore.commitSync(result.snapshot, localNotes, previousSnapshot);
        return result.snapshot;
    }

    async listNotes(input: ListNotesInput): Promise<readonly NoteMetadata[]> {
        const pool = this.getPool(input.poolId);
        const filter = statesFilter(input.state);
        const notes = await this.options.stateStore.listNotes(pool.id);
        const snapshot = await this.options.stateStore.getPoolSnapshot(pool.id);
        if (snapshot) {
            assertSnapshotMatchesPool(snapshot, pool);
        }
        return notes
            .map(assertOwnedNote)
            .filter(note => !filter || filter.includes(note.state))
            .map(note => toNoteMetadata(note, snapshot?.state.acceptedRoots));
    }

    async getPrivateBalance(input: { readonly poolId: string }): Promise<PrivateBalance> {
        const pool = this.getPool(input.poolId);
        const snapshot = await this.options.stateStore.getPoolSnapshot(pool.id);
        if (!snapshot) {
            throw new StateUnavailableError('Private balance requires an authoritative synchronized PoolState.');
        }
        assertSnapshotMatchesPool(snapshot, pool);
        const notes = await this.options.stateStore.listNotes(pool.id);
        const spendable = notes.filter(note =>
            isNoteSpendable(note, snapshot.state.acceptedRoots));
        return Object.freeze({
            poolId: pool.id,
            assetId: pool.assetId,
            denomination: pool.denomination,
            amount: pool.denomination * BigInt(spendable.length),
            noteCount: spendable.length,
            stateSequence: snapshot.state.sequence,
        });
    }

    async shield(input: ShieldInput): Promise<PrivacyOperation> {
        throwIfAborted(input.signal);
        await this.ensureDeploymentDomains();
        this.getPool(input.poolId);
        assertOperationSigner(this.options.client, input.signer);
        throw new UnsupportedOperationError(
            'shield',
            'the corrected V1 staging transaction builder and deployed scripts are not available',
        );
    }

    async refund(input: RefundInput): Promise<PrivacyOperation> {
        throwIfAborted(input.signal);
        await this.ensureDeploymentDomains();
        if (!input.operationId) {
            throw new InvalidArgumentError('refund requires an operationId.');
        }
        assertOperationSigner(this.options.client, input.signer);
        const operation = await this.options.stateStore.getOperation(input.operationId);
        if (!operation) {
            throw new StateUnavailableError(`Unknown privacy operation: ${input.operationId}`);
        }
        if (operation.kind !== 'shield') {
            throw new InvalidArgumentError('Only a staging shield operation can be refunded.');
        }
        throw new UnsupportedOperationError(
            'refund',
            'the corrected V1 staging refund transaction builder and deployed scripts are not available',
        );
    }

    async unshield(input: UnshieldInput): Promise<PrivacyOperation> {
        throwIfAborted(input.signal);
        await this.ensureDeploymentDomains();
        const note = await this.options.stateStore.getNote(input.noteId);
        if (!note) {
            throw new StateUnavailableError(`Unknown private note: ${input.noteId}`);
        }
        assertOwnedNote(note);
        const pool = this.getPool(note.poolId);
        const snapshot = await this.options.stateStore.getPoolSnapshot(pool.id);
        if (!snapshot) {
            throw new StateUnavailableError('Unshield requires an authoritative synchronized PoolState.');
        }
        assertSnapshotMatchesPool(snapshot, pool);
        if (!isNoteSpendable(note, snapshot.state.acceptedRoots)) {
            throw new InvalidArgumentError(
                'The note is not currently spendable; its accepted root may have left the retained window.',
            );
        }
        await validateAndDeriveRecipientDomain(this.options.client, input.recipient);
        if (input.submission.kind === 'direct') {
            assertOperationSigner(this.options.client, input.submission.signer);
        } else {
            if (input.submission.maxFee < 0n) {
                throw new InvalidArgumentError('Relayer fee ceiling must not be negative.');
            }
            if (!this.services.relayer) {
                throw new UnsupportedOperationError('unshield', 'no relayer service was injected');
            }
        }
        throw new UnsupportedOperationError(
            'unshield',
            'the corrected V1 proof/action/transaction pipeline is not connected to deployed scripts',
        );
    }

    async getOperation(operationId: string): Promise<PrivacyOperation> {
        if (!operationId) {
            throw new InvalidArgumentError('operationId must not be empty.');
        }
        const operation = await this.options.stateStore.getOperation(operationId);
        if (!operation) {
            throw new StateUnavailableError(`Unknown privacy operation: ${operationId}`);
        }
        return operation;
    }

    private getPool(poolId: string): V1PoolConfig {
        return findPool(this.options.deployment.pools, poolId);
    }

    private async enqueuePoolSync<T>(poolId: string, task: () => Promise<T>): Promise<T> {
        const previous = this.syncTails.get(poolId) ?? Promise.resolve();
        const run = previous.then(task);
        const tail = run.then(() => undefined, () => undefined);
        this.syncTails.set(poolId, tail);
        try {
            return await run;
        } finally {
            if (this.syncTails.get(poolId) === tail) {
                this.syncTails.delete(poolId);
            }
        }
    }

    private ensureDeploymentDomains(): Promise<void> {
        this.deploymentDomainCheck ??= Promise.all([
            assertDeploymentDomains(this.options.deployment),
            assertDeploymentNetwork(this.options.deployment, this.options.client),
        ]).then(() => undefined);
        return this.deploymentDomainCheck;
    }
}

export function createPrivacyClient(options: CreatePrivacyClientOptions): PrivacyClient {
    return new DefaultPrivacyClient(options);
}
