import type { Client } from '@ckb-ccc/core';
import type { FieldHex, Hex32 } from '../crypto/field.js';
import type { OutPointRef } from '../protocol/state.js';

export interface StagingDepositReference {
    readonly poolId: Hex32;
    readonly outPoint: OutPointRef;
    readonly commitment: FieldHex;
}

export interface CoordinatorOperationStatus {
    readonly state: 'queued' | 'validated' | 'submitted' | 'committed' | 'failed';
    readonly transactionHash?: Hex32;
}

export interface PrivacyCoordinatorService {
    requestAcceptance(input: {
        readonly client: Client;
        readonly staging: StagingDepositReference;
        readonly signal?: AbortSignal;
    }): Promise<{ readonly operationId: string }>;
    getOperation(
        operationId: string,
        options?: { readonly signal?: AbortSignal },
    ): Promise<CoordinatorOperationStatus>;
}
