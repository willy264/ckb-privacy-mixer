import type { Client } from '@ckb-ccc/core';
import {
    createPrivacyClient,
    type PrivacyCapabilities,
    type PrivacyDeployment,
    type PrivacyIndexerService,
    type PrivacyStateStore,
    type PrivacyStateVerifier,
} from 'mixer-sdk';

export interface PaymentPrivacyDependencies {
    readonly cccClient: Client;
    readonly deployment: PrivacyDeployment;
    readonly stateStore: PrivacyStateStore;
    readonly indexer: PrivacyIndexerService;
    readonly stateVerifier: PrivacyStateVerifier;
}

export interface PaymentPrivacyView {
    readonly protocolVersion: 'obscell-v1';
    readonly sync: 'verified-by-injected-adapter';
    readonly poolId: string;
    readonly assetId: string;
    readonly denomination: bigint;
    readonly privateAmount: bigint;
    readonly spendableNotes: number;
    readonly stateSequence: bigint;
    readonly liveOperationsAvailable: boolean;
    readonly stateProtection: PrivacyCapabilities['privateStateProtection'];
}

/** A deliberately small application-facing adapter over the public SDK surface. */
export class PaymentPrivacyModel {
    private readonly privacyClient;

    constructor(dependencies: PaymentPrivacyDependencies) {
        this.privacyClient = createPrivacyClient({
            client: dependencies.cccClient,
            deployment: dependencies.deployment,
            stateStore: dependencies.stateStore,
            services: {
                indexer: dependencies.indexer,
                stateVerifier: dependencies.stateVerifier,
            },
        });
    }

    async refresh(poolId: string): Promise<PaymentPrivacyView> {
        const capabilities = await this.privacyClient.getCapabilities();
        if (capabilities.sync !== 'supported') {
            throw new Error('Payment privacy requires both indexer and state-verifier adapters.');
        }

        await this.privacyClient.sync({ poolId });
        const balance = await this.privacyClient.getPrivateBalance({ poolId });
        const liveOperationsAvailable = capabilities.shield === 'supported' ||
            capabilities.unshieldDirect === 'supported' ||
            capabilities.unshieldRelayed === 'supported';

        return Object.freeze({
            protocolVersion: capabilities.protocolVersion,
            sync: 'verified-by-injected-adapter',
            poolId: balance.poolId,
            assetId: balance.assetId,
            denomination: balance.denomination,
            privateAmount: balance.amount,
            spendableNotes: balance.noteCount,
            stateSequence: balance.stateSequence,
            liveOperationsAvailable,
            stateProtection: capabilities.privateStateProtection,
        });
    }
}

export function createPaymentPrivacyModel(
    dependencies: PaymentPrivacyDependencies,
): PaymentPrivacyModel {
    return new PaymentPrivacyModel(dependencies);
}
