import type { Dispatch, SetStateAction } from "react";
import {
  broadcastPreparedWithdrawal,
  prepareVaultWithdrawal,
  relayWithdrawal,
} from "../withdrawal";
import { recoverDepositByCommitment } from "../relayer";
import {
  decryptNoteBackup,
  getNoteId,
  isEncryptedNoteBackup,
  parseNoteBackup,
  type DepositNote,
} from "../vault";
import {
  buildTrackerFromNote,
  finalizeRecoveredNote,
  type DisplayedNote,
  type PendingDepositTracker,
  type StatusBanner,
  type WithdrawalPreview,
} from "../utils/app-helpers";

interface UseWithdrawalFlowParams {
  walletAddress: string | null;
  withdrawNoteString: string;
  setWithdrawNoteString: Dispatch<SetStateAction<string>>;
  notePassword: string;
  setDecryptedNote: Dispatch<SetStateAction<DepositNote | null>>;
  setDisplayedNote: Dispatch<SetStateAction<DisplayedNote | null>>;
  preparedWithdrawals: Record<string, WithdrawalPreview>;
  setPreparedWithdrawals: Dispatch<SetStateAction<Record<string, WithdrawalPreview>>>;
  setWithdrawalBusyId: Dispatch<SetStateAction<string | null>>;
  setBroadcastBusyId: Dispatch<SetStateAction<string | null>>;
  setRelayBusyId: Dispatch<SetStateAction<string | null>>;
  setStatusBanner: Dispatch<SetStateAction<StatusBanner | null>>;
  setActiveWithdrawStep: Dispatch<SetStateAction<number>>;
  setActiveTab: Dispatch<SetStateAction<"deposit" | "withdraw">>;
  setActiveDepositStep: Dispatch<SetStateAction<number>>;
  setPendingDeposit: Dispatch<SetStateAction<PendingDepositTracker | null>>;
  showEncryptedNote: (note: DepositNote, label: string) => Promise<unknown>;
}

function stringifyRawTransaction(rawTransaction: unknown) {
  return JSON.stringify(rawTransaction, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2);
}

export function useWithdrawalFlow({
  walletAddress,
  withdrawNoteString,
  setWithdrawNoteString,
  notePassword,
  setDecryptedNote,
  setDisplayedNote,
  preparedWithdrawals,
  setPreparedWithdrawals,
  setWithdrawalBusyId,
  setBroadcastBusyId,
  setRelayBusyId,
  setStatusBanner,
  setActiveWithdrawStep,
  setActiveTab,
  setActiveDepositStep,
  setPendingDeposit,
  showEncryptedNote,
}: UseWithdrawalFlowParams) {
  const handleNoteChange = async (value: string) => {
    setWithdrawNoteString(value);
    setDecryptedNote(null);
    setDisplayedNote(null);

    if (value.length > 50 && (isEncryptedNoteBackup(value) || value.trim().startsWith("{"))) {
      setActiveWithdrawStep(1);
    }
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

      setDecryptedNote(updatedNote);
      setPreparedWithdrawals(prev => ({
        ...prev,
        [noteId]: {
          ...prepared,
          preparedAt,
          rawTransactionJson: stringifyRawTransaction(prepared.transaction.rawTransaction),
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

      setDecryptedNote(updatedNote);
      setPreparedWithdrawals(prev => ({
        ...prev,
        [noteId]: {
          ...prepared,
          preparedAt,
          rawTransactionJson: stringifyRawTransaction(prepared.transaction.rawTransaction),
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
    if (!recipient) {
      setStatusBanner({ tone: "error", text: "This note is missing finalized recipient metadata. Recover or finalize it before relaying." });
      return;
    }

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
      setDecryptedNote(updatedNote);
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
    input.onchange = async (event) => {
      if (event.target && "value" in event.target) {
        (event.target as HTMLInputElement).value = "";
      }
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (!isEncryptedNoteBackup(text)) {
          parseNoteBackup(text);
          throw new Error("Plaintext notes are no longer accepted. Re-encrypt this note with a password before use.");
        }
        setWithdrawNoteString(text);
        setDecryptedNote(null);
        setDisplayedNote(null);
        setStatusBanner({ tone: "info", text: "Encrypted note loaded. Enter its password and prepare proof to decrypt it in memory." });
        setActiveWithdrawStep(1);
      } catch (err) {
        setStatusBanner({ tone: "error", text: err instanceof Error ? err.message : "Failed to import note" });
      }
    };
    input.click();
  };

  const handleWithdrawAction = async () => {
    if (!withdrawNoteString) {
      setStatusBanner({ tone: "error", text: "Paste or import an encrypted note first." });
      return;
    }
    if (!notePassword) {
      setStatusBanner({ tone: "error", text: "Enter the note password before decrypting." });
      return;
    }
    try {
      const parsedNote = await decryptNoteBackup(withdrawNoteString, notePassword);
      setDecryptedNote(parsedNote);
      setActiveWithdrawStep(2);

      if (parsedNote.status === "pending") {
        const recovery = await recoverDepositByCommitment(parsedNote.commitment);
        if (!recovery.found || !recovery.sessionId || !recovery.participantId) {
          setStatusBanner({ tone: "info", text: "This pending deposit is not registered yet. If the deposit request failed before minting, start a new deposit." });
          setActiveWithdrawStep(0);
          return;
        }

        if (recovery.note && recovery.status === "finalized") {
          const finalizedNote = await finalizeRecoveredNote(parsedNote, recovery);
          await showEncryptedNote(finalizedNote, "Finalized withdrawal note");
          setPendingDeposit(null);
          setStatusBanner({ tone: "success", text: "Recovered finalized note. Save the encrypted note shown below." });
          setActiveWithdrawStep(0);
          setActiveTab("deposit");
          setActiveDepositStep(4);
          return;
        }

        const tracker = buildTrackerFromNote(parsedNote, {
          sessionId: recovery.sessionId,
          participantId: recovery.participantId,
          walletAddress: recovery.walletAddress,
          status: recovery.status,
        });
        setPendingDeposit(tracker);
        setActiveTab("deposit");
        setActiveDepositStep(3);
        setStatusBanner({ tone: "info", text: "Recovered pending deposit. Continue from the deposit panel to finish signing/finalization." });
        return;
      }

      await handlePrepareWithdrawal(parsedNote);
      setActiveWithdrawStep(3);
    } catch (error) {
      setStatusBanner({ tone: "error", text: error instanceof Error ? error.message : "Invalid encrypted note or password." });
      setActiveWithdrawStep(1);
    }
  };

  return {
    handleNoteChange,
    handlePrepareWithdrawal,
    handleBroadcastWithdrawal,
    handleRelayWithdrawal,
    handleImportNote,
    handleWithdrawAction,
  };
}
