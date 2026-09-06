import { z } from 'zod';
import { Script } from '@ckb-ccc/core';
import type {
    Hex,
    PoolChainSnapshotV1,
    ProtectedWithdrawalFields,
    ScriptRef,
    StagingDepositV1,
    WithdrawalIntentV1,
    WithdrawalPlanV1,
} from './types.js';

const FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const FQ_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const byte32 = z.string().regex(/^0x[0-9a-f]{64}$/, 'expected canonical lowercase 32-byte hex');
const hex = z.string().regex(/^0x(?:[0-9a-f]{2})*$/, 'expected canonical lowercase even-length hex');
const quantity = z.string().regex(/^0x(?:0|[1-9a-f][0-9a-f]*)$/, 'expected canonical lowercase hex quantity');

function boundedQuantity(bits: number, name: string) {
    return quantity.refine(value => BigInt(value) < (1n << BigInt(bits)), {
        message: `${name} exceeds unsigned ${bits}-bit range`,
    });
}

const quantityU32 = boundedQuantity(32, 'quantity');
const quantityU64 = boundedQuantity(64, 'quantity');
const quantityU128 = boundedQuantity(128, 'quantity');
const nonZeroByte32 = byte32.refine(value => !/^0x0{64}$/.test(value), {
    message: 'expected a non-zero 32-byte value',
});
const positiveQuantityU64 = quantityU64.refine(value => BigInt(value) > 0n, {
    message: 'expected a positive unsigned 64-bit quantity',
});
const relativeBlockSince = quantityU64.refine(value => {
    const since = BigInt(value);
    const flagsMask = 0xff00_0000_0000_0000n;
    const relativeBlockFlags = 0x8000_0000_0000_0000n;
    const valueMask = 0x00ff_ffff_ffff_ffffn;
    return (since & flagsMask) === relativeBlockFlags && (since & valueMask) !== 0n;
}, { message: 'expected a non-zero relative block-number since value' });

function decodeLittleEndianHex(value: string): bigint {
    const bytes = value.slice(2).match(/../g);
    if (!bytes) throw new Error('expected non-empty byte string');
    return BigInt(`0x${bytes.reverse().join('')}`);
}

function assertCanonicalGroth16Proof(value: Hex): void {
    const encoded = value.slice(2);
    const coordinates = Array.from({ length: 8 }, (_, index) =>
        decodeLittleEndianHex(`0x${encoded.slice(index * 64, (index + 1) * 64)}`));
    coordinates.forEach((coordinate, index) => {
        if (coordinate >= FQ_MODULUS) {
            throw new Error(`proof coordinate ${index} is not canonical BN254 Fq`);
        }
    });
    const allZero = (start: number, end: number) =>
        coordinates.slice(start, end).every(coordinate => coordinate === 0n);
    if (allZero(0, 2) || allZero(2, 6) || allZero(6, 8)) {
        throw new Error('Groth16 proof contains an infinity point encoding');
    }
}

const frLe = byte32.refine(value => decodeLittleEndianHex(value) < FR_MODULUS, {
    message: 'field element is not canonical BN254 Fr',
});
const nonZeroFrLe = frLe.refine(value => decodeLittleEndianHex(value) !== 0n, {
    message: 'field element must be non-zero',
});
const positiveU128Le = frLe.refine(value => {
    const decoded = decodeLittleEndianHex(value);
    return decoded > 0n && decoded < (1n << 128n);
}, { message: 'denomination/value must be a positive unsigned 128-bit integer' });

const outPointSchema = z.object({
    txHash: byte32,
    index: quantityU32,
}).strict();

const scriptSchema = z.object({
    codeHash: byte32,
    hashType: z.enum(['data', 'data1', 'data2', 'type']),
    args: hex,
}).strict();

export const poolChainSnapshotV1Schema = z.object({
    version: z.literal(1),
    poolId: nonZeroByte32,
    assetId: nonZeroByte32,
    poolDomain: frLe,
    assetDomain: frLe,
    denomination: positiveU128Le,
    treeDepth: z.literal(20),
    rootHistorySize: z.number().int().min(1).max(32),
    sequence: quantityU64,
    root: frLe,
    nullifierRoot: frLe,
    nextLeafIndex: quantityU32,
    outstandingCount: quantityU64,
    outstandingValue: quantityU128,
    frontier: z.array(frLe).length(20),
    acceptedRoots: z.array(frLe).min(1).max(32),
    poolState: outPointSchema,
    vault: outPointSchema,
    vaultValue: quantityU128,
    ctType: scriptSchema,
    blockNumber: quantityU64,
    blockHash: byte32,
}).strict();

export const stagingDepositV1Schema = z.object({
    version: z.literal(1),
    outPoint: outPointSchema,
    blockNumber: quantityU64,
    blockHash: byte32,
    poolId: nonZeroByte32,
    assetId: nonZeroByte32,
    assetDomain: frLe,
    denomination: positiveU128Le,
    commitment: nonZeroFrLe,
    refundLockHash: nonZeroByte32,
    refundSince: relativeBlockSince,
    capacityReserve: positiveQuantityU64,
}).strict();

export const withdrawalIntentV1Schema = z.object({
    version: z.literal(1),
    poolId: nonZeroByte32,
    expectedState: z.object({
        sequence: quantityU64,
        poolState: outPointSchema,
        vault: outPointSchema,
        root: frLe,
        vaultValue: quantityU128,
    }).strict(),
    recipient: z.object({
        lock: scriptSchema,
        ctType: scriptSchema,
        capacity: quantityU64,
        data: hex,
    }).strict(),
    publicSignals: z.object({
        poolDomain: frLe,
        assetDomain: frLe,
        denomination: positiveU128Le,
        value: positiveU128Le,
        root: frLe,
        nullifierHash: frLe,
        recipientDomain: frLe,
        actionHash: frLe,
        authTag: frLe,
    }).strict(),
    proof: z.object({
        system: z.literal('groth16-bn254'),
        bytes: hex.refine(value => value.length === 514, 'Groth16 proof must be exactly 256 bytes'),
    }).strict(),
    maxFeeShannons: quantityU64,
}).strict();

function sameOutPoint(left: { txHash: Hex; index: Hex }, right: { txHash: Hex; index: Hex }) {
    return left.txHash === right.txHash && left.index === right.index;
}

function sameScript(left: ScriptRef, right: ScriptRef) {
    return left.codeHash === right.codeHash && left.hashType === right.hashType && left.args === right.args;
}

function sameRecipient(
    left: WithdrawalIntentV1['recipient'],
    right: WithdrawalIntentV1['recipient'],
) {
    return sameScript(left.lock, right.lock) &&
        sameScript(left.ctType, right.ctType) &&
        left.capacity === right.capacity &&
        left.data === right.data;
}

function assertEqual(name: string, actual: string, expected: string) {
    if (actual !== expected) {
        throw new Error(`${name} does not match authoritative chain state`);
    }
}

function littleEndianFieldToBigInt(value: Hex): bigint {
    return decodeLittleEndianHex(value);
}

export function parseWithdrawalIntentV1(input: unknown): WithdrawalIntentV1 {
    const intent = withdrawalIntentV1Schema.parse(input) as WithdrawalIntentV1;
    assertCanonicalGroth16Proof(intent.proof.bytes);
    return intent;
}

export function parsePoolChainSnapshotV1(input: unknown): PoolChainSnapshotV1 {
    const snapshot = poolChainSnapshotV1Schema.parse(input) as PoolChainSnapshotV1;
    const denomination = decodeLittleEndianHex(snapshot.denomination);
    const outstandingCount = BigInt(snapshot.outstandingCount);
    const outstandingValue = BigInt(snapshot.outstandingValue);
    if (BigInt(snapshot.nextLeafIndex) > (1n << 20n)) {
        throw new Error('next leaf index exceeds the depth-20 tree capacity');
    }
    if (outstandingCount > BigInt(snapshot.nextLeafIndex)) {
        throw new Error('outstanding count exceeds accepted commitment count');
    }
    if (denomination * outstandingCount !== outstandingValue) {
        throw new Error('PoolState outstanding value does not match denomination times count');
    }
    if (BigInt(snapshot.vaultValue) !== outstandingValue) {
        throw new Error('logical Vault value does not match PoolState accounting');
    }
    if (snapshot.acceptedRoots.length > snapshot.rootHistorySize ||
        snapshot.acceptedRoots.at(-1) !== snapshot.root) {
        throw new Error('accepted root window must end with the current PoolState root');
    }
    if (snapshot.poolState.txHash === snapshot.vault.txHash &&
        snapshot.poolState.index === snapshot.vault.index) {
        throw new Error('PoolState and Vault must use distinct outpoints');
    }
    if (Script.from(snapshot.ctType).hash() !== snapshot.assetId) {
        throw new Error('asset id does not match the canonical CT type script hash');
    }
    return snapshot;
}

export function parseStagingDepositV1(input: unknown): StagingDepositV1 {
    return stagingDepositV1Schema.parse(input) as StagingDepositV1;
}

export function parseTransactionHash(input: unknown): Hex {
    return byte32.parse(input) as Hex;
}

export function validateIntentAgainstChain(
    intent: WithdrawalIntentV1,
    chain: PoolChainSnapshotV1,
    protectedFields: ProtectedWithdrawalFields,
): void {
    assertEqual('pool id', intent.poolId, chain.poolId);
    assertEqual('pool domain', intent.publicSignals.poolDomain, chain.poolDomain);
    assertEqual('asset domain', intent.publicSignals.assetDomain, chain.assetDomain);
    assertEqual('denomination', intent.publicSignals.denomination, chain.denomination);
    assertEqual('value', intent.publicSignals.value, chain.denomination);
    assertEqual('expected proof root', intent.expectedState.root, intent.publicSignals.root);
    if (!chain.acceptedRoots.includes(intent.publicSignals.root)) {
        throw new Error('proof root is not in the authoritative accepted-root window');
    }
    assertEqual('state sequence', intent.expectedState.sequence, chain.sequence);
    assertEqual('vault value', intent.expectedState.vaultValue, chain.vaultValue);
    assertEqual('recipient domain', intent.publicSignals.recipientDomain, protectedFields.recipientDomain);
    assertEqual('action hash', intent.publicSignals.actionHash, protectedFields.actionHash);

    if (!sameOutPoint(intent.expectedState.poolState, chain.poolState)) {
        throw new Error('pool state input is stale');
    }
    if (!sameOutPoint(intent.expectedState.vault, chain.vault)) {
        throw new Error('vault input is stale');
    }
    if (!sameScript(intent.recipient.ctType, chain.ctType)) {
        throw new Error('recipient CT type does not match the pool asset');
    }
    if (BigInt(intent.expectedState.vaultValue) < littleEndianFieldToBigInt(chain.denomination)) {
        throw new Error('vault does not contain one full denomination');
    }
}

export function validateReconstructedPlan(
    intent: WithdrawalIntentV1,
    plan: WithdrawalPlanV1,
): void {
    if (plan.feeShannons < 0n || plan.feeShannons > BigInt(intent.maxFeeShannons)) {
        throw new Error('reconstructed transaction exceeds the intent fee ceiling');
    }
    assertEqual('plan recipient domain', plan.protectedFields.recipientDomain, intent.publicSignals.recipientDomain);
    assertEqual('plan action hash', plan.protectedFields.actionHash, intent.publicSignals.actionHash);

    if (!sameRecipient(plan.recipient, intent.recipient)) {
        throw new Error('reconstructed transaction changed the protected recipient output');
    }
    if (plan.privacyInputOutPoints.length !== 2) {
        throw new Error('withdrawal must consume exactly PoolState and Vault privacy inputs');
    }
    if (!sameOutPoint(plan.privacyInputOutPoints[0], intent.expectedState.poolState) ||
        !sameOutPoint(plan.privacyInputOutPoints[1], intent.expectedState.vault)) {
        throw new Error('withdrawal plan changed or reordered the expected PoolState/Vault inputs');
    }
    if (plan.feeInputs.some(input => input.type !== undefined)) {
        throw new Error('relayer fee inputs must be untyped CKB cells');
    }
    const protectedKeys = new Set(plan.privacyInputOutPoints.map(input => `${input.txHash}:${input.index}`));
    if (plan.feeInputs.some(input => protectedKeys.has(`${input.outPoint.txHash}:${input.outPoint.index}`))) {
        throw new Error('relayer fee inputs must not duplicate privacy inputs');
    }
    const feeKeys = plan.feeInputs.map(input => `${input.outPoint.txHash}:${input.outPoint.index}`);
    if (new Set(feeKeys).size !== feeKeys.length) {
        throw new Error('relayer fee inputs must not contain duplicate outpoints');
    }
}
