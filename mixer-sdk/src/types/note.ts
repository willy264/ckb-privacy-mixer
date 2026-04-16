import type { HexString, MerkleProof } from './proof';

/**
 * A deposit note represents the private data a user holds
 * after joining a mix. Used to claim the withdrawal later.
 */
export interface DepositNote {
    /** The session ID this note belongs to */
    sessionId: string;
    /** The ct input cell outpoint that was committed */
    inputOutPoint: string;
    /** The blinding factor used in the Pedersen commitment (hex, 32 bytes) */
    blindingFactor: string;
    /** The one-time stealth address where the output is directed */
    stealthOutputAddress: string;
    /** Unix timestamp when the note was created */
    createdAt: number;
    /** Mock or real deposit commitment backing this note */
    commitment?: HexString;
    /** Deterministic nullifier derived from the note secret */
    nullifier?: HexString;
    /** Merkle leaf index once the note is inserted into a tree */
    leafIndex?: number;
    /** Merkle root associated with the note at proof generation time */
    merkleRoot?: HexString;
    /** Local Phase 4 membership proof scaffold */
    merkleProof?: MerkleProof;
}
