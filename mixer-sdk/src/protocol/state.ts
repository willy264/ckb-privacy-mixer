import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import {
    assertFieldHex,
    assertHex32,
    assertUnsignedInteger,
    type FieldHex,
    type Hex32,
} from '../crypto/field.js';
import { assertV1PoolConfig, type V1PoolConfig } from './pool.js';

export interface OutPointRef {
    readonly txHash: Hex32;
    readonly index: number;
}

export interface V1PoolState {
    readonly version: 1;
    readonly poolId: Hex32;
    readonly assetId: Hex32;
    readonly denomination: bigint;
    readonly sequence: bigint;
    readonly commitmentRoot: FieldHex;
    readonly nullifierRoot: FieldHex;
    readonly nextLeafIndex: number;
    readonly outstandingCount: bigint;
    readonly outstandingValue: bigint;
    readonly frontier: readonly FieldHex[];
    readonly acceptedRoots: readonly FieldHex[];
    readonly outPoint: OutPointRef;
}

export interface V1VaultState {
    readonly version: 1;
    readonly poolId: Hex32;
    readonly assetId: Hex32;
    readonly amount: bigint;
    readonly outPoint: OutPointRef;
}

export interface V1ProtocolSnapshot {
    readonly pool: V1PoolConfig;
    readonly state: V1PoolState;
    readonly vault: V1VaultState;
    readonly blockHash: Hex32;
    readonly blockNumber: bigint;
}

export function assertOutPoint(outPoint: OutPointRef, name: string): OutPointRef {
    if (!outPoint || typeof outPoint !== 'object') {
        throw new InvalidArgumentError(`${name} must be an outpoint object.`);
    }
    assertHex32(outPoint.txHash, `${name}.txHash`);
    if (!Number.isSafeInteger(outPoint.index) || outPoint.index < 0 || outPoint.index > 0xffffffff) {
        throw new InvalidArgumentError(`${name}.index must be an unsigned 32-bit integer.`);
    }
    return outPoint;
}

export function outPointsEqual(left: OutPointRef, right: OutPointRef): boolean {
    return left.txHash === right.txHash && left.index === right.index;
}

export function assertV1StateAndVault(
    poolInput: V1PoolConfig,
    state: V1PoolState,
    vault: V1VaultState,
): void {
    const pool = assertV1PoolConfig(poolInput);
    if (!state || typeof state !== 'object' || !vault || typeof vault !== 'object') {
        throw new InvalidArgumentError('PoolState and Vault must be objects.');
    }
    if (state.version !== 1 || vault.version !== 1) {
        throw new InvariantViolationError('PoolState and Vault must use the Obscell V1 schema.');
    }
    assertHex32(state.poolId, 'state.poolId');
    assertHex32(state.assetId, 'state.assetId');
    assertHex32(vault.poolId, 'vault.poolId');
    assertHex32(vault.assetId, 'vault.assetId');
    assertFieldHex(state.commitmentRoot, 'state.commitmentRoot');
    assertFieldHex(state.nullifierRoot, 'state.nullifierRoot');
    if (!Array.isArray(state.frontier) || !Array.isArray(state.acceptedRoots)) {
        throw new InvalidArgumentError('PoolState frontier and acceptedRoots must be arrays.');
    }
    state.frontier.forEach((node, index) => assertFieldHex(node, `state.frontier[${index}]`));
    state.acceptedRoots.forEach((root, index) => assertFieldHex(root, `state.acceptedRoots[${index}]`));
    assertUnsignedInteger(state.sequence, 64, 'state.sequence');
    assertUnsignedInteger(state.denomination, 128, 'state.denomination');
    assertUnsignedInteger(state.outstandingCount, 64, 'state.outstandingCount');
    assertUnsignedInteger(state.outstandingValue, 128, 'state.outstandingValue');
    assertUnsignedInteger(vault.amount, 128, 'vault.amount');
    assertOutPoint(state.outPoint, 'state.outPoint');
    assertOutPoint(vault.outPoint, 'vault.outPoint');
    if (outPointsEqual(state.outPoint, vault.outPoint)) {
        throw new InvariantViolationError('PoolState and Vault must use distinct outpoints.');
    }

    if (!Number.isSafeInteger(state.nextLeafIndex) || state.nextLeafIndex < 0) {
        throw new InvariantViolationError('state.nextLeafIndex must be a non-negative safe integer.');
    }
    if (state.nextLeafIndex > 2 ** pool.treeDepth) {
        throw new InvariantViolationError('state.nextLeafIndex exceeds the V1 Merkle tree capacity.');
    }
    if (state.frontier.length !== pool.treeDepth) {
        throw new InvariantViolationError(`state.frontier must contain exactly ${pool.treeDepth} field elements.`);
    }
    if (state.poolId !== pool.id || vault.poolId !== pool.id) {
        throw new InvariantViolationError('PoolState and Vault must match the selected pool identity.');
    }
    if (state.assetId !== pool.assetId || vault.assetId !== pool.assetId) {
        throw new InvariantViolationError('PoolState and Vault must match the selected asset identity.');
    }
    if (state.denomination !== pool.denomination) {
        throw new InvariantViolationError('PoolState denomination must match the immutable pool denomination.');
    }
    if (state.outstandingCount > BigInt(state.nextLeafIndex) ||
        pool.denomination * state.outstandingCount !== state.outstandingValue) {
        throw new InvariantViolationError(
            'PoolState outstanding value must equal denomination times count and not exceed accepted leaves.',
        );
    }
    if (vault.amount !== state.outstandingValue) {
        throw new InvariantViolationError('Decoded Vault CT value must equal PoolState outstanding value.');
    }
    if (state.acceptedRoots.length === 0 ||
        state.acceptedRoots.length > pool.rootHistorySize ||
        state.acceptedRoots.at(-1) !== state.commitmentRoot) {
        throw new InvariantViolationError(
            'acceptedRoots must be bounded and end with the current commitment root, including at genesis.',
        );
    }
}

export function assertProtocolSnapshot(snapshot: V1ProtocolSnapshot): V1ProtocolSnapshot {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new InvalidArgumentError('Protocol snapshot must be an object.');
    }
    assertV1StateAndVault(snapshot.pool, snapshot.state, snapshot.vault);
    assertUnsignedInteger(snapshot.blockNumber, 64, 'snapshot.blockNumber');
    assertHex32(snapshot.blockHash, 'snapshot.blockHash');
    return snapshot;
}
