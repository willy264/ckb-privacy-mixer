import {
  AggronWithdrawalProvider,
  buildMerkleTree,
  buildRealWithdrawalProof,
  buildWithdrawTransaction,
  deriveCommitment,
  randomBlindingFactor,
  type LocalWithdrawalProofResult,
  type WithdrawalTransaction,
} from 'mixer-sdk';
import { getGroth16ArtifactUrls, tryLoadFrontendRuntimeConfig } from './runtime';
import type { DepositNote, WithdrawalMode } from './vault';

const SUPPORTED_DENOMINATION = 100n;

export interface PreparedVaultWithdrawal {
  mode: WithdrawalMode;
  proof: LocalWithdrawalProofResult;
  transaction: WithdrawalTransaction;
  warnings: string[];
  sessionSize: number;
  registrySize: number;
}

export async function buildSessionCommitments(
  userCommitment: string,
  participantCount: number,
) {
  const sessionSize = Math.max(3, participantCount);
  const leafIndex = Math.floor(Math.random() * sessionSize);
  const commitments = await Promise.all(
    Array.from({ length: sessionSize }, async (_, index) => {
      if (index === leafIndex) {
        return userCommitment;
      }

      const peerSessionId = `peer_${Date.now().toString(36)}_${index}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      return deriveCommitment(randomBlindingFactor(), peerSessionId);
    }),
  );

  return { commitments, leafIndex };
}

function resolveSessionCommitments(note: DepositNote) {
  if (!note.commitment) {
    throw new Error('This vault note is missing its deposit commitment.');
  }

  if (note.sessionCommitments && note.sessionCommitments.length > 0) {
    return note.sessionCommitments;
  }

  return [note.commitment];
}

function resolveLeafIndex(note: DepositNote, commitments: string[]) {
  if (typeof note.leafIndex === 'number' && commitments[note.leafIndex] === note.commitment) {
    return note.leafIndex;
  }

  const derivedIndex = commitments.findIndex(commitment => commitment === note.commitment);
  if (derivedIndex >= 0) {
    return derivedIndex;
  }

  throw new Error('Unable to locate this note inside its local session commitment set.');
}

function buildLocalPreviewRegistry(note: DepositNote) {
  return {
    outPoint: `local-preview:${note.inputOutPoint}`,
    nullifiers: [],
    lock: 'always_success',
    capacity: '1000',
  };
}

export async function prepareVaultWithdrawal(note: DepositNote): Promise<PreparedVaultWithdrawal> {
  if (note.denomination !== Number(SUPPORTED_DENOMINATION)) {
    throw new Error('Only 100 CT notes are supported by the live mixer contracts right now.');
  }

  const commitments = resolveSessionCommitments(note);
  const leafIndex = resolveLeafIndex(note, commitments);
  const tree = await buildMerkleTree(commitments);
  const proof = await buildRealWithdrawalProof(
    note,
    tree,
    leafIndex,
    SUPPORTED_DENOMINATION,
    getGroth16ArtifactUrls(),
  );

  const warnings: string[] = [];
  const runtimeStatus = tryLoadFrontendRuntimeConfig();
  const liveConfig = runtimeStatus.config;

  if (runtimeStatus.error) {
    warnings.push(`${runtimeStatus.error} Using a local preview registry instead.`);
  }

  if (liveConfig?.nullifierRegistry) {
    try {
      const provider = new AggronWithdrawalProvider({
        config: liveConfig,
        denomination: SUPPORTED_DENOMINATION,
      });
      const resolution = await provider.resolveWithdrawal(note);
      const transaction = await buildWithdrawTransaction({
        note,
        registryCell: resolution.registryCell,
        proof,
        contracts: {
          nullifierType: liveConfig.nullifierType,
          zkMembershipType: liveConfig.zkMembershipType,
          ctTokenType: liveConfig.ctTokenType,
        },
        denomination: SUPPORTED_DENOMINATION,
      });

      return {
        mode: 'aggron-preview',
        proof,
        transaction,
        warnings,
        sessionSize: commitments.length,
        registrySize: resolution.registryCell.nullifiers.length,
      };
    } catch (error) {
      warnings.push(
        `${error instanceof Error ? error.message : 'Live registry lookup failed.'} Using a local preview registry instead.`,
      );
    }
  } else if (liveConfig) {
    warnings.push('Nullifier registry deployment values are missing, so this is a local preview transaction.');
  }

  const transaction = await buildWithdrawTransaction({
    note,
    registryCell: buildLocalPreviewRegistry(note),
    proof,
    contracts: liveConfig
      ? {
          nullifierType: liveConfig.nullifierType,
          zkMembershipType: liveConfig.zkMembershipType,
          ctTokenType: liveConfig.ctTokenType,
        }
      : undefined,
    denomination: SUPPORTED_DENOMINATION,
  });

  return {
    mode: 'local-preview',
    proof,
    transaction,
    warnings,
    sessionSize: commitments.length,
    registrySize: 0,
  };
}
