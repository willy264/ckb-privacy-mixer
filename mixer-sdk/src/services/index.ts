import type { PrivacyCoordinatorService } from './coordinator.js';
import type { PrivacyIndexerService, PrivacyStateVerifier } from './indexer.js';
import type { PrivacyRelayerService } from './relayer.js';

export * from './coordinator.js';
export * from './indexer.js';
export * from './relayer.js';

export interface PrivacyServices {
    readonly indexer?: PrivacyIndexerService;
    readonly stateVerifier?: PrivacyStateVerifier;
    readonly coordinator?: PrivacyCoordinatorService;
    readonly relayer?: PrivacyRelayerService;
}
