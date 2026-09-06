import type {
    AcceptancePlanV1,
    Hex,
    PoolChainSnapshotV1,
    StagingDepositV1,
} from './types.js';
import { parsePoolChainSnapshotV1, parseStagingDepositV1 } from './validation.js';

export const V1_MAX_ACCEPTANCE_BATCH = 16;

export interface V1CoordinatorChainReader {
    getPoolSnapshot(poolId: Hex): Promise<PoolChainSnapshotV1>;
    /** Untrusted decoded observations. The coordinator validates and quarantines invalid entries. */
    listConfirmedStaging(poolId: Hex): Promise<readonly unknown[]>;
}

export interface V1AcceptancePlanner {
    buildAcceptance(
        state: PoolChainSnapshotV1,
        staging: readonly StagingDepositV1[],
    ): Promise<unknown>;
}

function outPointKey(staging: StagingDepositV1) {
    return `${staging.outPoint.txHash}:${BigInt(staging.outPoint.index).toString(16).padStart(8, '0')}`;
}

export class V1Coordinator {
    constructor(
        private readonly chain: V1CoordinatorChainReader,
        private readonly planner: V1AcceptancePlanner,
    ) {}

    async planAcceptance(poolId: Hex): Promise<AcceptancePlanV1 | undefined> {
        const state = parsePoolChainSnapshotV1(await this.chain.getPoolSnapshot(poolId));
        if (state.poolId !== poolId) {
            throw new Error('chain reader returned state for a different pool');
        }
        const discovered = await this.chain.listConfirmedStaging(poolId);
        const candidates: StagingDepositV1[] = [];
        for (const observation of discovered) {
            try {
                const deposit = parseStagingDepositV1(observation);
                if (deposit.poolId !== state.poolId ||
                    deposit.assetId !== state.assetId ||
                    deposit.assetDomain !== state.assetDomain ||
                    deposit.denomination !== state.denomination) {
                    continue;
                }
                candidates.push(deposit);
            } catch {
                // Permissionless staging observations cannot be allowed to halt valid batches.
            }
        }
        const keyCounts = new Map<string, number>();
        for (const candidate of candidates) {
            const key = outPointKey(candidate);
            keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
        }
        const ordered = candidates
            .filter(candidate => keyCounts.get(outPointKey(candidate)) === 1)
            .sort((left, right) => outPointKey(left).localeCompare(outPointKey(right)));

        if (ordered.length === 0) return undefined;
        const staging = ordered.slice(0, V1_MAX_ACCEPTANCE_BATCH);

        return {
            poolState: state,
            staging,
            transaction: await this.planner.buildAcceptance(state, staging),
        };
    }
}
