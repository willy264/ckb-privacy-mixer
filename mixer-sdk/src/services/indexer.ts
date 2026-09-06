import type { Client } from '@ckb-ccc/core';
import type { FieldHex } from '../crypto/field.js';
import type { NoteMetadata, NoteState } from '../notes/models.js';
import type { V1PoolConfig } from '../protocol/pool.js';
import type { V1ProtocolSnapshot } from '../protocol/state.js';

export interface NoteChainUpdate {
    readonly commitment: FieldHex;
    readonly state: Extract<NoteState, 'staged' | 'accepted' | 'spent' | 'refunded' | 'orphaned'>;
    readonly leafIndex?: number;
    readonly acceptedRoot?: FieldHex;
}

export interface PoolSyncResult {
    readonly snapshot: V1ProtocolSnapshot;
    /** Public chain observations only. This interface must never carry note secrets. */
    readonly noteUpdates: readonly NoteChainUpdate[];
}

export interface PrivacyIndexerService {
    syncPool(input: {
        readonly client: Client;
        readonly pool: V1PoolConfig;
        readonly previousSnapshot?: V1ProtocolSnapshot;
        readonly signal?: AbortSignal;
    }): Promise<PoolSyncResult>;
}

/**
 * Security-critical boundary that must independently confirm live CKB cells,
 * block identity, decoded state, and note inclusion/spend evidence. Indexer
 * responses are observations and must never be committed without this check.
 */
export interface PrivacyStateVerifier {
    verifyPoolSync(input: {
        readonly client: Client;
        readonly pool: V1PoolConfig;
        readonly previousSnapshot?: V1ProtocolSnapshot;
        readonly result: PoolSyncResult;
        /** Public projections only; note secrets must never cross this boundary. */
        readonly localNotes: readonly NoteMetadata[];
        readonly signal?: AbortSignal;
    }): Promise<void>;
}
