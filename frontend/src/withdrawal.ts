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

function ensureJoyIdCellDep(transaction: CkbTransaction): CkbTransaction {
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

  if (runtimeStatus.authority === 'operator-registry-lock') {
    warnings.push('Live broadcast requires the operator-controlled JoyID wallet that owns the nullifier registry lock.');
  }

  if (liveConfig?.nullifierRegistry && liveConfig.runtimeMode === 'live') {
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
        recipientLock: options.recipientLock,
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
    warnings.push('Runtime config is not in live mode or is missing the nullifier registry, so this is a local preview transaction.');
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
    recipientLock: options.recipientLock,
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

export async function broadcastPreparedWithdrawal(
  prepared: PreparedVaultWithdrawal,
  signerAddress: string,
): Promise<string> {
  if (prepared.mode !== 'aggron-preview') {
    throw new Error('Live broadcast is only available when Aggron runtime config and registry data are loaded.');
  }

  const runtimeStatus = tryLoadFrontendRuntimeConfig();
  const liveConfig = runtimeStatus.config;
  if (!liveConfig?.nullifierRegistry || liveConfig.runtimeMode !== 'live') {
    throw new Error(runtimeStatus.error ?? 'Missing live Aggron runtime config.');
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
