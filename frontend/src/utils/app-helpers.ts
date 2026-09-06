import { deriveCommitment, deriveNullifierHash } from "mixer-sdk/legacy";
import {
  fetchFinalizedDepositNote,
  type DepositRecoveryResult
} from "../relayer";
import {
  encryptNoteBackup,
  type DepositNote,
} from "../vault";
import { type PreparedVaultWithdrawal } from "../withdrawal";

export type Denomination = 10 | 100 | 1000;
export type BannerTone = "success" | "error" | "info";

export interface PoolState {
  denomination: Denomination;
  participants: number;
  maxParticipants: number;
  available: boolean;
  statusLabel: string;
}

export interface StatusBanner {
  tone: BannerTone;
  text: string;
}

export type DepositStage =
  | "idle"
  | "connecting-wallet"
  | "preparing-session"
  | "minting"
  | "waiting-threshold"
  | "ready-to-sign"
  | "signing"
  | "signature-submitted"
  | "finalizing"
  | "finalized"
  | "error";

export interface PendingDepositTracker {
  sessionId: string;
  participantId: string;
  walletAddress: string;
  denomination: number;
  commitment: string;
  noteCreatedAt: number;
  stage: DepositStage;
  message: string;
  updatedAt: number;
  secret: string;
  nullifierSecret: string;
}

export type DepositSecretBundle = Pick<PendingDepositTracker, "secret" | "nullifierSecret" | "commitment"> & Partial<Pick<PendingDepositTracker, "sessionId" | "participantId" | "walletAddress">>;

export interface WithdrawalPreview extends PreparedVaultWithdrawal {
  preparedAt: number;
  rawTransactionJson: string;
  broadcastTxHash?: string;
  broadcastedAt?: number;
}

export interface DisplayedNote {
  text: string;
  note: DepositNote;
  label: string;
}

export function getBannerClasses(tone: BannerTone) {
  if (tone === "success") return "border-purple-400/30 bg-purple-500/10 text-purple-100";
  if (tone === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-purple-400/20 bg-purple-500/5 text-purple-100";
}

export function getDepositTimelineIndex(stage: DepositStage): number {
  switch (stage) {
    case "connecting-wallet":
    case "preparing-session":
    case "minting":
      return 0;
    case "waiting-threshold":
      return 1;
    case "ready-to-sign":
    case "signing":
      return 2;
    case "signature-submitted":
    case "finalizing":
      return 3;
    case "finalized":
      return 4;
    case "error":
      return 1;
    case "idle":
    default:
      return 0;
  }
}

export async function pollForFinalizedDepositNote(poolId: string, participantId: string, timeoutMs = 5 * 60 * 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchFinalizedDepositNote(poolId, participantId);
    if (result.status === "finalized" && result.note) {
      return result.note as DepositNote;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error("Deposit is still pending finalization. Try again after more participants join the pool.");
}

export function normalizeHex(value?: string) {
  return value?.toLowerCase();
}

export function isMissingPrivateSecret(value?: string) {
  return !value || /^0x?0+$/i.test(value);
}

export function randomFieldSecret(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').padStart(64, '0');
}

export async function restoreFinalizedDepositSecrets(
  note: DepositNote,
  tracker: DepositSecretBundle,
): Promise<DepositNote> {
  const secret = tracker.secret ?? note.secret;
  const nullifierSecret = tracker.nullifierSecret ?? note.nullifierSecret;

  if (isMissingPrivateSecret(secret) || isMissingPrivateSecret(nullifierSecret)) {
    throw new Error(
      "The finalized note is missing the private deposit secrets needed for withdrawal. " +
      "Keep this tab open and resume the round from the browser session that created the deposit.",
    );
  }

  const commitment = note.commitment ?? tracker.commitment;
  const derivedCommitment = await deriveCommitment(secret, nullifierSecret);
  if (normalizeHex(derivedCommitment) !== normalizeHex(commitment)) {
    throw new Error(
      "The local deposit secrets do not match the finalized commitment. " +
      "Use the encrypted recovery note you saved before this deposit was submitted.",
    );
  }

  return {
    ...note,
    status: "finalized",
    participantId: note.participantId ?? tracker.participantId,
    walletAddress: note.walletAddress ?? tracker.walletAddress,
    secret,
    nullifierSecret,
    commitment,
    nullifier: (await deriveNullifierHash(nullifierSecret)) as any,
  };
}

export async function createPendingDepositNote(walletAddress: string, denomination: number): Promise<DepositNote> {
  const secret = randomFieldSecret();
  const nullifierSecret = randomFieldSecret();
  const commitment = await deriveCommitment(secret, nullifierSecret);
  return {
    version: 2,
    status: "pending",
    sessionId: "pending",
    walletAddress,
    inputOutPoint: undefined,
    secret,
    nullifierSecret,
    stealthOutputAddress: undefined,
    createdAt: Date.now(),
    commitment,
    sessionCommitments: [commitment],
    nullifier: (await deriveNullifierHash(nullifierSecret)) as any,
    denomination,
    runtimeMode: "live",
    proofEncoding: "groth16-bn254-arkworks-uncompressed-v1",
    registrySnapshot: {
      authority: "direct",
    },
  };
}

export function buildTrackerFromNote(note: DepositNote, recovery: {
  sessionId: string;
  participantId: string;
  walletAddress?: string;
  status?: string;
}): PendingDepositTracker {
  return {
    sessionId: recovery.sessionId,
    participantId: recovery.participantId,
    walletAddress: recovery.walletAddress ?? note.walletAddress ?? "unknown",
    denomination: note.denomination,
    commitment: note.commitment,
    noteCreatedAt: note.createdAt,
    stage: recovery.status === "ready" || recovery.status === "registered" ? "ready-to-sign" : "waiting-threshold",
    message: `Recovered pending deposit ${recovery.sessionId.slice(0, 8)}. Continue from this tab to finalize the note.`,
    updatedAt: Date.now(),
    secret: note.secret,
    nullifierSecret: note.nullifierSecret,
  };
}

export async function finalizeRecoveredNote(note: DepositNote, recovery: DepositRecoveryResult): Promise<DepositNote> {
  if (!recovery.note) {
    throw new Error("Recovered deposit is not finalized yet.");
  }

  return restoreFinalizedDepositSecrets(recovery.note as DepositNote, {
    sessionId: recovery.sessionId,
    participantId: recovery.participantId,
    walletAddress: recovery.walletAddress,
    commitment: note.commitment,
    secret: note.secret,
    nullifierSecret: note.nullifierSecret,
  });
}

export async function buildEncryptedDisplayedNote(note: DepositNote, password: string, label: string): Promise<DisplayedNote> {
  return {
    text: await encryptNoteBackup(note, password),
    note,
    label,
  };
}
