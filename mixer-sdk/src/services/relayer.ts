import {
    Script,
    bytesFrom,
    hexFrom,
    type Client,
    type ScriptLike,
} from '@ckb-ccc/core';
import { InvalidEncodingError, InvariantViolationError } from '../core/errors.js';
import {
    assertHex32,
    assertUnsignedInteger,
    fieldToLeBytes,
    type FieldHex,
    type Hex32,
} from '../crypto/field.js';
import { assertOutPoint, outPointsEqual, type OutPointRef } from '../protocol/state.js';
import {
    V1_GROTH16_PROOF_ENCODING,
    decodeV1Groth16Coordinates,
    v1PublicSignalsToFields,
    type V1Groth16Proof,
    type V1PublicSignals,
} from '../prover/index.js';

export type V1WireHex = `0x${string}`;
export type V1WireQuantity = `0x${string}`;

export interface V1WithdrawalExpectedState {
    readonly sequence: bigint;
    readonly poolState: OutPointRef;
    readonly vault: OutPointRef;
    readonly root: FieldHex;
    readonly vaultValue: bigint;
}

export interface V1WithdrawalRecipient {
    readonly lock: ScriptLike;
    readonly ctType: ScriptLike;
    readonly capacity: bigint;
    readonly data: Uint8Array;
}

/** SDK-native intent. Use serializeV1WithdrawalIntent before network transport. */
export interface V1WithdrawalIntent {
    readonly poolId: Hex32;
    readonly expectedState: V1WithdrawalExpectedState;
    readonly recipient: V1WithdrawalRecipient;
    readonly publicSignals: V1PublicSignals;
    readonly proof: V1Groth16Proof;
    readonly maxFeeShannons: bigint;
}

export interface V1WireOutPoint {
    readonly txHash: Hex32;
    readonly index: V1WireQuantity;
}

export interface V1WireScript {
    readonly codeHash: Hex32;
    readonly hashType: 'data' | 'data1' | 'data2' | 'type';
    readonly args: V1WireHex;
}

/** Exact JSON DTO accepted by the corrected V1 backend relayer. */
export interface V1WithdrawalIntentWire {
    readonly version: 1;
    readonly poolId: Hex32;
    readonly expectedState: {
        readonly sequence: V1WireQuantity;
        readonly poolState: V1WireOutPoint;
        readonly vault: V1WireOutPoint;
        readonly root: Hex32;
        readonly vaultValue: V1WireQuantity;
    };
    readonly recipient: {
        readonly lock: V1WireScript;
        readonly ctType: V1WireScript;
        readonly capacity: V1WireQuantity;
        readonly data: V1WireHex;
    };
    /** All nine fields are exactly 32-byte little-endian BN254 Fr encodings. */
    readonly publicSignals: Readonly<Record<keyof V1PublicSignals, Hex32>>;
    readonly proof: {
        readonly system: 'groth16-bn254';
        readonly bytes: V1WireHex;
    };
    readonly maxFeeShannons: V1WireQuantity;
}

function toQuantity(value: bigint, bits: number, name: string): V1WireQuantity {
    assertUnsignedInteger(value, bits, name);
    return `0x${value.toString(16)}`;
}

function toWireOutPoint(value: OutPointRef, name: string): V1WireOutPoint {
    assertOutPoint(value, name);
    return Object.freeze({
        txHash: assertHex32(value.txHash, `${name}.txHash`),
        index: toQuantity(BigInt(value.index), 32, `${name}.index`),
    });
}

function toWireScript(value: ScriptLike, name: string): V1WireScript {
    const script = Script.from(value);
    return Object.freeze({
        codeHash: assertHex32(script.codeHash, `${name}.codeHash`),
        hashType: script.hashType,
        args: hexFrom(bytesFrom(script.args)) as V1WireHex,
    });
}

function toWirePublicSignals(signals: V1PublicSignals): V1WithdrawalIntentWire['publicSignals'] {
    const fields = v1PublicSignalsToFields(signals);
    return Object.freeze({
        poolDomain: hexFrom(fieldToLeBytes(fields[0])) as Hex32,
        assetDomain: hexFrom(fieldToLeBytes(fields[1])) as Hex32,
        denomination: hexFrom(fieldToLeBytes(fields[2])) as Hex32,
        value: hexFrom(fieldToLeBytes(fields[3])) as Hex32,
        root: hexFrom(fieldToLeBytes(fields[4])) as Hex32,
        nullifierHash: hexFrom(fieldToLeBytes(fields[5])) as Hex32,
        recipientDomain: hexFrom(fieldToLeBytes(fields[6])) as Hex32,
        actionHash: hexFrom(fieldToLeBytes(fields[7])) as Hex32,
        authTag: hexFrom(fieldToLeBytes(fields[8])) as Hex32,
    });
}

function assertSamePublicSignals(left: V1PublicSignals, right: V1PublicSignals): void {
    const leftFields = v1PublicSignalsToFields(left);
    const rightFields = v1PublicSignalsToFields(right);
    if (leftFields.some((field, index) => field !== rightFields[index])) {
        throw new InvariantViolationError('Proof public signals do not match the withdrawal intent.');
    }
}

export function serializeV1WithdrawalIntent(intent: V1WithdrawalIntent): V1WithdrawalIntentWire {
    const poolId = assertHex32(intent.poolId, 'intent.poolId');
    if (intent.expectedState.root !== intent.publicSignals.root) {
        throw new InvariantViolationError('Expected PoolState root must equal the proof root.');
    }
    if (outPointsEqual(intent.expectedState.poolState, intent.expectedState.vault)) {
        throw new InvariantViolationError('PoolState and Vault inputs must be distinct outpoints.');
    }
    if (intent.proof.encoding !== V1_GROTH16_PROOF_ENCODING) {
        throw new InvalidEncodingError(`Unsupported proof encoding: ${String(intent.proof.encoding)}`);
    }
    assertSamePublicSignals(intent.publicSignals, intent.proof.publicSignals);
    decodeV1Groth16Coordinates(intent.proof.bytes);

    return Object.freeze({
        version: 1,
        poolId,
        expectedState: Object.freeze({
            sequence: toQuantity(intent.expectedState.sequence, 64, 'expectedState.sequence'),
            poolState: toWireOutPoint(intent.expectedState.poolState, 'expectedState.poolState'),
            vault: toWireOutPoint(intent.expectedState.vault, 'expectedState.vault'),
            root: hexFrom(fieldToLeBytes(intent.expectedState.root)) as Hex32,
            vaultValue: toQuantity(intent.expectedState.vaultValue, 128, 'expectedState.vaultValue'),
        }),
        recipient: Object.freeze({
            lock: toWireScript(intent.recipient.lock, 'recipient.lock'),
            ctType: toWireScript(intent.recipient.ctType, 'recipient.ctType'),
            capacity: toQuantity(intent.recipient.capacity, 64, 'recipient.capacity'),
            data: hexFrom(intent.recipient.data) as V1WireHex,
        }),
        publicSignals: toWirePublicSignals(intent.publicSignals),
        proof: Object.freeze({
            system: 'groth16-bn254',
            bytes: hexFrom(intent.proof.bytes) as V1WireHex,
        }),
        maxFeeShannons: toQuantity(intent.maxFeeShannons, 64, 'maxFeeShannons'),
    });
}

export interface RelayerOperationStatus {
    readonly state: 'queued' | 'validated' | 'submitted' | 'committed' | 'failed';
    readonly transactionHash?: Hex32;
}

export interface PrivacyRelayerService {
    submitWithdrawal(input: {
        readonly client: Client;
        readonly intent: V1WithdrawalIntentWire;
        readonly signal?: AbortSignal;
    }): Promise<{ readonly operationId: string }>;
    getOperation(
        operationId: string,
        options?: { readonly signal?: AbortSignal },
    ): Promise<RelayerOperationStatus>;
}
