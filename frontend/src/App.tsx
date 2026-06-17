import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Info } from "lucide-react";

import { tryLoadFrontendRuntimeConfig } from "./runtime";
import { initializeJoyId } from "./joyid";
import { fetchLatestDepositPool, type DepositSessionSnapshot } from "./relayer";
import type { DepositNote } from "./vault";
import { Header } from "./components/Header";
import { DepositTab } from "./components/DepositTab";
import { WithdrawTab } from "./components/WithdrawTab";
import { MixerTabs } from "./components/MixerTabs";
import { FlowStepper } from "./components/FlowStepper";
import { StatsSidebar } from "./components/StatsSidebar";
import { AppFooter } from "./components/AppFooter";
import { useDepositFlow } from "./hooks/useDepositFlow";
import { useWithdrawalFlow } from "./hooks/useWithdrawalFlow";
import {
  getBannerClasses,
  type Denomination,
  type DisplayedNote,
  type PendingDepositTracker,
  type PoolState,
  type StatusBanner,
  type WithdrawalPreview,
} from "./utils/app-helpers";

const DEPOSIT_STEPS = ["Setup", "Password", "Save", "Mint", "Finalize"];
const WITHDRAW_STEPS = ["Import", "Verify", "Prepare", "Relay"];

export default function App() {
  const [selectedPool, setSelectedPool] = useState<Denomination>(100);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawalBusyId, setWithdrawalBusyId] = useState<string | null>(null);
  const [broadcastBusyId, setBroadcastBusyId] = useState<string | null>(null);
  const [preparedWithdrawals, setPreparedWithdrawals] = useState<Record<string, WithdrawalPreview>>({});
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [latestDepositPool, setLatestDepositPool] = useState<DepositSessionSnapshot | null>(null);
  const [relayBusyId, setRelayBusyId] = useState<string | null>(null);
  const [runtimeStatus] = useState(() => tryLoadFrontendRuntimeConfig());
  const [withdrawNoteString, setWithdrawNoteString] = useState("");
  const [notePassword, setNotePassword] = useState("");
  const [decryptedNote, setDecryptedNote] = useState<DepositNote | null>(null);
  const [displayedNote, setDisplayedNote] = useState<DisplayedNote | null>(null);
  const [pendingDeposit, setPendingDeposit] = useState<PendingDepositTracker | null>(null);
  const [depositDraftNote, setDepositDraftNote] = useState<DepositNote | null>(null);
  const [activeDepositStep, setActiveDepositStep] = useState(0);
  const [activeWithdrawStep, setActiveWithdrawStep] = useState(0);

  useEffect(() => {
    initializeJoyId();
    void fetchLatestDepositPool(100).then(setLatestDepositPool).catch(() => setLatestDepositPool(null));
  }, []);

  const runtimeReady = runtimeStatus.config?.runtimeMode === "live" && !!runtimeStatus.config?.nullifierRegistry;
  const pools: PoolState[] = [
    { denomination: 10, participants: 0, maxParticipants: 5, available: false, statusLabel: "Unavailable" },
    {
      denomination: 100,
      participants: latestDepositPool?.denomination === 100 ? latestDepositPool.size : 0,
      maxParticipants: latestDepositPool?.denomination === 100 ? latestDepositPool.targetSize : 5,
      available: true,
      statusLabel: latestDepositPool?.denomination === 100 ? latestDepositPool.status : "Live",
    },
    { denomination: 1000, participants: 0, maxParticipants: 3, available: false, statusLabel: "Unavailable" },
  ];
  const currentPool = pools.find(pool => pool.denomination === selectedPool) ?? pools[1];

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

  const depositFlow = useDepositFlow({
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
  });

  const withdrawalFlow = useWithdrawalFlow({
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
    showEncryptedNote: depositFlow.showEncryptedNote,
  });

  return (
    <div className="min-h-screen w-full flex flex-col items-center">
      <div className="bg-gradient-mesh pointer-events-none" />

      <Header walletAddress={walletAddress} onConnect={() => void depositFlow.handleConnect()} />

      <main className="w-full max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
        <div className="lg:col-span-7 flex flex-col">
          <MixerTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          <div className="glass-panel min-h-[520px] flex flex-col rounded-t-none relative z-0 border-t-0 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/10 z-[-1]" />
            <div className="p-8 flex-1 flex flex-col">
              {statusBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-8 rounded-none border px-4 py-3.5 text-sm flex gap-3 items-start ${getBannerClasses(statusBanner.tone)}`}
                >
                  {statusBanner.tone === "error" ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Info className="w-5 h-5 shrink-0" />}
                  {statusBanner.text}
                </motion.div>
              )}

              <FlowStepper
                steps={activeTab === "deposit" ? DEPOSIT_STEPS : WITHDRAW_STEPS}
                activeStep={activeTab === "deposit" ? activeDepositStep : activeWithdrawStep}
              />

              {activeTab === "deposit" ? (
                <DepositTab
                  activeDepositStep={activeDepositStep}
                  setActiveDepositStep={setActiveDepositStep}
                  selectedPool={selectedPool}
                  setSelectedPool={setSelectedPool}
                  pools={pools}
                  depositBusy={depositBusy}
                  notePassword={notePassword}
                  handleDepositPasswordChange={depositFlow.handleDepositPasswordChange}
                  displayedNote={displayedNote}
                  setDisplayedNote={setDisplayedNote}
                  pendingDeposit={pendingDeposit}
                  handleCopyCurrentNote={depositFlow.handleCopyCurrentNote}
                  prepareDepositNote={depositFlow.prepareDepositNote}
                  startMixing={depositFlow.startMixing}
                  handleRefreshDepositProgress={depositFlow.handleRefreshDepositProgress}
                  handleResumePendingDepositRound={depositFlow.handleResumePendingDepositRound}
                  depositDraftNote={depositDraftNote}
                  setDepositDraftNote={setDepositDraftNote}
                  currentPool={currentPool}
                />
              ) : (
                <WithdrawTab
                  activeWithdrawStep={activeWithdrawStep}
                  setActiveWithdrawStep={setActiveWithdrawStep}
                  withdrawNoteString={withdrawNoteString}
                  handleNoteChange={withdrawalFlow.handleNoteChange}
                  handleImportNote={withdrawalFlow.handleImportNote}
                  notePassword={notePassword}
                  setNotePassword={setNotePassword}
                  withdrawalBusyId={withdrawalBusyId}
                  handleWithdrawAction={withdrawalFlow.handleWithdrawAction}
                  decryptedNote={decryptedNote}
                  walletAddress={walletAddress}
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  handleRelayWithdrawal={withdrawalFlow.handleRelayWithdrawal}
                  relayBusyId={relayBusyId}
                  broadcastBusyId={broadcastBusyId}
                  runtimeReady={runtimeReady}
                  handleBroadcastWithdrawal={withdrawalFlow.handleBroadcastWithdrawal}
                />
              )}
            </div>
          </div>
        </div>

        <StatsSidebar
          selectedPool={selectedPool}
          currentPool={currentPool}
          onRefreshPool={() => void handleRefreshPoolOnly()}
        />
      </main>

      <AppFooter />
    </div>
  );
}
