import crypto from 'node:crypto';
import type {
    Hex,
    PoolChainSnapshotV1,
    ProtectedWithdrawalFields,
    RelayerOperationV1,
    WithdrawalIntentV1,
    WithdrawalPlanV1,
} from './types.js';
import {
    parsePoolChainSnapshotV1,
    parseTransactionHash,
    parseWithdrawalIntentV1,
    validateIntentAgainstChain,
    validateReconstructedPlan,
} from './validation.js';

export interface V1RelayerChainReader {
    getPoolSnapshot(poolId: Hex): Promise<PoolChainSnapshotV1>;
    waitForCommitted(txHash: Hex): Promise<void>;
}

export interface V1WithdrawalPlanner {
    deriveProtectedFields(
        intent: WithdrawalIntentV1,
        state: PoolChainSnapshotV1,
    ): Promise<ProtectedWithdrawalFields>;
    reconstruct(intent: WithdrawalIntentV1, state: PoolChainSnapshotV1): Promise<WithdrawalPlanV1>;
}

export interface V1TransactionSubmitter {
    /** Must derive the canonical CKB transaction hash locally before broadcast. */
    transactionHash(transaction: unknown): Promise<Hex>;
    submit(transaction: unknown): Promise<Hex>;
}

/**
 * Must decode and inspect the materialized transaction itself. Checking only
 * planner-supplied metadata is insufficient because metadata can disagree with
 * the object handed to the submitter.
 */
export interface V1TransactionInspector {
    validate(
        intent: WithdrawalIntentV1,
        state: PoolChainSnapshotV1,
        plan: WithdrawalPlanV1,
    ): Promise<void>;
}

export interface V1OperationStore {
    /**
     * Production stores must make acquisition recoverable with the queued
     * operation (for example, atomically or through an expiring lease).
     */
    acquireNullifier(nullifierHash: Hex): Promise<boolean>;
    releaseNullifier(nullifierHash: Hex): Promise<void>;
    put(operation: RelayerOperationV1): Promise<void>;
    get(id: string): Promise<RelayerOperationV1 | undefined>;
}

export interface V1RelayerDependencies {
    chain: V1RelayerChainReader;
    planner: V1WithdrawalPlanner;
    transactionInspector: V1TransactionInspector;
    submitter: V1TransactionSubmitter;
    operations: V1OperationStore;
}

export class MemoryOperationStore implements V1OperationStore {
    private readonly operations = new Map<string, RelayerOperationV1>();
    private readonly nullifiers = new Set<Hex>();

    async acquireNullifier(nullifierHash: Hex): Promise<boolean> {
        if (this.nullifiers.has(nullifierHash)) return false;
        this.nullifiers.add(nullifierHash);
        return true;
    }

    async put(operation: RelayerOperationV1): Promise<void> {
        this.operations.set(operation.id, { ...operation });
    }

    async releaseNullifier(nullifierHash: Hex): Promise<void> {
        this.nullifiers.delete(nullifierHash);
    }

    async get(id: string): Promise<RelayerOperationV1 | undefined> {
        const operation = this.operations.get(id);
        return operation ? { ...operation } : undefined;
    }
}

export class V1Relayer {
    constructor(private readonly dependencies: V1RelayerDependencies) {}

    async submit(input: unknown): Promise<RelayerOperationV1> {
        const intent = parseWithdrawalIntentV1(input);
        if (!await this.dependencies.operations.acquireNullifier(intent.publicSignals.nullifierHash)) {
            throw new Error('withdrawal nullifier is already queued');
        }

        const operation: RelayerOperationV1 = {
            id: crypto.randomUUID(),
            nullifierHash: intent.publicSignals.nullifierHash,
            status: 'queued',
        };

        let submissionAttempted = false;
        try {
            await this.dependencies.operations.put(operation);
            const chainState = parsePoolChainSnapshotV1(
                await this.dependencies.chain.getPoolSnapshot(intent.poolId),
            );
            const protectedFields = await this.dependencies.planner.deriveProtectedFields(intent, chainState);
            validateIntentAgainstChain(intent, chainState, protectedFields);

            const plan = await this.dependencies.planner.reconstruct(intent, chainState);
            validateReconstructedPlan(intent, plan);
            await this.dependencies.transactionInspector.validate(intent, chainState, plan);
            operation.status = 'validated';
            operation.txHash = parseTransactionHash(
                await this.dependencies.submitter.transactionHash(plan.transaction),
            );
            // Persist the locally derived hash before the network call so a
            // crash or timeout can be reconciled without unlocking a replay.
            await this.dependencies.operations.put(operation);
            submissionAttempted = true;
            const submittedHash = await this.dependencies.submitter.submit(plan.transaction);
            if (parseTransactionHash(submittedHash) !== operation.txHash) {
                throw new Error('submitter returned a transaction hash that differs from the materialized transaction');
            }
            operation.status = 'submitted';
            await this.dependencies.operations.put(operation);

            await this.dependencies.chain.waitForCommitted(operation.txHash);
            operation.status = 'committed';
            await this.dependencies.operations.put(operation);
            return { ...operation };
        } catch (error) {
            if (!submissionAttempted) {
                operation.status = 'failed';
            } else if (operation.status !== 'committed') {
                operation.status = 'submitted';
            }
            operation.error = error instanceof Error ? error.message : 'withdrawal relay failed';
            try {
                await this.dependencies.operations.put(operation);
            } catch {
                // Preserve the failure that caused the relay to abort.
            } finally {
                if (!submissionAttempted) {
                    try {
                        await this.dependencies.operations.releaseNullifier(
                            intent.publicSignals.nullifierHash,
                        );
                    } catch {
                        // Preserve the original error; durable stores must recover failed releases.
                    }
                }
            }
            throw error;
        }
    }

    async getOperation(id: string): Promise<RelayerOperationV1 | undefined> {
        const operation = await this.dependencies.operations.get(id);
        return operation ? { ...operation } : undefined;
    }
}
