import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import { deriveV1AuthTag, deriveV1Leaf, deriveV1NullifierHash } from '../crypto/commitment.js';
import {
    assertFieldHex,
    fieldFromBigInt,
    fieldFromLeBytes,
    fieldToLeBytes,
    type FieldHex,
} from '../crypto/field.js';
import { computeV1MerkleRoot, type MerklePathBit } from '../merkle/paths.js';
import { V1_MERKLE_DEPTH } from '../protocol/pool.js';

export const V1_PUBLIC_SIGNAL_ORDER = Object.freeze([
    'poolDomain',
    'assetDomain',
    'denomination',
    'value',
    'root',
    'nullifierHash',
    'recipientDomain',
    'actionHash',
    'authTag',
] as const);

export type V1PublicSignalName = typeof V1_PUBLIC_SIGNAL_ORDER[number];

export interface V1PublicSignals {
    readonly poolDomain: FieldHex;
    readonly assetDomain: FieldHex;
    readonly denomination: bigint;
    readonly value: bigint;
    readonly root: FieldHex;
    readonly nullifierHash: FieldHex;
    readonly recipientDomain: FieldHex;
    readonly actionHash: FieldHex;
    readonly authTag: FieldHex;
}

export interface V1PrivateWitness {
    readonly secret: FieldHex;
    readonly nullifierSecret: FieldHex;
    readonly pathElements: readonly FieldHex[];
    readonly pathIndices: readonly MerklePathBit[];
}

export function v1PublicSignalsToFields(signals: V1PublicSignals): readonly FieldHex[] {
    if (signals.denomination <= 0n || signals.value !== signals.denomination) {
        throw new InvariantViolationError('V1 public value must equal a positive denomination.');
    }
    return Object.freeze([
        assertFieldHex(signals.poolDomain, 'poolDomain'),
        assertFieldHex(signals.assetDomain, 'assetDomain'),
        fieldFromBigInt(signals.denomination, 'denomination'),
        fieldFromBigInt(signals.value, 'value'),
        assertFieldHex(signals.root, 'root'),
        assertFieldHex(signals.nullifierHash, 'nullifierHash'),
        assertFieldHex(signals.recipientDomain, 'recipientDomain'),
        assertFieldHex(signals.actionHash, 'actionHash'),
        assertFieldHex(signals.authTag, 'authTag'),
    ]);
}

export function encodeV1PublicSignals(signals: V1PublicSignals): Uint8Array {
    const fields = v1PublicSignalsToFields(signals);
    const encoded = new Uint8Array(fields.length * 32);
    fields.forEach((field, index) => encoded.set(fieldToLeBytes(field), index * 32));
    return encoded;
}

export function decodeV1PublicSignals(bytes: Uint8Array): V1PublicSignals {
    const expectedLength = V1_PUBLIC_SIGNAL_ORDER.length * 32;
    if (bytes.length !== expectedLength) {
        throw new InvalidArgumentError(`V1 public signal ABI must contain exactly ${expectedLength} bytes.`);
    }
    const fields = V1_PUBLIC_SIGNAL_ORDER.map((name, index) =>
        fieldFromLeBytes(bytes.subarray(index * 32, (index + 1) * 32), name));
    const signals: V1PublicSignals = {
        poolDomain: fields[0],
        assetDomain: fields[1],
        denomination: BigInt(fields[2]),
        value: BigInt(fields[3]),
        root: fields[4],
        nullifierHash: fields[5],
        recipientDomain: fields[6],
        actionHash: fields[7],
        authTag: fields[8],
    };
    v1PublicSignalsToFields(signals);
    return Object.freeze(signals);
}

export async function assertV1WitnessMatchesStatement(
    signals: V1PublicSignals,
    witness: V1PrivateWitness,
): Promise<void> {
    v1PublicSignalsToFields(signals);
    assertFieldHex(witness.secret, 'secret');
    assertFieldHex(witness.nullifierSecret, 'nullifierSecret');
    if (witness.pathElements.length !== V1_MERKLE_DEPTH ||
        witness.pathIndices.length !== V1_MERKLE_DEPTH) {
        throw new InvalidArgumentError(`V1 witness requires exactly ${V1_MERKLE_DEPTH} Merkle levels.`);
    }

    const leafIndex = witness.pathIndices.reduce<number>((result, bit, level) => {
        if (bit !== 0 && bit !== 1) {
            throw new InvalidArgumentError(`pathIndices[${level}] must be 0 or 1.`);
        }
        return result + bit * 2 ** level;
    }, 0);
    const leaf = await deriveV1Leaf({
        poolDomain: signals.poolDomain,
        assetDomain: signals.assetDomain,
        denomination: signals.denomination,
        secret: witness.secret,
        nullifierSecret: witness.nullifierSecret,
    });
    const root = await computeV1MerkleRoot(signals.poolDomain, {
        leaf,
        leafIndex,
        siblings: witness.pathElements,
        pathIndices: witness.pathIndices,
    });
    const nullifierHash = await deriveV1NullifierHash({
        poolDomain: signals.poolDomain,
        nullifierSecret: witness.nullifierSecret,
        leafIndex,
    });
    const authTag = await deriveV1AuthTag({
        secret: witness.secret,
        recipientDomain: signals.recipientDomain,
        actionHash: signals.actionHash,
    });

    if (root !== signals.root) {
        throw new InvariantViolationError('Witness does not produce the declared Merkle root.');
    }
    if (nullifierHash !== signals.nullifierHash) {
        throw new InvariantViolationError('Witness does not produce the declared nullifier hash.');
    }
    if (authTag !== signals.authTag) {
        throw new InvariantViolationError('Witness does not produce the declared authorization tag.');
    }
}
