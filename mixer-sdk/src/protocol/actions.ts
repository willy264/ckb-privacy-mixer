import { InvalidArgumentError, InvariantViolationError } from '../core/errors.js';
import {
    assertFieldHex,
    assertUnsignedInteger,
    fieldFromBigInt,
    type FieldHex,
} from '../crypto/field.js';
import { V1_DOMAIN_TAGS } from '../crypto/domains.js';
import { poseidonHash, poseidonHashBytes } from '../crypto/poseidon.js';

export type V1ActionKind = 'accept' | 'withdraw' | 'refund';

/** Fixed by the corrected V1 transaction layout: PoolState, Vault, recipient. */
export const V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX = 2 as const;

export interface V1ActionContext {
    readonly kind: V1ActionKind;
    readonly poolDomain: FieldHex;
    readonly assetDomain: FieldHex;
    readonly denomination: bigint;
    readonly value: bigint;
    readonly acceptedRoot: FieldHex;
    readonly nullifierHash: FieldHex;
    readonly currentStateSequence: bigint;
    readonly nextStateSequence: bigint;
    readonly recipientDomain: FieldHex;
    /** Poseidon byte-domain hash of the exact serialized recipient CT commitment. */
    readonly recipientCtCommitmentHash: FieldHex;
    /** Poseidon byte-domain hash of the exact serialized recipient CT output data. */
    readonly recipientCtDataHash: FieldHex;
    readonly recipientOutputIndex: number;
    readonly recipientOutputCapacity: bigint;
    readonly vaultInputAmount: bigint;
    readonly vaultOutputAmount: bigint;
}

const ACTION_KIND: Readonly<Record<V1ActionKind, bigint>> = {
    accept: 1n,
    withdraw: 2n,
    refund: 3n,
};

export function deriveV1RecipientCtDataHash(data: Uint8Array): Promise<FieldHex> {
    return poseidonHashBytes(V1_DOMAIN_TAGS.recipientCtData, data);
}

export function deriveV1RecipientCtCommitmentHash(commitment: Uint8Array): Promise<FieldHex> {
    return poseidonHashBytes(V1_DOMAIN_TAGS.recipientCtCommitment, commitment);
}

export async function deriveV1ActionHash(context: V1ActionContext): Promise<FieldHex> {
    if (!(context.kind in ACTION_KIND)) {
        throw new InvalidArgumentError(`Unknown V1 action kind: ${String(context.kind)}`);
    }
    if (context.value !== context.denomination) {
        throw new InvariantViolationError('V1 action value must equal the pool denomination.');
    }
    assertUnsignedInteger(context.currentStateSequence, 64, 'currentStateSequence');
    assertUnsignedInteger(context.nextStateSequence, 64, 'nextStateSequence');
    assertUnsignedInteger(context.vaultInputAmount, 128, 'vaultInputAmount');
    assertUnsignedInteger(context.vaultOutputAmount, 128, 'vaultOutputAmount');
    assertUnsignedInteger(context.recipientOutputCapacity, 64, 'recipientOutputCapacity');
    if (!Number.isSafeInteger(context.recipientOutputIndex) || context.recipientOutputIndex < 0 ||
        context.recipientOutputIndex > 0xffffffff) {
        throw new InvalidArgumentError('recipientOutputIndex must be an unsigned 32-bit integer.');
    }

    if (context.kind === 'accept' &&
        context.vaultOutputAmount !== context.vaultInputAmount + context.value) {
        throw new InvariantViolationError('Acceptance action does not conserve Vault CT.');
    }
    if (context.kind === 'withdraw') {
        if (context.recipientOutputIndex !== V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX) {
            throw new InvariantViolationError(
                `V1 withdrawal recipient output index must be ${V1_WITHDRAWAL_RECIPIENT_OUTPUT_INDEX}.`,
            );
        }
        if (context.vaultInputAmount < context.value ||
            context.vaultOutputAmount !== context.vaultInputAmount - context.value) {
            throw new InvariantViolationError('Withdrawal action does not conserve Vault CT.');
        }
    }
    if (context.kind === 'refund' && context.vaultOutputAmount !== context.vaultInputAmount) {
        throw new InvariantViolationError('Refund must not move CT through the Vault.');
    }
    if (context.kind === 'refund') {
        if (context.nextStateSequence !== context.currentStateSequence) {
            throw new InvariantViolationError('A staging refund must not advance authoritative pool state.');
        }
    } else if (context.nextStateSequence !== context.currentStateSequence + 1n) {
        throw new InvariantViolationError('Acceptance and withdrawal must bind the next state sequence.');
    }

    const identityHash = await poseidonHash([
        V1_DOMAIN_TAGS.action,
        ACTION_KIND[context.kind],
        assertFieldHex(context.poolDomain, 'poolDomain'),
        assertFieldHex(context.assetDomain, 'assetDomain'),
        fieldFromBigInt(context.denomination, 'denomination'),
        fieldFromBigInt(context.value, 'value'),
    ]);
    const stateHash = await poseidonHash([
        V1_DOMAIN_TAGS.action,
        assertFieldHex(context.acceptedRoot, 'acceptedRoot'),
        assertFieldHex(context.nullifierHash, 'nullifierHash'),
        fieldFromBigInt(context.currentStateSequence, 'currentStateSequence'),
        fieldFromBigInt(context.nextStateSequence, 'nextStateSequence'),
    ]);
    const payoutHash = await poseidonHash([
        V1_DOMAIN_TAGS.action,
        assertFieldHex(context.recipientDomain, 'recipientDomain'),
        assertFieldHex(context.recipientCtCommitmentHash, 'recipientCtCommitmentHash'),
        assertFieldHex(context.recipientCtDataHash, 'recipientCtDataHash'),
        BigInt(context.recipientOutputIndex),
        fieldFromBigInt(context.recipientOutputCapacity, 'recipientOutputCapacity'),
        fieldFromBigInt(context.vaultInputAmount, 'vaultInputAmount'),
        fieldFromBigInt(context.vaultOutputAmount, 'vaultOutputAmount'),
    ]);
    return poseidonHash([
        V1_DOMAIN_TAGS.action,
        identityHash,
        stateHash,
        payoutHash,
    ]);
}
