import { signTransactionWithJoyId } from "../joyid";
import {
  fetchDepositParticipantState,
  fetchLatestDepositPool,
  fetchUnsignedDepositRound,
  submitDepositSignature,
  type DepositParticipantSnapshot,
} from "../relayer";
import type { DepositNote } from "../vault";
import {
  pollForFinalizedDepositNote,
  restoreFinalizedDepositSecrets,
  type DepositStage,
  type PendingDepositTracker,
} from "./app-helpers";

export async function waitForPoolReady(poolId: string, denomination: number, timeoutMs = 5 * 60 * 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const pool = await fetchLatestDepositPool(denomination).catch(() => null);
    if (pool?.sessionId === poolId && (pool.status === "ready" || pool.status === "finalizing" || pool.status === "complete")) {
      return pool;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error("Pool did not reach the signing stage before the timeout.");
}

export async function runPendingDepositFlow(
  tracker: PendingDepositTracker,
  onProgress: (next: PendingDepositTracker) => void,
): Promise<DepositNote> {
  const update = (stage: DepositStage, message: string) => {
    const next = {
      ...tracker,
      stage,
      message,
      updatedAt: Date.now(),
    };
    tracker = next;
    onProgress(next);
    return next;
  };

  update("waiting-threshold", "Deposit minted. Waiting for the pool threshold before signing can begin.");

  const readyPool = await waitForPoolReady(tracker.sessionId, tracker.denomination);
  if (readyPool.status === "complete") {
    update("finalizing", "Pool already completed. Fetching your finalized note.");
    const note = await pollForFinalizedDepositNote(tracker.sessionId, tracker.participantId);
    return restoreFinalizedDepositSecrets(note, tracker);
  }

  update("ready-to-sign", "Pool is ready. Preparing the unsigned shared round for your signature.");
  const unsignedRound = await fetchUnsignedDepositRound(tracker.sessionId);
  const participant = unsignedRound.participants.find(entry => entry.participantId === tracker.participantId);
  if (!participant) {
    throw new Error("This participant is not present in the unsigned deposit round.");
  }

  update("signing", "JoyID signature required. Please approve the shared deposit round transaction.");
  const signedTransaction = await signTransactionWithJoyId(unsignedRound.rawTransaction as any);
  const signaturePayload = JSON.stringify({
    txHash: unsignedRound.txHash,
    witnesses: (signedTransaction as any).witnesses || [],
    cellDeps: (signedTransaction as any).cellDeps || [],
  }, (_key, value) => typeof value === "bigint" ? value.toString() : value);

  update("signature-submitted", "Submitting your round signature to the coordinator.");
  await submitDepositSignature(tracker.sessionId, tracker.participantId, signaturePayload);

  const participantState = await fetchDepositParticipantState(tracker.sessionId, tracker.participantId).catch(() => null as DepositParticipantSnapshot | null);
  if (participantState?.status === "finalized") {
    update("finalizing", "Round finalized. Fetching your mixed note.");
  } else {
    update("finalizing", "Signature accepted. Waiting for the coordinator to finalize the round.");
  }

  const note = await pollForFinalizedDepositNote(tracker.sessionId, tracker.participantId);
  return restoreFinalizedDepositSecrets(note, tracker);
}
