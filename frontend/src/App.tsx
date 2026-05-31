import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Wallet,
  Download,
  Upload,
  ArrowRight,
  Settings,
  Info,
  AlertCircle,
  Copy
} from "lucide-react";
import { tryLoadFrontendRuntimeConfig } from "./runtime";
import { connectJoyIdWallet, initializeJoyId, signTransactionWithJoyId } from "./joyid";
import {
  broadcastPreparedWithdrawal,
  prepareVaultWithdrawal,
  relayWithdrawal,
  type PreparedVaultWithdrawal,
} from "./withdrawal";
import { fetchDepositParticipantState, fetchFinalizedDepositNote, fetchLatestDepositPool, fetchRelayerInfo, fetchUnsignedDepositRound, submitDepositSignature, submitLiveDeposit, type DepositParticipantSnapshot, type DepositSessionSnapshot, type RelayerInfo } from "./relayer";
import {
  getNoteId,
  getNotesFromVault,
  saveNoteToVault,
  refreshVault,
  refreshVaultNotesFromSession,
  updateNoteInVault,
  exportNoteBackup,
  importNoteBackup,
  type DepositNote,
} from "./vault";

type Denomination = 10 | 100 | 1000;
type BannerTone = "success" | "error" | "info";

interface PoolState {
  denomination: Denomination;
  participants: number;
  maxParticipants: number;
  available: boolean;
  statusLabel: string;
}

interface StatusBanner {
  tone: BannerTone;
  text: string;
}

type DepositStage =
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

interface PendingDepositTracker {
  sessionId: string;
  participantId: string;
  walletAddress: string;
  denomination: number;
  stage: DepositStage;
  message: string;
  updatedAt: number;
}

const PENDING_DEPOSIT_KEY = "obscell_pending_deposit_round";

const DEPOSIT_TIMELINE: Array<{ key: string; label: string }> = [
  { key: "mint", label: "Mint CT staging output" },
  { key: "threshold", label: "Wait for pool threshold" },
  { key: "sign", label: "Sign shared round with JoyID" },
  { key: "finalize", label: "Coordinator finalization" },
  { key: "note", label: "Save finalized note to vault" },
];

interface DepositFlowInfo {
  kind: "backend-ct-mint";
  description: string;
}

interface WithdrawalPreview extends PreparedVaultWithdrawal {
  preparedAt: number;
  rawTransactionJson: string;
  broadcastTxHash?: string;
  broadcastedAt?: number;
}

function getBannerClasses(tone: BannerTone) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-sky-400/30 bg-sky-500/10 text-sky-100";
}

function getExplorerTxUrl(txHash: string): string {
  const isMainnet = (import.meta as any).env?.VITE_CKB_NETWORK === "mainnet";
  return isMainnet
    ? `https://explorer.nervos.org/transaction/${txHash}`
    : `https://pudge.explorer.nervos.org/transaction/${txHash}`;
}

function loadPendingDepositTracker(): PendingDepositTracker | null {
  try {
    const raw = localStorage.getItem(PENDING_DEPOSIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDepositTracker;
    if (!parsed?.sessionId || !parsed?.participantId || !parsed?.walletAddress) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistPendingDepositTracker(tracker: PendingDepositTracker | null) {
  if (!tracker) {
    localStorage.removeItem(PENDING_DEPOSIT_KEY);
    return;
  }
  localStorage.setItem(PENDING_DEPOSIT_KEY, JSON.stringify(tracker));
}

function getDepositTimelineIndex(stage: DepositStage): number {
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

function getDepositStageHint(stage: DepositStage): string {
  if (stage === "connecting-wallet") {
    return "JoyID wallet connection is required before the backend can begin the deposit round.";
  }
  if (stage === "preparing-session") {
    return "The coordinator is preparing your participant slot before the CT mint begins.";
  }
  if (stage === "waiting-threshold") {
    return "No JoyID signing happens yet. The round must fill before the shared transaction can be signed.";
  }
  if (stage === "ready-to-sign" || stage === "signing") {
    return "A JoyID signature prompt is expected during this stage.";
  }
  if (stage === "signature-submitted" || stage === "finalizing") {
    return "Your signature has been submitted. The coordinator is now assembling or finalizing the shared round.";
  }
  if (stage === "finalized") {
    return "The mixed note has been finalized and should now be saved in your vault.";
  }
  if (stage === "error") {
    return "Use Manual Refresh or Resume Pending Round after more participants join or the coordinator state advances.";
  }
  return "The deposit flow is starting.";
}

async function pollForFinalizedDepositNote(poolId: string, participantId: string, timeoutMs = 5 * 60 * 1000) {
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

async function waitForPoolReady(poolId: string, denomination: number, timeoutMs = 5 * 60 * 1000) {
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

async function runPendingDepositFlow(
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
    return pollForFinalizedDepositNote(tracker.sessionId, tracker.participantId);
  }

  update("ready-to-sign", "Pool is ready. Preparing the unsigned shared round for your signature.");
  const unsignedRound = await fetchUnsignedDepositRound(tracker.sessionId);
  const participant = unsignedRound.participants.find(entry => entry.participantId === tracker.participantId);
  if (!participant) {
    throw new Error("This participant is not present in the unsigned deposit round.");
  }

  update("signing", "JoyID signature required. Please approve the shared deposit round transaction.");
  const unsignedTransaction = unsignedRound.rawTransaction;
  const signedTransaction = await signTransactionWithJoyId(unsignedTransaction as any);
  const signaturePayload = JSON.stringify({
    witnesses: (signedTransaction as any).witnesses || [],
    cellDeps: (signedTransaction as any).cellDeps || [],
  });

  update("signature-submitted", "Submitting your round signature to the coordinator.");
  await submitDepositSignature(tracker.sessionId, tracker.participantId, signaturePayload);

  const participantState = await fetchDepositParticipantState(tracker.sessionId, tracker.participantId).catch(() => null as DepositParticipantSnapshot | null);
  if (participantState?.status === "finalized") {
    update("finalizing", "Round finalized. Fetching your mixed note.");
  } else {
    update("finalizing", "Signature accepted. Waiting for the coordinator to finalize the round.");
  }

  return pollForFinalizedDepositNote(tracker.sessionId, tracker.participantId);
}

export default function App() {
  const [selectedPool, setSelectedPool] = useState<Denomination>(100);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [vaultNotes, setVaultNotes] = useState<DepositNote[]>([]);
  const [withdrawalBusyId, setWithdrawalBusyId] = useState<string | null>(null);
  const [broadcastBusyId, setBroadcastBusyId] = useState<string | null>(null);
  const [preparedWithdrawals, setPreparedWithdrawals] = useState<Record<string, WithdrawalPreview>>({});
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositFlowInfo] = useState<DepositFlowInfo>({
    kind: "backend-ct-mint",
    description: "Backend-driven live CT mint on Pudge using stealth-lock outputs and saved vault notes.",
  });
  const [latestDepositPool, setLatestDepositPool] = useState<DepositSessionSnapshot | null>(null);
  const [relayBusyId, setRelayBusyId] = useState<string | null>(null);
  const [relayerInfo, setRelayerInfo] = useState<RelayerInfo | null>(null);
  const [runtimeStatus] = useState(() => tryLoadFrontendRuntimeConfig());
  const [withdrawNoteString, setWithdrawNoteString] = useState("");
  const [pendingDeposit, setPendingDeposit] = useState<PendingDepositTracker | null>(() => loadPendingDepositTracker());

  const runtimeMode = runtimeStatus.mode;
  const runtimeReady = runtimeStatus.config?.runtimeMode === "live" && !!runtimeStatus.config?.nullifierRegistry;

  const pools: PoolState[] = [
    { denomination: 10, participants: 0, maxParticipants: 5, available: false, statusLabel: "Unavailable" },
    {
      denomination: 100,
      participants: latestDepositPool?.denomination === 100 ? latestDepositPool.size : vaultNotes.filter(note => note.denomination === 100).length,
      maxParticipants: latestDepositPool?.denomination === 100 ? latestDepositPool.targetSize : 5,
      available: true,
      statusLabel: latestDepositPool?.denomination === 100 ? latestDepositPool.status : "Live",
    },
    { denomination: 1000, participants: 0, maxParticipants: 3, available: false, statusLabel: "Unavailable" },
  ];

  const currentPool = pools.find(p => p.denomination === selectedPool) || pools[1];

  useEffect(() => {
    initializeJoyId();
    void refreshVault()
      .then(async notes => {
        const refreshedNotes = await refreshVaultNotesFromSession(notes);
        setVaultNotes(refreshedNotes);
      });
    void fetchRelayerInfo().then(info => setRelayerInfo(info)).catch(console.error);
    void fetchLatestDepositPool(100).then(setLatestDepositPool).catch(() => setLatestDepositPool(null));
  }, []);

  useEffect(() => {
    persistPendingDepositTracker(pendingDeposit);
  }, [pendingDeposit]);

  const handleConnect = async () => {
    try {
      const address = await connectJoyIdWallet();
      setWalletAddress(address);
      setStatusBanner({
        tone: "success",
        text: "Wallet connected. You can now prepare and broadcast live withdrawals.",
      });
    } catch (error) {
      console.error("Connection failed:", error);
      setStatusBanner({
        tone: "error",
        text: "JoyID connection failed.",
      });
    }
  };

  const startMixing = async () => {
    if (!walletAddress) {
      setPendingDeposit({
        sessionId: "pending",
        participantId: "pending",
        walletAddress: "pending",
        denomination: Number(selectedPool),
        stage: "connecting-wallet",
        message: "Connecting JoyID wallet before starting the deposit round.",
        updatedAt: Date.now(),
      });
      await handleConnect();
      return;
    }

    setDepositBusy(true);
    setPendingDeposit(null);
    setPendingDeposit({
      sessionId: "preparing",
      participantId: "preparing",
      walletAddress,
      denomination: Number(selectedPool),
      stage: "preparing-session",
      message: "Preparing your participant slot with the coordinator before the CT mint starts.",
      updatedAt: Date.now(),
    });
    setStatusBanner({ tone: "info", text: "Preparing the deposit round with the coordinator, then minting a live CT deposit note on Pudge. This can take about 60-90 seconds." });

    try {
      setPendingDeposit({
        sessionId: "minting",
        participantId: "minting",
        walletAddress,
        denomination: Number(selectedPool),
        stage: "minting",
        message: "Coordinator slot reserved. Waiting for the backend CT mint and on-chain confirmation.",
        updatedAt: Date.now(),
      });
      const result = await submitLiveDeposit(walletAddress);
      const refreshedPool = await fetchLatestDepositPool(Number(selectedPool)).catch(() => null);
      setLatestDepositPool(refreshedPool);
      if (result.status === "finalized" && result.note) {
        await saveNoteToVault(result.note as DepositNote);
        const refreshedNotes = await refreshVaultNotesFromSession(await refreshVault());
        setVaultNotes(refreshedNotes);
        setPendingDeposit(null);
        setStatusBanner({
          tone: "success",
          text: `Deposit finalized! Round tx ${result.mintTxHash.slice(0, 12)}... note added to your vault.`,
        });
      } else {
        if (result.participantId) {
          const tracker: PendingDepositTracker = {
            sessionId: result.sessionId,
            participantId: result.participantId,
            walletAddress,
            denomination: Number(selectedPool),
            stage: "waiting-threshold",
            message: `Deposit minted and registered in session ${result.sessionId.slice(0, 8)}. Waiting for more participants.`,
            updatedAt: Date.now(),
          };
          setPendingDeposit(tracker);
          setStatusBanner({
            tone: "info",
            text: tracker.message,
          });

          const finalizedNote = await runPendingDepositFlow(
            tracker,
            progress => {
              setPendingDeposit(progress);
              const tone: BannerTone = progress.stage === "error" ? "error" : progress.stage === "finalized" ? "success" : "info";
              setStatusBanner({
                tone,
                text: progress.message,
              });
            },
          );
          await saveNoteToVault(finalizedNote);
          const refreshedNotes = await refreshVaultNotesFromSession(await refreshVault());
          setVaultNotes(refreshedNotes);
          const latestPoolAfterFinalize = await fetchLatestDepositPool(Number(selectedPool)).catch(() => null);
          setLatestDepositPool(latestPoolAfterFinalize);
          setPendingDeposit(null);
          setStatusBanner({
            tone: "success",
            text: `Deposit finalized! Your mixed note is now available in the vault.`,
          });
          return;
        }
        setStatusBanner({
          tone: "info",
          text: `Deposit minted and registered. Pool ${result.sessionId.slice(0, 8)}... is waiting for more participants before issuing finalized notes.`,
        });
      }
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Deposit failed.",
      });
      setPendingDeposit(prev => prev ? { ...prev, stage: "error", message: error instanceof Error ? error.message : "Deposit failed.", updatedAt: Date.now() } : prev);
    } finally {
      setDepositBusy(false);
    }
  };

  const handleRefreshDepositProgress = async () => {
    if (!pendingDeposit || !walletAddress || pendingDeposit.sessionId === "preparing" || pendingDeposit.sessionId === "minting" || pendingDeposit.sessionId === "pending") {
      setStatusBanner({ tone: "info", text: "There is no pending deposit session to refresh right now." });
      return;
    }

    setDepositBusy(true);
    try {
      const latestPool = await fetchLatestDepositPool(pendingDeposit.denomination).catch(() => null);
      if (latestPool) {
        setLatestDepositPool(latestPool);
      }

      const participantState = await fetchDepositParticipantState(pendingDeposit.sessionId, pendingDeposit.participantId).catch(() => null as DepositParticipantSnapshot | null);
      if (participantState) {
        const nextStage: DepositStage =
          participantState.status === "finalized"
            ? "finalizing"
            : latestPool?.status === "ready"
              ? "ready-to-sign"
              : latestPool?.status === "finalizing" || latestPool?.status === "complete"
                ? "finalizing"
                : latestPool?.status === "failed"
                  ? "error"
                  : "waiting-threshold";

        const nextMessage =
          participantState.status === "finalized"
            ? "Coordinator marks your participant as finalized. Fetching your note."
            : latestPool?.status === "ready"
              ? "Pool is ready. JoyID signing should begin on this refresh."
              : latestPool?.status === "finalizing"
                ? "Round is finalizing. Waiting for your mixed note."
                : latestPool?.status === "complete"
                  ? "Round completed. Fetching your finalized note."
                  : latestPool?.status === "failed"
                    ? "The current pool failed. Retry or start a new deposit round."
                    : latestPool
                      ? `Pool still waiting for more participants (${latestPool.size}/${latestPool.targetSize}).`
                      : pendingDeposit.message;

        setPendingDeposit(prev => prev ? { ...prev, stage: nextStage, message: nextMessage, updatedAt: Date.now() } : prev);
      }

      const finalized = await fetchFinalizedDepositNote(pendingDeposit.sessionId, pendingDeposit.participantId).catch(() => null);
      if (finalized?.status === "finalized" && finalized.note) {
        await saveNoteToVault(finalized.note as DepositNote);
        const refreshedNotes = await refreshVaultNotesFromSession(await refreshVault());
        setVaultNotes(refreshedNotes);
        setPendingDeposit(null);
        setStatusBanner({ tone: "success", text: "Deposit finalized and note saved to the vault." });
        return;
      }

      const note = await runPendingDepositFlow(
        pendingDeposit,
        progress => {
          setPendingDeposit(progress);
          const tone: BannerTone = progress.stage === "error" ? "error" : progress.stage === "finalized" ? "success" : "info";
          setStatusBanner({ tone, text: progress.message });
        },
      );

      await saveNoteToVault(note);
      const refreshedNotes = await refreshVaultNotesFromSession(await refreshVault());
      setVaultNotes(refreshedNotes);
      setPendingDeposit(null);
      setStatusBanner({ tone: "success", text: "Deposit finalized and note saved to the vault." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh deposit progress.";
      setPendingDeposit(prev => prev ? { ...prev, stage: "error", message, updatedAt: Date.now() } : prev);
      setStatusBanner({ tone: "error", text: message });
    } finally {
      setDepositBusy(false);
    }
  };

  const handleResumePendingDepositRound = async () => {
    if (!pendingDeposit || pendingDeposit.sessionId === "preparing" || pendingDeposit.sessionId === "minting" || pendingDeposit.sessionId === "pending") {
      setStatusBanner({ tone: "info", text: "There is no pending deposit round to resume." });
      return;
    }

    if (!walletAddress) {
      setStatusBanner({ tone: "info", text: "Connect the same JoyID wallet used for the pending deposit before resuming." });
      return;
    }

    if (walletAddress !== pendingDeposit.walletAddress) {
      setStatusBanner({
        tone: "error",
        text: `Pending deposit belongs to ${pendingDeposit.walletAddress.slice(0, 6)}...${pendingDeposit.walletAddress.slice(-4)}. Connect that wallet to continue.`,
      });
      return;
    }

    await handleRefreshDepositProgress();
  };

  const handleRefreshPoolOnly = async () => {
    const refreshedPool = await fetchLatestDepositPool(Number(selectedPool)).catch(() => null);
    setLatestDepositPool(refreshedPool);
    setStatusBanner({
      tone: "info",
      text: refreshedPool
        ? `Pool refreshed: ${refreshedPool.size}/${refreshedPool.targetSize} participants, status ${refreshedPool.status}.`
        : "Unable to refresh live pool state right now.",
    });
  };

  const handlePrepareWithdrawal = async (note: DepositNote) => {
    const noteId = getNoteId(note);
    setWithdrawalBusyId(noteId);
    setStatusBanner(null);

    try {
      const prepared = await prepareVaultWithdrawal(note, {
        recipientLock: walletAddress ?? undefined,
      });
      const preparedAt = Date.now();
      const updatedNote: DepositNote = {
        ...note,
        nullifier: prepared.proof.publicInputs.nullifier,
        merkleRoot: prepared.proof.publicInputs.merkleRoot,
        merkleProof: prepared.proof.witnessBundle.proof,
        leafIndex: prepared.proof.witnessBundle.proof.leafIndex,
        proofEncoding: prepared.proof.proofEncoding ?? note.proofEncoding,
        registrySnapshot: {
          outPoint: prepared.transaction.inputs[0]?.previousOutput,
          size: prepared.registrySize,
          authority: prepared.transaction.submission.authorityMode,
        },
        withdrawalStatus: "proof-ready",
        lastPreparedAt: preparedAt,
        lastPreparedMode: prepared.mode,
      };

      await updateNoteInVault(updatedNote);
      setVaultNotes(getNotesFromVault());
      setPreparedWithdrawals(prev => ({
        ...prev,
        [noteId]: {
          ...prepared,
          preparedAt,
          rawTransactionJson: JSON.stringify(prepared.transaction.rawTransaction, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2),
        },
      }));
      setStatusBanner({
        tone: "success",
        text: "Groth16 proof generated in the browser and paired with the live Pudge registry metadata.",
      });
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to prepare the withdrawal proof.",
      });
    } finally {
      setWithdrawalBusyId(null);
    }
  };

  const handleBroadcastWithdrawal = async (note: DepositNote) => {
    if (!walletAddress) {
      setStatusBanner({
        tone: "error",
        text: "Connect the JoyID wallet that owns the live registry lock before broadcasting a withdrawal.",
      });
      return;
    }

    const noteId = getNoteId(note);
    setBroadcastBusyId(noteId);
    setStatusBanner(null);

    try {
      const prepared = await prepareVaultWithdrawal(note, {
        recipientLock: walletAddress,
      });
      const preparedAt = Date.now();
      const txHash = await broadcastPreparedWithdrawal(prepared, walletAddress);
      const broadcastedAt = Date.now();
      const updatedNote: DepositNote = {
        ...note,
        nullifier: prepared.proof.publicInputs.nullifier,
        merkleRoot: prepared.proof.publicInputs.merkleRoot,
        merkleProof: prepared.proof.witnessBundle.proof,
        leafIndex: prepared.proof.witnessBundle.proof.leafIndex,
        proofEncoding: prepared.proof.proofEncoding ?? note.proofEncoding,
        registrySnapshot: {
          outPoint: prepared.transaction.inputs[0]?.previousOutput,
          size: prepared.registrySize,
          authority: prepared.transaction.submission.authorityMode,
        },
        withdrawalStatus: "submitted",
        lastPreparedAt: preparedAt,
        lastPreparedMode: prepared.mode,
        lastBroadcastAt: broadcastedAt,
        lastBroadcastHash: txHash,
      };

      await updateNoteInVault(updatedNote);
      setVaultNotes(getNotesFromVault());
      setPreparedWithdrawals(prev => ({
        ...prev,
        [noteId]: {
          ...prepared,
          preparedAt,
          rawTransactionJson: JSON.stringify(prepared.transaction.rawTransaction, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2),
          broadcastTxHash: txHash,
          broadcastedAt,
        },
      }));
      setStatusBanner({
        tone: "success",
        text: `Withdrawal broadcast to Pudge. Transaction hash: ${txHash}`,
      });
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to sign and broadcast the withdrawal.",
      });
    } finally {
      setBroadcastBusyId(null);
    }
  };

  const handleRelayWithdrawal = async (note: DepositNote) => {
    const noteId = getNoteId(note);
    const prepared = preparedWithdrawals[noteId];
    if (!prepared) {
      setStatusBanner({ tone: "error", text: "Generate the withdrawal proof first before relaying." });
      return;
    }

    const recipient = note.stealthOutputAddress;
    setRelayBusyId(noteId);
    setStatusBanner(null);

    try {
      const txHash = await relayWithdrawal(prepared, recipient);
      const updatedNote: DepositNote = {
        ...note,
        withdrawalStatus: "submitted",
        lastBroadcastAt: Date.now(),
        lastBroadcastHash: txHash,
      };
      await updateNoteInVault(updatedNote);
      setVaultNotes(getNotesFromVault());
      setStatusBanner({
        tone: "success",
        text: `Relayed successfully - tx hash: ${txHash}. Your withdrawal is anonymous.`,
      });
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Relay failed.",
      });
    } finally {
      setRelayBusyId(null);
    }
  };

  const handleImportNote = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importNoteBackup(text);
        setVaultNotes(getNotesFromVault());
        setStatusBanner({ tone: "success", text: "Note imported successfully." });
      } catch (err) {
        setStatusBanner({ tone: "error", text: err instanceof Error ? err.message : "Failed to import note" });
      }
    };
    input.click();
  };

  const handleExportNote = (note: DepositNote) => {
    const json = exportNoteBackup(note);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `obscell-note-${note.sessionId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusBanner({ tone: "success", text: "Note backup downloaded. Keep this safe!" });
  };

  const handleWithdrawAction = async () => {
    if (!withdrawNoteString) {
      setStatusBanner({ tone: "error", text: "Please enter a valid note string." });
      return;
    }
    try {
      const parsedNote = JSON.parse(withdrawNoteString) as DepositNote;
      const existing = vaultNotes.find(n => n.sessionId === parsedNote.sessionId);
      if (!existing) {
        await importNoteBackup(withdrawNoteString);
        setVaultNotes(getNotesFromVault());
      }
      const activeNote = existing || parsedNote;
      await handlePrepareWithdrawal(activeNote);
    } catch {
      setStatusBanner({ tone: "error", text: "Invalid note format." });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0f] text-white flex flex-col items-center">
      <div className="mesh-bg pointer-events-none"></div>

      <header className="w-full px-8 py-5 flex justify-between items-center z-10 border-b border-white/5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer">
            <Shield className="w-7 h-7 text-[#00f2ff]" />
            <span className="text-xl font-orbitron font-bold tracking-wider">OBSCELL</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-white transition-colors">Voting</a>
            <a href="#" className="hover:text-white transition-colors">Compliance</a>
            <a href="#" className="hover:text-white transition-colors">Docs</a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Pudge Testnet</span>
          </div>
          {walletAddress ? (
            <div className="flex items-center gap-2">
              <div className="px-4 py-1.5 bg-[#00f2ff]/10 border border-[#00f2ff]/30 text-[#00f2ff] rounded text-sm font-orbitron">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(walletAddress)}
                className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-gray-400 hover:text-[#00f2ff]"
                title="Copy Address"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-sm transition-colors"
            >
              <Wallet className="w-4 h-4 inline-block mr-2" />
              Connect
            </button>
          )}
          <button className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-gray-400 hover:text-white">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="w-full max-w-5xl px-4 py-16 grid grid-cols-1 md:grid-cols-2 gap-12 z-10">
        <div className="flex flex-col">
          <div className="flex mb-0 w-full relative">
            <button
              onClick={() => setActiveTab("deposit")}
              className={`flex-1 py-4 text-center font-orbitron font-bold tracking-wider rounded-t-xl z-10 transition-all ${activeTab === "deposit" ? "bg-[#111116] text-white border-t border-l border-r border-[#00f2ff]/30" : "bg-[#0c0c11] text-gray-500 border-b border-[#00f2ff]/30 hover:text-gray-300"}`}
              style={{ clipPath: "polygon(0 0, 85% 0, 100% 100%, 0% 100%)" }}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab("withdraw")}
              className={`flex-1 py-4 text-center font-orbitron font-bold tracking-wider rounded-t-xl transition-all ${activeTab === "withdraw" ? "bg-[#111116] text-white border-t border-l border-r border-[#00f2ff]/30 z-10" : "bg-[#0c0c11] text-gray-500 border-b border-[#00f2ff]/30 hover:text-gray-300"}`}
              style={{ clipPath: "polygon(0 100%, 15% 0, 100% 0, 100% 100%)", marginLeft: "-15%" }}
            >
              Withdraw
            </button>
          </div>

          <div className="bg-[#111116] border border-t-0 border-[#00f2ff]/30 rounded-b-xl p-8 shadow-2xl relative overflow-hidden">
            {statusBanner && (
              <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${getBannerClasses(statusBanner.tone)}`}>
                {statusBanner.text}
              </div>
            )}

            {activeTab === "deposit" ? (
              <AnimatePresence mode="wait">
                <motion.div key="deposit-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-8">
                    <label className="text-gray-400 text-sm mb-2 block">Token</label>
                    <div className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between cursor-not-allowed">
                      <span className="font-semibold text-white">CKB (CoNervos)</span>
                      <ArrowRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                  </div>

                  <div className="mb-10">
                    <div className="flex items-center gap-2 mb-4">
                      <label className="text-gray-400 text-sm">Amount</label>
                      <Info className="w-3.5 h-3.5 text-[#00f2ff] cursor-help" />
                    </div>

                    <div className="relative pt-2 pb-6">
                      <div className="absolute top-4 left-4 right-4 h-[2px] bg-[#00f2ff]/30 z-0"></div>
                      <div className="flex justify-between relative z-10">
                        {pools.map(pool => (
                          <div key={pool.denomination} className="flex flex-col items-center">
                            <button
                              onClick={() => setSelectedPool(pool.denomination)}
                              disabled={!pool.available}
                              className={`w-5 h-5 rounded-full border-2 bg-[#111116] transition-all ${selectedPool === pool.denomination ? "border-[#00f2ff] scale-125" : "border-gray-500 hover:border-gray-400"} ${!pool.available ? "opacity-30 cursor-not-allowed" : ""}`}
                            />
                            <span className={`mt-3 text-xs font-orbitron ${selectedPool === pool.denomination ? "text-[#00f2ff]" : "text-gray-500"}`}>
                              {pool.denomination} CT
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                    <div className="font-orbitron text-xs uppercase tracking-[0.2em] text-sky-300 mb-2">Deposit Path</div>
                    <div>{depositFlowInfo.description}</div>
                    <div className="mt-2 text-xs text-sky-100/80">
                      A successful deposit mints a live CT cell, stores a vault note, and joins the shared Pudge deposit session for this denomination.
                    </div>
                    {latestDepositPool && (
                      <div className="mt-3 text-xs text-sky-100/80">
                        Current pool: {latestDepositPool.sessionId} ({latestDepositPool.size}/{latestDepositPool.targetSize}, status: {latestDepositPool.status})
                      </div>
                    )}
                    {latestDepositPool && (
                      <div className="mt-1 text-xs text-sky-100/70">
                        Registered: {latestDepositPool.registeredCount} | Pending: {latestDepositPool.pendingCount}
                      </div>
                    )}
                    {pendingDeposit && (
                      <div className="mt-3 rounded-md border border-sky-300/20 bg-sky-400/5 px-3 py-3 text-xs text-sky-100/85">
                        <div className="font-semibold text-sky-200">Deposit progress</div>
                        {!(pendingDeposit.sessionId === "preparing" || pendingDeposit.sessionId === "minting" || pendingDeposit.sessionId === "pending") && (
                          <>
                            <div className="mt-1">Session: {pendingDeposit.sessionId}</div>
                            <div>Participant: {pendingDeposit.participantId}</div>
                          </>
                        )}
                        <div>Stage: {pendingDeposit.stage}</div>
                        <div className="mt-1">{pendingDeposit.message}</div>
                        <div className="mt-1 text-sky-100/70">{getDepositStageHint(pendingDeposit.stage)}</div>
                        <div className="mt-3 space-y-2">
                          {DEPOSIT_TIMELINE.map((entry, index) => {
                            const activeIndex = getDepositTimelineIndex(pendingDeposit.stage);
                            const complete = index < activeIndex || pendingDeposit.stage === "finalized";
                            const current = index === activeIndex && pendingDeposit.stage !== "finalized";

                            return (
                              <div key={entry.key} className="flex items-center gap-2">
                                <div
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    complete
                                      ? "bg-emerald-300"
                                      : current
                                        ? "bg-sky-300 ring-2 ring-sky-300/30"
                                        : "bg-white/20"
                                  }`}
                                />
                                <span className={`${complete ? "text-emerald-100" : current ? "text-sky-100" : "text-white/50"}`}>
                                  {entry.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRefreshDepositProgress()}
                            disabled={depositBusy}
                            className="rounded border border-sky-300/30 px-2 py-1 text-[11px] font-semibold text-sky-100 transition-colors hover:bg-sky-400/10 disabled:opacity-50"
                          >
                            Manual Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleResumePendingDepositRound()}
                            disabled={depositBusy}
                            className="rounded border border-sky-300/30 px-2 py-1 text-[11px] font-semibold text-sky-100 transition-colors hover:bg-sky-400/10 disabled:opacity-50"
                          >
                            Resume Pending Round
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRefreshPoolOnly()}
                        className="rounded border border-sky-300/20 px-2 py-1 text-[11px] font-semibold text-sky-100/85 transition-colors hover:bg-sky-400/10"
                      >
                        Refresh Pool State
                      </button>
                    </div>
                  </div>

                    <button
                      className="w-full py-4 rounded-lg bg-gradient-to-r from-[#00f2ff] to-[#00a2ff] text-black font-orbitron font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      onClick={() => void startMixing()}
                      disabled={depositBusy || !currentPool.available}
                    >
                      {depositBusy ? "Minting..." : "Deposit"}
                    </button>
                    {depositBusy && (
                      <div className="mt-3 text-xs text-sky-100/80">
                        Waiting for the backend to mint and confirm your CT output on Pudge. Please keep this tab open.
                      </div>
                    )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key="withdraw-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-gray-400 text-sm">Note</label>
                      <button onClick={handleImportNote} className="text-xs text-[#00f2ff] hover:underline flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Import
                      </button>
                    </div>
                    <textarea
                      className="w-full bg-[#1a1a24] border border-white/10 rounded-lg p-3 text-xs text-gray-300 font-mono resize-none focus:border-[#00f2ff]/50 outline-none transition-colors"
                      rows={5}
                      placeholder="Please paste your deposit note here..."
                      value={withdrawNoteString}
                      onChange={(e) => setWithdrawNoteString(e.target.value)}
                    />
                  </div>

                  {vaultNotes.length > 0 && (
                    <div className="mb-8">
                      <label className="text-gray-500 text-xs mb-2 block uppercase tracking-wider">Or select from Vault</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {vaultNotes.filter(n => n.withdrawalStatus !== "submitted").map(note => (
                          <div
                            key={note.sessionId}
                            onClick={() => setWithdrawNoteString(JSON.stringify(note, null, 2))}
                            className="bg-[#1a1a24] border border-white/5 hover:border-[#00f2ff]/30 p-2 rounded cursor-pointer transition-colors flex justify-between items-center gap-3"
                          >
                            <div className="min-w-0">
                              <span className="text-xs text-gray-300 font-mono truncate max-w-[200px] block">{note.sessionId}</span>
                              <span className="text-[10px] text-gray-500">{note.denomination} CT</span>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleExportNote(note);
                              }}
                              className="shrink-0 rounded border border-white/10 p-1.5 text-gray-400 hover:border-[#00f2ff]/30 hover:text-[#00f2ff] transition-colors"
                              title="Export note backup"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      className="flex-1 py-4 rounded-lg bg-[#1a1a24] border border-white/10 text-white font-orbitron hover:bg-white/5 transition-colors disabled:opacity-50"
                      onClick={() => handleWithdrawAction()}
                      disabled={withdrawalBusyId !== null}
                    >
                      Prepare Proof
                    </button>

                    {(() => {
                      try {
                        const parsed = JSON.parse(withdrawNoteString) as DepositNote;
                        const noteId = getNoteId(parsed);
                        const prepared = preparedWithdrawals[noteId];
                        if (prepared) {
                          return (
                            <>
                              <button
                                className="flex-1 py-4 rounded-lg bg-gradient-to-r from-[#00f2ff] to-[#00a2ff] text-black font-orbitron font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                onClick={() => handleBroadcastWithdrawal(parsed)}
                                disabled={!runtimeReady || !walletAddress || broadcastBusyId !== null || relayBusyId !== null}
                              >
                                {broadcastBusyId === noteId ? "Broadcasting..." : "Broadcast"}
                              </button>
                              <button
                                className="flex-1 py-4 rounded-lg bg-gradient-to-r from-[#7000ff] to-[#a040ff] text-white font-orbitron font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                onClick={() => handleRelayWithdrawal(parsed)}
                                disabled={relayBusyId !== null || broadcastBusyId !== null}
                              >
                                {relayBusyId === noteId ? "Relaying..." : "Relay Private"}
                              </button>
                            </>
                          );
                        }
                      } catch {}
                      return null;
                    })()}
                  </div>

                  {(() => {
                    try {
                      const parsed = JSON.parse(withdrawNoteString) as DepositNote;
                      const noteId = getNoteId(parsed);
                      const prepared = preparedWithdrawals[noteId];
                      const txHash = prepared?.broadcastTxHash ?? parsed.lastBroadcastHash;
                      if (!txHash) {
                        return null;
                      }

                      return (
                        <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                          Broadcast tx:{" "}
                          <a
                            href={getExplorerTxUrl(txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono underline underline-offset-2"
                          >
                            {txHash.slice(0, 12)}...{txHash.slice(-8)}
                          </a>
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="flex flex-col pt-2">
          <div className="flex mb-4 gap-4 items-end">
            <h2 className="text-xl font-orbitron font-bold">Statistics</h2>
            <div className="px-3 py-1 bg-[#00f2ff]/10 border border-[#00f2ff]/30 text-[#00f2ff] text-xs font-bold rounded">
              {currentPool.denomination} CT
            </div>
          </div>

          <div className="bg-[#111116] border border-white/10 rounded-xl p-6 flex flex-col gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-400">Anonymity set</span>
                <Info className="w-3.5 h-3.5 text-[#00f2ff] cursor-help" />
              </div>
              <div className="text-3xl font-orbitron text-white">
                {currentPool.participants} <span className="text-sm text-gray-500">/ {currentPool.maxParticipants}</span>
              </div>
            </div>

            <div>
              <span className="text-sm text-gray-400 mb-4 block">Latest deposits</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`h-6 rounded bg-white/5 border border-white/5 flex items-center px-2 ${i < currentPool.participants ? "opacity-100" : "opacity-20"}`}>
                    {i < currentPool.participants && (
                      <span className="text-[10px] font-mono text-gray-400">0x...{(Math.random() * 10000).toFixed(0).padStart(4, "0")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200/80 leading-relaxed">
              <strong className="text-blue-400 block mb-1">Current Product Boundary</strong>
              This build now mints live CT deposit notes on Pudge and supports live registry-backed withdrawal preparation and broadcast. Deposits currently use backend-driven CT minting rather than the older CoinJoin preview flow.
              <div className="mt-3 space-y-1 text-xs text-blue-100/80">
                <div>Runtime: {runtimeReady ? "live withdrawal metadata ready" : runtimeMode}</div>
                <div>Deposits: live CT mint path enabled</div>
                <div>Session model: backend-managed rotating deposit pools with shared commitment snapshots</div>
                {latestDepositPool && (
                  <div>Latest pool: {latestDepositPool.sessionId} ({latestDepositPool.size}/{latestDepositPool.targetSize}, {latestDepositPool.status}, pending {latestDepositPool.pendingCount})</div>
                )}
                {relayerInfo && (
                  <div>
                    Relayer: {relayerInfo.network} at {relayerInfo.feePercent}% fee
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto w-full py-6 px-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>Obscell version: v0.1.0-alpha</span>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
        </div>
        <div className="flex items-center gap-4">
          <span>Network: Pudge Testnet</span>
          <span>Proofs: Groth16 Arkworks</span>
        </div>
      </footer>
    </div>
  );
}
