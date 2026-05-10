import type { HexString, MerkleProof, ProofEncoding } from './proof';
import type { RuntimeMode, WithdrawalAuthorityMode } from './config';

/**
 * A deposit note represents the private data a user holds
 * after joining a mix. Used to claim the withdrawal later.
 */
export interface DepositNote {
    /** Schema version for vault migrations */
    version?: 2;
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
    /** Deposit commitment backing this note */
    commitment?: HexString;
    /** Local session snapshot used for proof construction */
    sessionCommitments?: HexString[];
    /** Deterministic nullifier derived from the note secret */
    nullifier?: HexString;
    /** Merkle leaf index once the note is inserted into a tree */
    leafIndex?: number;
    /** Merkle root associated with the note at proof generation time */
    merkleRoot?: HexString;
    /** Local membership proof scaffold */
    merkleProof?: MerkleProof;
    /** Proof packing version used during last preparation */
    proofEncoding?: ProofEncoding;
    /** Optional deposit transaction hash when available */
    depositTxHash?: HexString;
    /** Runtime mode under which the note was created */
    runtimeMode?: RuntimeMode;
    /** Registry snapshot metadata carried with the note */
    registrySnapshot?: {
        outPoint?: string;
        size?: number;
        authority?: WithdrawalAuthorityMode;
    };
}
