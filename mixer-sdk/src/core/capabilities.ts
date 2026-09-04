export type CapabilityAvailability = 'supported' | 'unavailable';

export interface PrivacyCapabilities {
    readonly protocolVersion: 'obscell-v1';
    readonly sync: CapabilityAvailability;
    readonly localNotes: CapabilityAvailability;
    readonly privateStateProtection: 'encrypted-at-rest' | 'memory-only';
    readonly privateBalance: CapabilityAvailability;
    readonly localProofGeneration: CapabilityAvailability;
    readonly shield: CapabilityAvailability;
    readonly refund: CapabilityAvailability;
    readonly unshieldDirect: CapabilityAvailability;
    readonly unshieldRelayed: CapabilityAvailability;
    readonly privateTransfer: 'unavailable';
    readonly arbitraryValues: 'unavailable';
    readonly shieldedChange: 'unavailable';
    readonly multiOutputJoinSplit: 'unavailable';
    readonly advancedStealth: 'unavailable';
    readonly limitations: readonly string[];
}

export function createCapabilities(options: {
    hasIndexer: boolean;
    hasStateVerifier: boolean;
    hasProver: boolean;
    stateProtection: 'encrypted-at-rest' | 'memory-only';
}): PrivacyCapabilities {
    const limitations = [
        'Corrected V1 on-chain transaction builders are not implemented in this SDK foundation.',
        'No production CKB state decoder or PrivacyStateVerifier implementation is included.',
        'No live shield, refund, or unshield operation is reported as supported.',
        'Private transfers, arbitrary values, shielded change, join-split, and advanced stealth are outside V1.',
    ];

    if (!options.hasIndexer || !options.hasStateVerifier) {
        limitations.push(
            'Pool synchronization requires both an injected indexer and an authoritative CKB state verifier.',
        );
    }
    limitations.push(options.hasProver
        ? 'A prover is injected, but PrivacyClient exposes no callable corrected-V1 proof workflow.'
        : 'Local proof generation requires both an injected prover and a callable corrected-V1 workflow.');
    if (options.stateProtection === 'memory-only') {
        limitations.push('The injected state store is memory-only and is not suitable for persistent private notes.');
    }

    return Object.freeze({
        protocolVersion: 'obscell-v1',
        sync: options.hasIndexer && options.hasStateVerifier ? 'supported' : 'unavailable',
        localNotes: 'supported',
        privateStateProtection: options.stateProtection,
        privateBalance: 'supported',
        localProofGeneration: 'unavailable',
        shield: 'unavailable',
        refund: 'unavailable',
        unshieldDirect: 'unavailable',
        unshieldRelayed: 'unavailable',
        privateTransfer: 'unavailable',
        arbitraryValues: 'unavailable',
        shieldedChange: 'unavailable',
        multiOutputJoinSplit: 'unavailable',
        advancedStealth: 'unavailable',
        limitations: Object.freeze(limitations),
    });
}
