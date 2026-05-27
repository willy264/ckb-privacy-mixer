import { getJoyIDCellDep, signRawTransaction } from '@joyid/ckb';
import {
  AggronWithdrawalProvider,
  buildMerkleTree,
  buildRealWithdrawalProof,
  buildWithdrawTransaction,
  type CkbCellDep,
  type CkbTransaction,
  type LocalWithdrawalProofResult,
  type WithdrawalTransaction,
} from 'mixer-sdk';
import { getGroth16ArtifactUrls, tryLoadFrontendRuntimeConfig } from './runtime';
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

export function ensureJoyIdCellDep(transaction: CkbTransaction): CkbTransaction {
  const joyIdDep = getJoyIDCellDep(false);
  const mappedDep: CkbCellDep = {
    outPoint: {
      txHash: joyIdDep.outPoint.txHash,
      index: joyIdDep.outPoint.index,
    },
    depType: joyIdDep.depType,
  };

  const exists = transaction.cellDeps.some(dep =>
    dep.outPoint.txHash === mappedDep.outPoint.txHash &&
    dep.outPoint.index === mappedDep.outPoint.index &&
    dep.depType === mappedDep.depType,
  );

  if (exists) {
    return transaction;
  }

  return {
    ...transaction,
    cellDeps: [...transaction.cellDeps, mappedDep],
  };
}

export async function prepareVaultWithdrawal(
  note: DepositNote,
  options: PrepareVaultWithdrawalOptions = {},
): Promise<PreparedVaultWithdrawal> {
  if (note.denomination !== Number(SUPPORTED_DENOMINATION)) {
    throw new Error('Only 100 CT notes are supported by the live mixer contracts right now.');
  }

  validateLiveNote(note);

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
    warnings.push('Live broadcast requires the operator-controlled JoyID wallet that owns the nullifier registry lock.');
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
  const unsignedTransaction = ensureJoyIdCellDep(signingRequest.transaction);
  const signedTransaction = await signRawTransaction(unsignedTransaction as any, signerAddress, {
    witnessIndexes: signingRequest.witnessIndexes,
  });

  return provider.broadcastSignedWithdrawal(signedTransaction as CkbTransaction);
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
    prepared.transaction.nullifier,
    prepared.transaction,
    relayerEndpoint,
  );

  return pollRelayStatus(job.jobId, relayerEndpoint);
}
