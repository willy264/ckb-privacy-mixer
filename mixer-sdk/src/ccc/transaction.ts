import { Transaction, bytesFrom, type TransactionLike } from '@ckb-ccc/core';
import { InvariantViolationError } from '../core/errors.js';
import { assertFieldHex, assertHex32, type FieldHex, type Hex32 } from '../crypto/field.js';
import { deriveV1RecipientDomain } from '../crypto/script-domain.js';
import {
    deriveV1ActionHash,
    deriveV1RecipientCtCommitmentHash,
    deriveV1RecipientCtDataHash,
    type V1ActionContext,
} from '../protocol/actions.js';
import type { V1PoolConfig } from '../protocol/pool.js';
import { assertOutPoint, outPointsEqual, type OutPointRef } from '../protocol/state.js';

export interface V1TransactionPlan {
    readonly poolId: Hex32;
    readonly pool: V1PoolConfig;
    readonly expectedStateInput: OutPointRef;
    readonly expectedVaultInput: OutPointRef;
    readonly actionContext: V1ActionContext;
    readonly actionHash: FieldHex;
    readonly transaction: TransactionLike;
}

export interface DecodedRecipientCtOutput {
    readonly value: bigint;
    readonly commitment: Uint8Array;
}

export interface V1RecipientCtCodec {
    readonly encoding: string;
    decodeRecipientOutputData(data: Uint8Array): DecodedRecipientCtOutput;
}

/**
 * Performs narrow materialization checks on an already constructed transaction.
 * It does not validate successor PoolState/Vault cells, nullifier updates,
 * proofs/witnesses, cell deps, resolved fee inputs, total capacity, or live
 * state. A consensus-aware planner and full transaction validator remain
 * required before signing or submission.
 */
export async function materializeV1Transaction(
    plan: V1TransactionPlan,
    ctCodec: V1RecipientCtCodec,
): Promise<Transaction> {
    assertHex32(plan.poolId, 'plan.poolId');
    if (plan.pool.id !== plan.poolId || plan.actionContext.poolDomain !== plan.pool.poolDomain ||
        plan.actionContext.assetDomain !== plan.pool.assetDomain ||
        plan.actionContext.denomination !== plan.pool.denomination) {
        throw new InvariantViolationError('Transaction plan does not match the selected pool configuration.');
    }
    assertOutPoint(plan.expectedStateInput, 'plan.expectedStateInput');
    assertOutPoint(plan.expectedVaultInput, 'plan.expectedVaultInput');
    if (outPointsEqual(plan.expectedStateInput, plan.expectedVaultInput)) {
        throw new InvariantViolationError('Expected PoolState and Vault inputs must be distinct.');
    }
    const declaredHash = assertFieldHex(plan.actionHash, 'plan.actionHash');
    const derivedHash = await deriveV1ActionHash(plan.actionContext);
    if (declaredHash !== derivedHash) {
        throw new InvariantViolationError('Transaction plan action hash does not match protected fields.');
    }
    if (!ctCodec || typeof ctCodec.decodeRecipientOutputData !== 'function' || !ctCodec.encoding) {
        throw new InvariantViolationError('A named corrected-V1 CT output codec is required.');
    }

    const transaction = Transaction.from(plan.transaction);
    const stateInputCount = transaction.inputs.filter(input =>
        input.previousOutput?.eq(plan.expectedStateInput)).length;
    const vaultInputCount = transaction.inputs.filter(input =>
        input.previousOutput?.eq(plan.expectedVaultInput)).length;
    if (stateInputCount !== 1) {
        throw new InvariantViolationError(
            'CCC transaction must consume the expected PoolState outpoint exactly once.',
        );
    }
    if (vaultInputCount !== 1) {
        throw new InvariantViolationError(
            'CCC transaction must consume the expected Vault outpoint exactly once.',
        );
    }
    const outputIndex = plan.actionContext.recipientOutputIndex;
    const output = transaction.outputs[outputIndex];
    const outputDataHex = transaction.outputsData[outputIndex];
    if (!output || outputDataHex === undefined) {
        throw new InvariantViolationError('Protected recipient output index is absent from the transaction.');
    }
    if (!output.type || output.type.hash() !== plan.pool.assetId) {
        throw new InvariantViolationError('Protected recipient output has the wrong CT asset type.');
    }
    if (output.capacity !== plan.actionContext.recipientOutputCapacity) {
        throw new InvariantViolationError('Protected recipient output has the wrong capacity reserve.');
    }

    const outputData = bytesFrom(outputDataHex);
    const decoded = ctCodec.decodeRecipientOutputData(outputData);
    if (decoded.value !== plan.actionContext.value || decoded.value !== plan.pool.denomination) {
        throw new InvariantViolationError('Protected recipient CT output has the wrong value.');
    }
    const [recipientDomain, commitmentHash, outputDataHash] = await Promise.all([
        deriveV1RecipientDomain(output.lock),
        deriveV1RecipientCtCommitmentHash(decoded.commitment),
        deriveV1RecipientCtDataHash(outputData),
    ]);
    if (recipientDomain !== plan.actionContext.recipientDomain ||
        commitmentHash !== plan.actionContext.recipientCtCommitmentHash ||
        outputDataHash !== plan.actionContext.recipientCtDataHash) {
        throw new InvariantViolationError('CCC transaction recipient CT output differs from protected action fields.');
    }
    return transaction;
}
