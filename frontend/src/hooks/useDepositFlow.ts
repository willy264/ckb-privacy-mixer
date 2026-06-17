import type { Dispatch, SetStateAction } from "react";
import { connectJoyIdWallet } from "../joyid";
import {
  fetchDepositParticipantState,
  fetchFinalizedDepositNote,
  fetchLatestDepositPool,
  submitLiveDeposit,
  type DepositParticipantSnapshot,
  type DepositSessionSnapshot,
} from "../relayer";
import type { DepositNote } from "../vault";
import {
  buildEncryptedDisplayedNote,
  createPendingDepositNote,
  restoreFinalizedDepositSecrets,
  type BannerTone,
  type Denomination,
  type DepositStage,
  type DisplayedNote,
  type PendingDepositTracker,
  type StatusBanner,
} from "../utils/app-helpers";
import { runPendingDepositFlow } from "../utils/deposit-flow";

interface UseDepositFlowParams {
  walletAddress: string | null;
  setWalletAddress: Dispatch<SetStateAction<string | null>>;
  selectedPool: Denomination;
  notePassword: string;
  setNotePassword: Dispatch<SetStateAction<string>>;
  setWithdrawNoteString: Dispatch<SetStateAction<string>>;
  setDecryptedNote: Dispatch<SetStateAction<DepositNote | null>>;
  displayedNote: DisplayedNote | null;
  setDisplayedNote: Dispatch<SetStateAction<DisplayedNote | null>>;
  pendingDeposit: PendingDepositTracker | null;
  setPendingDeposit: Dispatch<SetStateAction<PendingDepositTracker | null>>;
  depositDraftNote: DepositNote | null;
  setDepositDraftNote: Dispatch<SetStateAction<DepositNote | null>>;
  setDepositBusy: Dispatch<SetStateAction<boolean>>;
  setLatestDepositPool: Dispatch<SetStateAction<DepositSessionSnapshot | null>>;
  setStatusBanner: Dispatch<SetStateAction<StatusBanner | null>>;
  activeTab: "deposit" | "withdraw";
  setActiveDepositStep: Dispatch<SetStateAction<number>>;
}

export function useDepositFlow({
  walletAddress,
  setWalletAddress,
  selectedPool,
  notePassword,
  setNotePassword,
  setWithdrawNoteString,
  setDecryptedNote,
  displayedNote,
  setDisplayedNote,
  pendingDeposit,
  setPendingDeposit,
  depositDraftNote,
  setDepositDraftNote,
  setDepositBusy,
  setLatestDepositPool,
  setStatusBanner,
  activeTab,
  setActiveDepositStep,
}: UseDepositFlowParams) {
  const showEncryptedNote = async (note: DepositNote, label: string) => {
    const encrypted = await buildEncryptedDisplayedNote(note, notePassword, label);
    setDisplayedNote(encrypted);
    setWithdrawNoteString(encrypted.text);
    setDecryptedNote(note);
    return encrypted;
  };

  const handleConnect = async (): Promise<string | null> => {
    try {
      const address = await connectJoyIdWallet();
      setWalletAddress(address);
      setStatusBanner({
        tone: "success",
        text: "Wallet connected. You can now prepare and broadcast live withdrawals.",
      });
      return address;
    } catch (error) {
      console.error("Connection failed:", error);
      setStatusBanner({
        tone: "error",
        text: "JoyID connection failed.",
      });
      return null;
    }
  };

  const handleDepositPasswordChange = (value: string) => {
    setNotePassword(value);
    setDepositDraftNote(null);
    setDisplayedNote(null);
    setDecryptedNote(null);
    setWithdrawNoteString("");
  };

  const prepareDepositNote = async () => {
    let depositWalletAddress = walletAddress;
    if (!depositWalletAddress) {
      depositWalletAddress = await handleConnect();
      if (!depositWalletAddress) {
        return;
      }
    }

    if (!notePassword) {
      setStatusBanner({ tone: "error", text: "Set a note password before depositing. It encrypts the recovery note you must save." });
      return;
    }

    try {
      setDepositBusy(true);
      setPendingDeposit(null);
      setDecryptedNote(null);
      setWithdrawNoteString("");
      const recoveryNote = await createPendingDepositNote(depositWalletAddress, Number(selectedPool));
      setDepositDraftNote(recoveryNote);
      await showEncryptedNote(recoveryNote, "Pending recovery note");
      setActiveDepositStep(2);
      setStatusBanner({
        tone: "info",
        text: "Encrypted recovery note is ready. Save it before submitting the deposit.",
      });
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to prepare encrypted recovery note.",
      });
    } finally {
      setDepositBusy(false);
    }
  };

  const startMixing = async () => {
    if (!walletAddress) {
      setStatusBanner({ tone: "error", text: "Connect your wallet before submitting the deposit." });
      return;
    }

    if (!notePassword) {
      setStatusBanner({ tone: "error", text: "Set a note password before depositing. It encrypts the recovery note you must save." });
      return;
    }

    if (!depositDraftNote) {
      setStatusBanner({ tone: "error", text: "Prepare and save the encrypted recovery note before submitting the deposit." });
      setActiveDepositStep(1);
      return;
    }

    setDepositBusy(true);
    setActiveDepositStep(3);
    setPendingDeposit({
      sessionId: "preparing",
      participantId: "preparing",
      walletAddress,
      denomination: Number(selectedPool),
      commitment: depositDraftNote.commitment,
      noteCreatedAt: depositDraftNote.createdAt,
      stage: "preparing-session",
      message: "Preparing your participant slot with the coordinator before the CT mint starts.",
      updatedAt: Date.now(),
      secret: depositDraftNote.secret,
      nullifierSecret: depositDraftNote.nullifierSecret,
    });
    setStatusBanner({ tone: "info", text: "Preparing the deposit round with the coordinator, then minting a live CT deposit note on Pudge. This can take about 60-90 seconds." });

    try {
      setPendingDeposit({
        sessionId: "minting",
        participantId: "minting",
        walletAddress,
        denomination: Number(selectedPool),
        commitment: depositDraftNote.commitment,
        noteCreatedAt: depositDraftNote.createdAt,
        stage: "minting",
        message: "Coordinator slot reserved. Waiting for the backend CT mint and on-chain confirmation.",
        updatedAt: Date.now(),
        secret: depositDraftNote.secret,
        nullifierSecret: depositDraftNote.nullifierSecret,
      });
      const result = await submitLiveDeposit(walletAddress, depositDraftNote.commitment, depositDraftNote.createdAt);
      const refreshedPool = await fetchLatestDepositPool(Number(selectedPool)).catch(() => null);
      setLatestDepositPool(refreshedPool);
      if (result.status === "finalized" && result.note) {
        const note = await restoreFinalizedDepositSecrets(result.note as DepositNote, {
          secret: depositDraftNote.secret,
          nullifierSecret: depositDraftNote.nullifierSecret,
          commitment: depositDraftNote.commitment,
          sessionId: result.sessionId,
          participantId: result.participantId,
          walletAddress,
        });
        await showEncryptedNote(note, "Finalized withdrawal note");
        setPendingDeposit(null);
        setDepositDraftNote(null);
        setActiveDepositStep(4);
        setStatusBanner({
          tone: "success",
          text: `Deposit finalized! Round tx ${result.mintTxHash.slice(0, 12)}... encrypted note is ready to save.`,
        });
      } else if (result.participantId) {
        const tracker: PendingDepositTracker = {
          sessionId: result.sessionId,
          participantId: result.participantId,
          walletAddress,
          denomination: Number(selectedPool),
          commitment: depositDraftNote.commitment,
          noteCreatedAt: depositDraftNote.createdAt,
          stage: "waiting-threshold",
          message: `Deposit minted and registered in session ${result.sessionId.slice(0, 8)}. Waiting for more participants.`,
          updatedAt: Date.now(),
          secret: depositDraftNote.secret,
          nullifierSecret: depositDraftNote.nullifierSecret,
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
        await showEncryptedNote(finalizedNote, "Finalized withdrawal note");
        const latestPoolAfterFinalize = await fetchLatestDepositPool(Number(selectedPool)).catch(() => null);
        setLatestDepositPool(latestPoolAfterFinalize);
        setPendingDeposit(null);
        setDepositDraftNote(null);
        setActiveDepositStep(4);
        setStatusBanner({
          tone: "success",
          text: "Deposit finalized! Your encrypted mixed note is ready to save.",
        });
      } else {
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
        if (!notePassword) {
          throw new Error("Enter the note password used for this deposit before saving the finalized encrypted note.");
        }
        const noteToSave = await restoreFinalizedDepositSecrets(finalized.note as DepositNote, pendingDeposit);
        await showEncryptedNote(noteToSave, "Finalized withdrawal note");
        setPendingDeposit(null);
        setDepositDraftNote(null);
        setActiveDepositStep(4);
        setStatusBanner({ tone: "success", text: "Deposit finalized. Save the encrypted note shown below." });
        return;
      }

      if (!notePassword) {
        throw new Error("Enter the note password used for this deposit before saving the finalized encrypted note.");
      }
      const note = await runPendingDepositFlow(
        pendingDeposit,
        progress => {
          setPendingDeposit(progress);
          const tone: BannerTone = progress.stage === "error" ? "error" : progress.stage === "finalized" ? "success" : "info";
          setStatusBanner({ tone, text: progress.message });
        },
      );

      await showEncryptedNote(note, "Finalized withdrawal note");
      setPendingDeposit(null);
      setDepositDraftNote(null);
      setActiveDepositStep(4);
      setStatusBanner({ tone: "success", text: "Deposit finalized. Save the encrypted note shown below." });
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

    if (pendingDeposit.walletAddress !== "unknown" && walletAddress !== pendingDeposit.walletAddress) {
      setStatusBanner({
        tone: "error",
        text: `Pending deposit belongs to ${pendingDeposit.walletAddress.slice(0, 6)}...${pendingDeposit.walletAddress.slice(-4)}. Connect that wallet to continue.`,
      });
      return;
    }

    await handleRefreshDepositProgress();
  };

  const handleCopyCurrentNote = async () => {
    const noteText = (activeTab === "deposit" ? displayedNote?.text : "") || displayedNote?.text || "";
    if (!noteText) {
      setStatusBanner({ tone: "error", text: "There is no encrypted note text to copy." });
      return;
    }

    try {
      await navigator.clipboard.writeText(noteText);
      setStatusBanner({ tone: "success", text: "Encrypted note copied. Store it somewhere safe with its password." });
    } catch (error) {
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to copy encrypted note.",
      });
    }
  };

  return {
    handleConnect,
    handleDepositPasswordChange,
    prepareDepositNote,
    startMixing,
    handleRefreshDepositProgress,
    handleResumePendingDepositRound,
    handleCopyCurrentNote,
    showEncryptedNote,
  };
}
