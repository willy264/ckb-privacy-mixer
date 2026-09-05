export type Hex = `0x${string}`;

export interface OutPointRef {
    txHash: Hex;
    index: Hex;
}

export interface ScriptRef {
    codeHash: Hex;
    hashType: 'data' | 'data1' | 'data2' | 'type';
    args: Hex;
}

export interface WithdrawalPublicSignals {
    poolDomain: Hex;
    assetDomain: Hex;
    denomination: Hex;
    value: Hex;
    root: Hex;
    nullifierHash: Hex;
    recipientDomain: Hex;
    actionHash: Hex;
    authTag: Hex;
}

export interface WithdrawalIntentV1 {
    version: 1;
    poolId: Hex;
    expectedState: {
        sequence: Hex;
        poolState: OutPointRef;
        vault: OutPointRef;
        root: Hex;
        vaultValue: Hex;
    };
    recipient: {
        lock: ScriptRef;
        ctType: ScriptRef;
        capacity: Hex;
        data: Hex;
    };
    publicSignals: WithdrawalPublicSignals;
    proof: {
        system: 'groth16-bn254';
        bytes: Hex;
    };
    maxFeeShannons: Hex;
}

export interface PoolChainSnapshotV1 {
    version: 1;
    poolId: Hex;
    assetId: Hex;
    poolDomain: Hex;
    assetDomain: Hex;
    denomination: Hex;
    treeDepth: 20;
    rootHistorySize: number;
    sequence: Hex;
    root: Hex;
    nullifierRoot: Hex;
    nextLeafIndex: Hex;
    outstandingCount: Hex;
    outstandingValue: Hex;
    frontier: readonly Hex[];
    acceptedRoots: readonly Hex[];
    poolState: OutPointRef;
    vault: OutPointRef;
    vaultValue: Hex;
    ctType: ScriptRef;
    blockNumber: Hex;
    blockHash: Hex;
}

export interface ProtectedWithdrawalFields {
    recipientDomain: Hex;
    actionHash: Hex;
}

export interface WithdrawalPlanV1 {
    feeShannons: bigint;
    protectedFields: ProtectedWithdrawalFields;
    privacyInputOutPoints: readonly OutPointRef[];
    feeInputs: readonly { outPoint: OutPointRef; type?: ScriptRef }[];
    recipient: WithdrawalIntentV1['recipient'];
    transaction: unknown;
}

export type RelayerOperationStatus = 'queued' | 'validated' | 'submitted' | 'committed' | 'failed';

export interface RelayerOperationV1 {
    id: string;
    nullifierHash: Hex;
    status: RelayerOperationStatus;
    txHash?: Hex;
    error?: string;
}

export interface StagingDepositV1 {
    version: 1;
    outPoint: OutPointRef;
    blockNumber: Hex;
    blockHash: Hex;
    poolId: Hex;
    assetId: Hex;
    assetDomain: Hex;
    denomination: Hex;
    commitment: Hex;
    refundLockHash: Hex;
    refundSince: Hex;
    capacityReserve: Hex;
}

export interface AcceptancePlanV1 {
    poolState: PoolChainSnapshotV1;
    staging: readonly StagingDepositV1[];
    transaction: unknown;
}
