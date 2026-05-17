import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Zap,
  Lock,
  Users,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { connect, initConfig } from "@joyid/ckb";
import {
  generateStealthAddress,
  joinMix,
  randomBlindingFactor,
  type DepositResult,
} from "mixer-sdk";
import { tryLoadFrontendRuntimeConfig } from "./runtime";
import {
  broadcastPreparedWithdrawal,
  prepareVaultWithdrawal,
  relayWithdrawal,
  type PreparedVaultWithdrawal,
} from "./withdrawal";
import { joinLiveMix } from "./coordinator";
import {
  getNoteId,
  getNotesFromVault,
  refreshVault,
  saveNoteToVault,
  updateNoteInVault,
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

interface WithdrawalPreview extends PreparedVaultWithdrawal {
  preparedAt: number;
  rawTransactionJson: string;
  broadcastTxHash?: string;
  broadcastedAt?: number;
}

const SUPPORTED_DENOMINATION: Denomination = 100;

function getBannerClasses(tone: BannerTone) {
  if (tone === "success") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (tone === "error") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }

  return "border-sky-400/30 bg-sky-500/10 text-sky-100";
}

export default function App() {
  const [selectedPool, setSelectedPool] = useState<Denomination | null>(null);
  const [isMixing, setIsMixing] = useState(false);
  const [mixingStep, setMixingStep] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"mixer" | "vault">("mixer");
  const [vaultNotes, setVaultNotes] = useState<DepositNote[]>([]);
  const [withdrawalBusyId, setWithdrawalBusyId] = useState<string | null>(null);
  const [broadcastBusyId, setBroadcastBusyId] = useState<string | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [preparedWithdrawals, setPreparedWithdrawals] = useState<Record<string, WithdrawalPreview>>({});
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [lastDepositResult, setLastDepositResult] = useState<DepositResult | null>(null);
  const [relayBusyId, setRelayBusyId] = useState<string | null>(null);
  const [runtimeStatus] = useState(() => tryLoadFrontendRuntimeConfig());

  const runtimeMode = runtimeStatus.mode;
  const runtimeReady = runtimeStatus.config?.runtimeMode === "live" && !!runtimeStatus.config?.nullifierRegistry;
  const withdrawalAuthority = runtimeStatus.authority;
  const selectedPoolState = (() => {
    const pools: PoolState[] = [
      {
        denomination: 100,
        participants: lastDepositResult?.session.participantCount ?? 3,
        maxParticipants: lastDepositResult?.session.requiredParticipants ?? 3,
        available: runtimeMode !== "disabled",
        statusLabel: runtimeMode === "live" ? "Live preview on Aggron" : runtimeMode === "preview" ? "Preview coordinator" : "Config incomplete",
      },
      { denomination: 10, participants: 0, maxParticipants: 5, available: false, statusLabel: "Backend not deployed" },
      { denomination: 1000, participants: 0, maxParticipants: 3, available: false, statusLabel: "Backend not deployed" },
    ];
    return pools.find(pool => pool.denomination === selectedPool) ?? null;
  })();

  const pools: PoolState[] = [
    {
      denomination: 100,
      participants: lastDepositResult?.session.participantCount ?? 3,
      maxParticipants: lastDepositResult?.session.requiredParticipants ?? 3,
      available: runtimeMode !== "disabled",
      statusLabel: runtimeMode === "live" ? "Live preview on Aggron" : runtimeMode === "preview" ? "Preview coordinator" : "Config incomplete",
    },
    { denomination: 10, participants: 0, maxParticipants: 5, available: false, statusLabel: "Backend not deployed" },
    { denomination: 1000, participants: 0, maxParticipants: 3, available: false, statusLabel: "Backend not deployed" },
  ];

  useEffect(() => {
    initConfig({
      name: "Obscell Privacy Mixer",
      logo: "https://fav.farm/CKB",
      joyidAppURL: "https://testnet.joyid.dev",
      network: "testnet",
    });
    void refreshVault().then(notes => setVaultNotes(notes));
  }, []);

  useEffect(() => {
    if (activeTab === "vault") {
      void refreshVault().then(notes => setVaultNotes(notes));
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isMixing) {
      return;
    }

    const timer = setInterval(() => {
      setMixingStep(prev => {
        if (prev >= 96) {
          clearInterval(timer);
          return 96;
        }
        return prev + 4;
      });
    }, 120);

    return () => clearInterval(timer);
  }, [isMixing]);

  const handleConnect = async () => {
    try {
      const connection = await connect();
      setWalletAddress(connection.address);
      setStatusBanner({
        tone: "success",
        text: "Wallet connected. Deposit notes will derive their stealth destination from this JoyID session.",
      });
    } catch (error) {
      console.error("Connection failed:", error);
      setStatusBanner({
        tone: "error",
        text: "JoyID connection failed. Wallet connection is required before preparing a deposit note.",
      });
    }
  };

  const startMixing = async (pool: PoolState) => {
    if (!pool.available) {
      setStatusBanner({
        tone: "info",
        text: `The ${pool.denomination} CT pool is not available yet. The current demo supports fixed 100 CT deposits only.`,
      });
      return;
    }

    if (!walletAddress) {
      setStatusBanner({
        tone: "error",
        text: "Connect JoyID before preparing a deposit note.",
      });
      return;
    }

    setSelectedPool(pool.denomination);
    setIsMixing(true);
    setMixingStep(10);
    setDepositBusy(true);
    setStatusBanner(null);

    try {
      const stealthOutputAddress = generateStealthAddress(walletAddress);
      const inputOutPoint = `0xpreview_${Date.now().toString(16)}`;
      let result;
      
      if (runtimeMode === "live") {
        if (!walletAddress) throw new Error("Wallet not connected");
        result = await joinLiveMix({
          denomination: BigInt(pool.denomination),
          stealthOutputAddress,
          inputOutPoint,
          walletAddress,
          onProgress: setMixingStep,
        });
      } else {
        result = await joinMix({
          ctInputCell: {
            outPoint: inputOutPoint,
            amount: BigInt(pool.denomination),
            blindingFactor: randomBlindingFactor(),
          },
          stealthOutputAddress,
          privateKey: `joyid_session_${walletAddress.slice(-8)}`,
          runtimeMode: "preview",
        });
      }

      setMixingStep(100);
      const note: DepositNote = {
        ...result.note,
        denomination: pool.denomination,
        withdrawalStatus: "idle",
        registrySnapshot: {
          ...result.note.registrySnapshot,
          authority: withdrawalAuthority,
        },
      };
      await saveNoteToVault(note);
      setVaultNotes(getNotesFromVault());
      setLastDepositResult(result);
      setStatusBanner({
        tone: "success",
        text:
          result.status === "confirmed"
            ? `Deposit session ${result.sessionId} prepared. The canonical vault note is saved and ready for proof generation.`
            : `Deposit session ${result.sessionId} is still waiting on additional signatures, but the canonical note preview has been saved locally.`,
      });
    } catch (error) {
      console.error("Deposit preparation failed:", error);
      setStatusBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to prepare the deposit session.",
      });
      setIsMixing(false);
      setMixingStep(0);
    } finally {
      setDepositBusy(false);
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

      await updateNoteInVault(updatedNote);
      setVaultNotes(getNotesFromVault());
      setPreparedWithdrawals(prev => ({
        ...prev,
        [noteId]: {
          ...prepared,
          preparedAt,
          rawTransactionJson: JSON.stringify(prepared.transaction.rawTransaction, null, 2),
        },
      }));
      setStatusBanner({
        tone: "success",
        text:
          prepared.mode === "aggron-preview"
            ? "Groth16 proof generated in the browser and paired with the live Aggron registry metadata."
            : "Groth16 proof generated in the browser. Runtime config is still in preview mode, so the transaction remains local-only.",
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
          rawTransactionJson: JSON.stringify(prepared.transaction.rawTransaction, null, 2),
          broadcastTxHash: txHash,
          broadcastedAt,
        },
      }));
      setStatusBanner({
        tone: "success",
        text: `Withdrawal broadcast to Aggron. Transaction hash: ${txHash}`,
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
      setStatusBanner({ tone: 'error', text: 'Generate the withdrawal proof first before relaying.' });
      return;
    }

    // Relay to a fresh stealth address — the user does NOT need their wallet connected
    const recipient = note.stealthOutputAddress;
    setRelayBusyId(noteId);
    setStatusBanner(null);

    try {
      const txHash = await relayWithdrawal(prepared, recipient);
      const updatedNote: DepositNote = {
        ...note,
        withdrawalStatus: 'submitted',
        lastBroadcastAt:  Date.now(),
        lastBroadcastHash: txHash,
      };
      await updateNoteInVault(updatedNote);
      setVaultNotes(getNotesFromVault());
      setStatusBanner({
        tone: 'success',
        text: `Relayed successfully — tx hash: ${txHash}. Your withdrawal is anonymous.`,
      });
    } catch (error) {
      setStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Relay failed.',
      });
    } finally {
      setRelayBusyId(null);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 py-12 flex flex-col items-center">
      <div className="mesh-bg"></div>

      <header className="w-full max-w-6xl flex justify-between items-center mb-16">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/20 rounded-xl border border-primary/30">
            <Shield className="w-8 h-8 text-[#00f2ff]" />
          </div>
          <div>
            <h1 className="text-2xl font-orbitron glow-text text-[#00f2ff]">
              Obscell Mixer
            </h1>
            <p className="text-xs text-gray-400 tracking-widest uppercase">
              Privacy-Aggron Protocol
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {walletAddress ? (
            <div className="glass-card px-6 py-3 flex items-center gap-4 border-[#00f2ff]/30">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-[#00f2ff] uppercase tracking-tighter">
                  Connected
                </span>
                <span className="font-orbitron text-sm">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f2ff] to-[#7000ff] shadow-[0_0_15px_rgba(0,242,255,0.4)]" />
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="glass-card px-6 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors group cursor-pointer"
            >
              <Wallet className="w-5 h-5 text-[#00f2ff] group-hover:scale-110 transition-transform" />
              <span className="font-orbitron text-sm font-bold">Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      <div className="w-full max-w-6xl mb-8 flex gap-4 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab("mixer")}
          className={`font-orbitron px-4 py-2 rounded-lg transition-colors ${activeTab === "mixer" ? "bg-[#00f2ff]/10 text-[#00f2ff] border border-[#00f2ff]/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
        >
          Mixing Pools
        </button>
        <button
          onClick={() => setActiveTab("vault")}
          className={`font-orbitron px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${activeTab === "vault" ? "bg-[#7000ff]/10 text-[#a040ff] border border-[#7000ff]/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
        >
          <Shield className="w-4 h-4" /> My Vault
        </button>
      </div>

      {statusBanner && (
        <div className={`w-full max-w-6xl mb-8 rounded-2xl border px-5 py-4 text-sm ${getBannerClasses(statusBanner.tone)}`}>
          {statusBanner.text}
        </div>
      )}

      {activeTab === "mixer" ? (
        <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <section>
              <div className="flex items-center justify-between mb-6 gap-4">
                <h2 className="text-xl font-orbitron flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" /> Active Pools
                </h2>
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Runtime: {runtimeMode}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pools.map(pool => (
                  <div
                    key={pool.denomination}
                    className={`glass-card p-6 relative overflow-hidden group transition-all ${pool.available ? "cursor-pointer" : "opacity-60"} ${selectedPool === pool.denomination ? "border-[#00f2ff]" : ""}`}
                    onClick={() => !depositBusy && void startMixing(pool)}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Lock className="w-12 h-12" />
                    </div>
                    <div className="flex justify-between items-start mb-4 gap-4">
                      <div>
                        <span className="text-sm text-gray-400 uppercase">
                          Fixed Amount
                        </span>
                        <h3 className="text-3xl font-orbitron text-white">
                          {pool.denomination} CT
                        </h3>
                      </div>
                      <div className={`text-[10px] uppercase px-3 py-1 rounded-full border ${pool.available ? "border-emerald-400/30 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-gray-400 bg-white/5"}`}>
                        {pool.statusLabel}
                      </div>
                    </div>
                    <div className="flex justify-between items-end mb-4">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-[#00f2ff]">
                          <Users className="w-4 h-4" />
                          <span className="font-orbitron">
                            {pool.participants}/{pool.maxParticipants}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 uppercase">
                          Participants
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-[#00f2ff] to-[#7000ff]"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${pool.maxParticipants > 0 ? (pool.participants / pool.maxParticipants) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card p-6 border-dashed border-gray-700 bg-transparent">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-bold text-blue-400 mb-1">
                    Current Product Boundary
                  </h4>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    The current repo can now generate canonical deposit notes, browser-side Groth16 proofs,
                    and withdrawal previews from one shared SDK shape. Deposit coordination is still a preview/demo
                    flow until a real Aggron session coordinator and CT input sourcing are added.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="lg:col-span-5">
            <AnimatePresence mode="wait">
              {!isMixing ? (
                <motion.div
                  key="join"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-card p-8 h-full flex flex-col justify-center items-center text-center"
                >
                  <div className="w-20 h-20 bg-[#00f2ff]/10 rounded-full flex items-center justify-center mb-6 animate-pulse-slow">
                    <Lock className="w-10 h-10 text-[#00f2ff]" />
                  </div>
                  <h2 className="text-2xl font-orbitron mb-4">Prepare Deposit Note</h2>
                  <p className="text-gray-400 mb-6 max-w-xs">
                    Join the 100 CT flow to produce a canonical vault note that can later generate
                    a Groth16 withdrawal proof directly in your browser.
                  </p>
                  <p className="text-xs text-gray-500 mb-8 max-w-sm">
                    Runtime mode: <span className="text-gray-300">{runtimeMode}</span>. Withdrawal authority:
                    <span className="text-gray-300"> {withdrawalAuthority}</span>.
                  </p>
                  {walletAddress ? (
                    <button
                      className="btn-primary w-full max-w-xs flex items-center justify-center gap-2"
                      onClick={() => void startMixing(pools[0])}
                      disabled={depositBusy}
                    >
                      {depositBusy ? "Preparing..." : "Join 100 CT Flow"} <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      className="btn-primary w-full max-w-xs flex items-center justify-center gap-2 opacity-80"
                      onClick={handleConnect}
                    >
                      Connect Wallet to Begin <Wallet className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="mixing"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card p-8 h-full flex flex-col"
                >
                  <h2 className="text-xl font-orbitron mb-8 flex items-center justify-between">
                    <span>Deposit Preparation</span>
                    <span className="text-sm font-normal text-gray-500">
                      {selectedPoolState ? `${selectedPoolState.denomination} CT` : "Active"}
                    </span>
                  </h2>

                  <div className="flex-1 flex flex-col justify-center">
                    <div className="relative w-48 h-48 mx-auto mb-12">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="96"
                          cy="96"
                          r="80"
                          stroke="rgba(255,255,255,0.05)"
                          strokeWidth="8"
                          fill="none"
                        />
                        <motion.circle
                          cx="96"
                          cy="96"
                          r="80"
                          stroke="#00f2ff"
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray="502"
                          animate={{
                            strokeDashoffset: 502 - (502 * mixingStep) / 100,
                          }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-orbitron glow-text">
                          {mixingStep}%
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase">
                          Synchronizing
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <MixingStep
                        label="Collecting Deposit Inputs"
                        status={mixingStep > 20 ? "done" : "active"}
                      />
                      <MixingStep
                        label="Generating Stealth Output"
                        status={
                          mixingStep > 50
                            ? "done"
                            : mixingStep > 20
                              ? "active"
                              : "pending"
                        }
                      />
                      <MixingStep
                        label="Building Session Commitments"
                        status={
                          mixingStep > 80
                            ? "done"
                            : mixingStep > 50
                              ? "active"
                              : "pending"
                        }
                      />
                      <MixingStep
                        label="Saving Canonical Vault Note"
                        status={
                          mixingStep >= 100
                            ? "done"
                            : mixingStep > 80
                              ? "active"
                              : "pending"
                        }
                      />
                    </div>
                  </div>

                  {mixingStep === 100 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 flex flex-col gap-3"
                    >
                      <button
                        className="btn-primary w-full"
                        onClick={() => {
                          setActiveTab("vault");
                          setIsMixing(false);
                        }}
                      >
                        Open Vault
                      </button>
                      <button
                        className="text-sm text-gray-500 hover:text-white transition-colors"
                        onClick={() => setIsMixing(false)}
                      >
                        Close Session
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      ) : (
        <main className="w-full max-w-6xl flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-orbitron flex items-center gap-3">
                <Shield className="w-6 h-6 text-[#a040ff]" /> My Secure Vault
              </h2>
              <p className="text-sm text-gray-400 mt-2">
                Generate a browser-side Groth16 proof from a saved deposit note and
                prepare the withdrawal transaction against the configured runtime mode.
              </p>
            </div>
            <div className={`text-sm px-4 py-3 rounded-xl border ${runtimeReady ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : runtimeMode === "preview" ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
              <div className="font-semibold">
                {runtimeReady ? "Aggron Live Metadata Ready" : runtimeMode === "preview" ? "Preview Runtime Mode" : "Runtime Disabled"}
              </div>
              <div className="text-xs mt-1 opacity-80">
                {runtimeReady
                  ? "Deployment pointers were found, so the app can pair proofs with the live nullifier registry."
                  : runtimeStatus.error ?? "Runtime config is incomplete, so withdrawals stay in local preview mode."}
              </div>
            </div>
          </div>

          {vaultNotes.length === 0 ? (
            <div className="glass-card p-16 flex flex-col items-center justify-center text-center border-dashed border-gray-700/50">
              <Lock className="w-16 h-16 text-gray-700 mb-6" />
              <h3 className="text-xl font-orbitron mb-2 text-gray-300">No Deposit Notes Found</h3>
              <p className="text-gray-500 max-w-md">
                Prepare a 100 CT deposit note to save it here. The vault now stores the
                canonical note schema, proof-encoding metadata, and session commitments
                required for browser-side proof generation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {vaultNotes.map(note => {
                const noteId = getNoteId(note);
                const prepared = preparedWithdrawals[noteId];
                const isPreparing = withdrawalBusyId === noteId;
                const isBroadcasting = broadcastBusyId === noteId;
                const supported = note.denomination === SUPPORTED_DENOMINATION;

                return (
                  <div key={noteId} className="glass-card p-6 flex flex-col gap-4 border-[#7000ff]/30">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Amount</span>
                        <h3 className="text-2xl font-orbitron text-white">{note.denomination} CT</h3>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] uppercase border ${note.withdrawalStatus === "submitted" ? "border-sky-400/30 bg-sky-500/10 text-sky-200" : note.withdrawalStatus === "proof-ready" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-gray-400"}`}>
                        {note.withdrawalStatus === "submitted" ? "Broadcasted" : note.withdrawalStatus === "proof-ready" ? "Proof Ready" : "Awaiting Proof"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Session ID</span>
                        <span className="text-xs text-gray-300 font-mono truncate block">{note.sessionId}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Commitment</span>
                        <span className="text-xs text-gray-300 font-mono truncate block">{note.commitment?.slice(0, 18)}...</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Proof Encoding</span>
                        <span className="text-xs text-gray-400">{note.proofEncoding ?? "unknown"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Session Size</span>
                        <span className="text-xs text-gray-400">
                          {note.sessionCommitments?.length ?? 1} commitments in this saved session
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase block">Created At</span>
                        <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      className={`btn-primary w-full mt-2 ${supported ? "bg-gradient-to-r from-[#7000ff] to-[#a040ff] text-white" : "opacity-50 cursor-not-allowed"}`}
                      disabled={!supported || isPreparing}
                      onClick={() => void handlePrepareWithdrawal(note)}
                    >
                      {isPreparing
                        ? "Generating Proof..."
                        : prepared
                          ? "Regenerate Proof Preview"
                          : "Generate Proof & Prepare Withdrawal"}
                    </button>

                    <button
                      className={`btn-primary w-full ${
                        prepared?.mode === 'aggron-preview' && walletAddress
                          ? 'bg-gradient-to-r from-[#00f2ff] to-[#0082ff] text-black'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      disabled={!prepared || prepared.mode !== 'aggron-preview' || !walletAddress || isPreparing || isBroadcasting || relayBusyId === noteId}
                      onClick={() => void handleBroadcastWithdrawal(note)}
                    >
                      {isBroadcasting ? 'Broadcasting...' : 'Sign With JoyID & Broadcast'}
                    </button>

                    <button
                      className={`btn-primary w-full ${
                        prepared?.mode === 'aggron-preview'
                          ? 'bg-gradient-to-r from-[#7000ff] to-[#a040ff] text-white'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      disabled={!prepared || prepared.mode !== 'aggron-preview' || isPreparing || isBroadcasting || relayBusyId === noteId}
                      onClick={() => void handleRelayWithdrawal(note)}
                      title="Submit proof to the off-chain relayer. No JoyID signing needed — your identity stays private."
                    >
                      {relayBusyId === noteId ? 'Relaying…' : '🔒 Relay (Private, No Wallet Needed)'}
                    </button>

                    {!supported && (
                      <p className="text-xs text-amber-200/80">
                        This is a legacy UI denomination. The deployed contracts only support 100 CT withdrawals.
                      </p>
                    )}

                    {supported && !walletAddress && (
                      <p className="text-xs text-gray-400">
                        Connect the JoyID wallet that controls the live registry lock to sign and broadcast from the browser.
                      </p>
                    )}

                    {prepared?.mode === "local-preview" && (
                      <p className="text-xs text-amber-100/80">
                        This note is only prepared for local preview right now. Switch the runtime config to live before attempting a broadcast.
                      </p>
                    )}

                    {prepared && (
                      <div className="rounded-2xl border border-[#00f2ff]/20 bg-[#00f2ff]/5 p-4 space-y-3">
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-sm font-semibold text-[#00f2ff]">
                            {prepared.mode === "aggron-preview" ? "Aggron Registry Preview" : "Local Registry Preview"}
                          </span>
                          <span className="text-[10px] uppercase text-gray-400">
                            {new Date(prepared.preparedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block">Nullifier</span>
                          <span className="text-xs text-gray-300 font-mono break-all">{prepared.transaction.nullifier}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block">Merkle Root</span>
                          <span className="text-xs text-gray-300 font-mono break-all">{prepared.proof.publicInputs.merkleRoot}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase block">Submission Mode</span>
                          <span className="text-xs text-gray-300">
                            {prepared.transaction.submission.runtimeMode} / {prepared.transaction.submission.authorityMode}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
                          <div>Session size: {prepared.sessionSize}</div>
                          <div>Registry entries: {prepared.registrySize}</div>
                          <div>Witness bytes: {prepared.proof.snarkProof?.length ?? prepared.proof.serializedWitness.length}</div>
                          <div>Outputs: {prepared.transaction.outputs.length}</div>
                        </div>
                        {(prepared.broadcastTxHash || note.lastBroadcastHash) && (
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase block">Broadcast Tx</span>
                            <span className="text-xs text-gray-300 font-mono break-all">
                              {prepared.broadcastTxHash ?? note.lastBroadcastHash}
                            </span>
                          </div>
                        )}
                        {prepared.warnings.length > 0 && (
                          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-2">
                            {prepared.warnings.map(warning => (
                              <p key={warning}>{warning}</p>
                            ))}
                          </div>
                        )}
                        <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <summary className="cursor-pointer text-sm text-gray-300">
                            Raw withdrawal transaction
                          </summary>
                          <pre className="mt-3 overflow-x-auto text-[11px] leading-5 text-gray-400 whitespace-pre-wrap break-all">
                            {prepared.rawTransactionJson}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      <footer className="mt-20 text-gray-600 text-xs tracking-widest uppercase flex gap-8 flex-wrap justify-center">
        <span>Network: CKB Aggron Testnet</span>
        <span>Supported Pool: 100 CT</span>
        <span>Proofs: Groth16 in Browser</span>
      </footer>
    </div>
  );
}

function MixingStep({
  label,
  status,
}: {
  label: string;
  status: "done" | "active" | "pending";
}) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${status === "active" ? "bg-[#00f2ff]/5 border-[#00f2ff]/20" : "bg-transparent border-transparent"}`}
    >
      <span
        className={`text-sm ${status === "pending" ? "text-gray-600" : status === "active" ? "text-[#00f2ff]" : "text-gray-400"}`}
      >
        {label}
      </span>
      {status === "done" ? (
        <CheckCircle2 className="w-4 h-4 text-green-400" />
      ) : status === "active" ? (
        <div className="w-4 h-4 border-2 border-[#00f2ff] border-t-transparent rounded-full animate-spin" />
      ) : (
        <div className="w-2 h-2 rounded-full bg-gray-800" />
      )}
    </div>
  );
}
