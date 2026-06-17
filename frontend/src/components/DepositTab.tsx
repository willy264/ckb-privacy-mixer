import { motion, AnimatePresence } from "framer-motion";
import { Shield, Info, AlertCircle, Copy } from "lucide-react";
import { type PoolState, type DisplayedNote, type PendingDepositTracker, type Denomination, getDepositTimelineIndex } from "../utils/app-helpers";
import type { DepositNote } from "../vault";

interface DepositTabProps {
  activeDepositStep: number;
  setActiveDepositStep: (step: number) => void;
  selectedPool: Denomination;
  setSelectedPool: (pool: Denomination) => void;
  pools: PoolState[];
  depositBusy: boolean;
  notePassword: string;
  handleDepositPasswordChange: (pwd: string) => void;
  displayedNote: DisplayedNote | null;
  setDisplayedNote: (note: DisplayedNote | null) => void;
  pendingDeposit: PendingDepositTracker | null;
  handleCopyCurrentNote: () => Promise<void>;
  prepareDepositNote: () => Promise<void>;
  startMixing: () => Promise<void>;
  handleRefreshDepositProgress: () => Promise<void>;
  handleResumePendingDepositRound: () => Promise<void>;
  depositDraftNote: DepositNote | null;
  setDepositDraftNote: (note: DepositNote | null) => void;
  currentPool: PoolState;
}

export function DepositTab({
  activeDepositStep, setActiveDepositStep,
  selectedPool, setSelectedPool,
  pools, depositBusy,
  notePassword, handleDepositPasswordChange,
  displayedNote, setDisplayedNote,
  pendingDeposit, handleCopyCurrentNote,
  prepareDepositNote, startMixing,
  handleRefreshDepositProgress, handleResumePendingDepositRound,
  depositDraftNote, setDepositDraftNote, currentPool
}: DepositTabProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={`deposit-step-${activeDepositStep}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex-1 flex flex-col">
        <div className="flex-1">
          {activeDepositStep === 0 && (
            <div className="space-y-10 px-2">
              {/* Token Selector */}
              <div>
                <label className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.2em] mb-4 block">Asset</label>
                <div className="w-full bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] border border-white/5 rounded-none px-5 py-4 flex items-center justify-between group hover:border-white/20 transition-all cursor-pointer backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-none bg-brand-primary/20 flex items-center justify-center border border-brand-primary/20">
                      <div className="w-3 h-3 rounded-none bg-brand-primary shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
                    </div>
                    <span className="font-semibold text-white text-base tracking-wide">CKB <span className="text-slate-500 font-normal ml-1">Nervos Network</span></span>
                  </div>
                  <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>

              {/* Amount Selector - Horizontal stepper luxury style */}
              <div>
                <div className="flex items-center gap-2 mb-8">
                  <label className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.2em]">Amount</label>
                  <Info className="w-3.5 h-3.5 text-slate-600 cursor-help" />
                </div>

                {/* Stepper Line with Dots */}
                <div className="relative px-4">
                  <div className="absolute top-[11px] left-[30px] right-[30px] h-[1px] bg-white/5" />
                  <div 
                    className="absolute top-[11px] left-[30px] h-[1px] bg-brand-primary transition-all duration-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                    style={{ width: `${(pools.findIndex(p => p.denomination === selectedPool) / (pools.length - 1)) * (100 - (60 / (pools.length)))}%` }}
                  />
                  <div className="flex items-start justify-between relative">
                    {pools.map((pool, idx) => (
                      <button
                        key={pool.denomination}
                        onClick={() => setSelectedPool(pool.denomination)}
                        disabled={!pool.available}
                        className={`flex flex-col items-center gap-4 group ${!pool.available ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className={`w-[24px] h-[24px] rounded-none border transition-all duration-300 flex items-center justify-center ${
                          selectedPool === pool.denomination
                            ? 'border-brand-primary bg-brand-primary shadow-[0_0_15px_rgba(139,92,246,0.5)]'
                            : pools.findIndex(p => p.denomination === selectedPool) > idx
                              ? 'border-brand-primary/50 bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]'
                              : 'border-white/10 bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] group-hover:border-white/30 backdrop-blur-md'
                        }`}>
                          {selectedPool === pool.denomination && <div className="w-[8px] h-[8px] rounded-none bg-white shadow-sm" />}
                        </div>
                        <span className={`text-[13px] font-semibold tracking-wide transition-colors duration-300 ${
                          selectedPool === pool.denomination ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                        }`}>
                          {pool.denomination}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeDepositStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="text-slate-400 text-[10px] font-semibold uppercase tracking-[0.2em] mb-4 block">Security Phrase</label>
                <div className="relative">
                  <input
                    type="password"
                    className="input-clean pl-12"
                    placeholder="Note protection password..."
                    value={notePassword}
                    onChange={(event) => handleDepositPasswordChange(event.target.value)}
                    autoComplete="new-password"
                  />
                  <Shield className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-primary/40" />
                </div>
                <div className="mt-5 text-[11px] text-slate-400 leading-relaxed bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] p-5 rounded-none border border-white/5 backdrop-blur-md">
                  <Info className="w-3.5 h-3.5 text-brand-primary inline-block mr-2 mb-0.5" />
                  This password is required to withdraw your funds later. It encrypts your note locally and is never sent to any server. Lose it, and your funds are lost forever.
                </div>
              </div>
            </div>
          )}

          {activeDepositStep === 2 && displayedNote && (
            <div className="space-y-5">
              <div className="p-6 bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] border border-brand-primary/20 rounded-none backdrop-blur-md">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-none bg-brand-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                    <span className="text-[10px] font-semibold text-brand-primary uppercase tracking-[0.2em]">Recovery Note Ready</span>
                  </div>
                  <button
                    onClick={() => void handleCopyCurrentNote()}
                    className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  className="w-full bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] border border-white/5 rounded-none px-5 py-4 text-sm text-brand-primary/80 font-mono focus:outline-none focus:border-brand-primary/30 transition-colors"
                  value={displayedNote.text}
                />
                <div className="mt-5 p-4 bg-[#0C0018] rounded-none flex items-start gap-4 border border-white/5">
                  <AlertCircle className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    Save this encrypted text before submitting. If your browser fails after submission, this recovery note is how you continue.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeDepositStep === 3 && (
            <div className="space-y-8">
              <div className="p-8 bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] border border-brand-primary/20 rounded-none flex flex-col items-center text-center backdrop-blur-md">
                <div className="w-16 h-16 rounded-none bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                  <div className="w-8 h-8 border-[3px] border-brand-primary/30 border-t-brand-primary rounded-none animate-spin" />
                </div>
                <h4 className="text-sm font-semibold text-white uppercase tracking-[0.2em] mb-3">Minting Asset</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-sm">
                  Coordinator reserved. Waiting for backend CT mint and on-chain confirmation on Pudge.
                </p>
              </div>

              {pendingDeposit && (
                <div className="p-5 bg-slate-900/50 border border-white/5 rounded-none">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Status</h4>
                  <div className="flex gap-2">
                  <button
                    onClick={() => void handleRefreshDepositProgress()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 rounded-none transition-colors border border-white/5"
                  >
                    REFRESH
                  </button>
                  <button
                    onClick={() => void handleResumePendingDepositRound()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 rounded-none transition-colors border border-white/5"
                  >
                    RESUME
                  </button>
                </div>
                  </div>
                  <p className="text-xs text-slate-300 font-medium mb-3">{pendingDeposit.message}</p>
                  <div className="h-1.5 w-full bg-slate-950 rounded-none overflow-hidden">
                    <motion.div 
                      className="h-full bg-brand-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${(getDepositTimelineIndex(pendingDeposit.stage) + 1) * 20}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeDepositStep === 4 && displayedNote && (
            <div className="space-y-5">
              <div className="p-6 bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] border border-brand-primary/20 rounded-none backdrop-blur-md">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-none bg-brand-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                    <span className="text-[10px] font-semibold text-brand-primary uppercase tracking-[0.2em]">Secure Note Ready</span>
                  </div>
                  <button
                    onClick={() => void handleCopyCurrentNote()}
                    className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={5}
                  className="w-full bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] border border-white/5 rounded-none px-5 py-4 text-sm text-brand-primary/80 font-mono focus:outline-none focus:border-brand-primary/30 transition-colors"
                  value={displayedNote.text}
                />
                <div className="mt-5 p-4 bg-[#0C0018] rounded-none flex items-start gap-4 border border-white/5">
                  <AlertCircle className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                    Save this encrypted text to a safe location. You will need both this text and your password to perform a private withdrawal.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-10">
          {activeDepositStep === 0 && (
            <button
              className="btn-primary w-full py-5 text-sm uppercase tracking-[0.2em]"
              onClick={() => setActiveDepositStep(1)}
              disabled={!currentPool.available}
            >
              Next: Secure Note
            </button>
          )}
          {activeDepositStep === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <button className="btn-secondary text-sm uppercase tracking-widest" onClick={() => setActiveDepositStep(0)}>Back</button>
              <button
                className="btn-primary py-5 text-sm uppercase tracking-widest"
                onClick={() => void prepareDepositNote()}
                disabled={!notePassword || depositBusy}
              >
                Prepare Note
              </button>
            </div>
          )}
          {activeDepositStep === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <button className="btn-secondary text-sm uppercase tracking-widest" onClick={() => setActiveDepositStep(1)}>Back</button>
              <button
                className="btn-primary py-5 text-sm uppercase tracking-widest"
                onClick={() => void startMixing()}
                disabled={depositBusy || !depositDraftNote}
              >
                I Saved It - Submit Deposit
              </button>
            </div>
          )}
          {activeDepositStep === 3 && (
            <button
              className="btn-secondary w-full py-5 text-sm uppercase tracking-widest"
              onClick={() => void handleRefreshDepositProgress()}
              disabled={depositBusy}
            >
              Check Progress
            </button>
          )}
          {activeDepositStep === 4 && (
            <button
              className="btn-primary w-full py-5 text-sm uppercase tracking-widest"
              onClick={() => {
                setActiveDepositStep(0);
                setDisplayedNote(null);
                setDepositDraftNote(null);
              }}
            >
              Done - Start New
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
