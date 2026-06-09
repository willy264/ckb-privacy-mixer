import {
  AggronWithdrawalProvider,
  buildMerkleTree,
  buildRealWithdrawalProof,
  buildWithdrawTransaction,
  type CkbTransaction,
  type LocalWithdrawalProofResult,
  type WithdrawalTransaction,
} from '../../mixer-sdk/dist/index.js';
import { getGroth16ArtifactUrls, tryLoadFrontendRuntimeConfig } from './runtime';
import { fetchDepositSession } from './relayer';
import { signTransactionWithJoyId } from './joyid';
import type { DepositNote, WithdrawalMode } from './vault';
import { submitToRelayer, pollRelayStatus, getRelayerUrl } from './relayer';

const SUPPORTED_DENOMINATION = 100n;

export interface PreparedVaultWithdrawal {
  mode: WithdrawalMode;
  proof: LocalWithdrawalProofResult;
  transaction: WithdrawalTransaction;
  warnings: string[];
  sessionSize: number;
  registrySize: number;
}

export interface PrepareVaultWithdrawalOptions {
  recipientLock?: string;
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

async function hydrateSessionCommitments(note: DepositNote) {
  const localCommitments = resolveSessionCommitments(note);
  if (!note.sessionId) {
    return localCommitments;
  }

  if (!note.sessionId.includes('-') && !note.sessionId.startsWith('pudge_ct_pool_')) {
    return localCommitments;
  }

  try {
    const remote = await fetchDepositSession(note.sessionId);
    if (remote.commitments.length > 0 && remote.commitments.includes(note.commitment!)) {
      note.sessionCommitments = remote.commitments as any;
      const refreshedIndex = remote.commitments.findIndex(commitment => commitment === note.commitment);
      if (refreshedIndex >= 0) {
        note.leafIndex = refreshedIndex;
      }
      note.registrySnapshot = {
        ...(note.registrySnapshot ?? {}),
        size: remote.size,
        authority: remote.status === 'complete' ? 'direct' : note.registrySnapshot?.authority,
      };
      if (remote.finalizedAt) {
        note.createdAt = Math.min(note.createdAt, remote.finalizedAt);
      }
      return remote.commitments;
    }
  } catch {
    // fall back to the locally stored snapshot
  }

  return localCommitments;
}

function validateLiveNote(note: DepositNote) {
  if (!note.depositTxHash || note.depositTxHash.startsWith('0x_mock_')) {
    throw new Error(
      'This note came from the old preview flow and cannot be used for live withdrawals. ' +
      'Use a note created from a real on-chain deposit.',
    );
  }

  if (note.runtimeMode !== 'live') {
    throw new Error(
      'This note is not marked as a live deposit note. Live withdrawal requires a note derived from a real on-chain deposit.',
    );
  }

  if (note.inputOutPoint.startsWith('0xpreview_')) {
    throw new Error(
      'This note uses a preview input outpoint and cannot be withdrawn on-chain.',
    );
  }
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

export async function prepareVaultWithdrawal(
  note: DepositNote,
  options: PrepareVaultWithdrawalOptions = {},
): Promise<PreparedVaultWithdrawal> {
  if (note.denomination !== Number(SUPPORTED_DENOMINATION)) {
    throw new Error('Only 100 CT notes are supported by the live mixer contracts right now.');
  }

  validateLiveNote(note);

  const commitments = await hydrateSessionCommitments(note);
  const leafIndex = resolveLeafIndex(note, commitments);
  const tree = await buildMerkleTree(commitments);
  const proof = await buildRealWithdrawalProof(
    note,
    tree,
    leafIndex,
    SUPPORTED_DENOMINATION,
    getGroth16ArtifactUrls(),
  );

  const runtimeStatus = tryLoadFrontendRuntimeConfig();
  const liveConfig = runtimeStatus.config;
  if (runtimeStatus.error || !liveConfig || liveConfig.runtimeMode !== 'live' || !liveConfig.nullifierRegistry) {
    throw new Error(
      runtimeStatus.error ??
      'Live runtime config is incomplete. Configure the deployed registry and contract references before preparing withdrawals.',
    );
  }

  const warnings: string[] = [];
  if (runtimeStatus.authority === 'operator-registry-lock') {
    warnings.push('This runtime is still configured for operator-controlled registry authority instead of direct permissionless withdrawal.');
  }

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
    recipientLock: options.recipientLock,
  });

  return {
    mode: 'live',
    proof,
    transaction,
    warnings,
    sessionSize: commitments.length,
    registrySize: resolution.registryCell.nullifiers.length,
  };
}

export async function broadcastPreparedWithdrawal(
  prepared: PreparedVaultWithdrawal,
  signerAddress: string,
): Promise<string> {
  if (prepared.mode !== 'live') {
    throw new Error('Live broadcast requires a live prepared withdrawal.');
  }

  const runtimeStatus = tryLoadFrontendRuntimeConfig();
  const liveConfig = runtimeStatus.config;
  if (!liveConfig?.nullifierRegistry || liveConfig.runtimeMode !== 'live') {
    throw new Error(runtimeStatus.error ?? 'Missing live Pudge runtime config.');
  }

  const provider = new AggronWithdrawalProvider({
    config: liveConfig,
    denomination: SUPPORTED_DENOMINATION,
  });

  const signingRequest = await provider.prepareJoyIdSigningRequest(
    prepared.transaction,
    signerAddress,
  );
  const signedTransaction = await signTransactionWithJoyId(signingRequest.transaction);

  return provider.broadcastSignedWithdrawal(signedTransaction as unknown as CkbTransaction);
}

export async function relayWithdrawal(
  prepared: PreparedVaultWithdrawal,
  recipientAddress: string,
  relayerEndpoint = getRelayerUrl(),
): Promise<string> {
  if (prepared.mode !== 'live') {
    throw new Error('Relay withdrawal requires a live prepared withdrawal.');
  }

  void recipientAddress;

  const job = await submitToRelayer(
    prepared.transaction.nullifier.startsWith('0x') ? prepared.transaction.nullifier : `0x${prepared.transaction.nullifier}`,
    prepared.transaction,
    relayerEndpoint,
  );

  return pollRelayStatus(job.jobId, relayerEndpoint);
}
