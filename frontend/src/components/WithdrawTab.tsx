import { motion, AnimatePresence } from "framer-motion";
import { Upload, Shield, AlertCircle } from "lucide-react";
import { type DepositNote } from "../vault";

interface WithdrawTabProps {
  activeWithdrawStep: number;
  setActiveWithdrawStep: (step: number) => void;
  withdrawNoteString: string;
  handleNoteChange: (note: string) => void | Promise<void>;
  handleImportNote: () => void;
  notePassword: string;
  setNotePassword: (pwd: string) => void;
  withdrawalBusyId: string | null;
  handleWithdrawAction: () => Promise<void>;
  decryptedNote: DepositNote | null;
  walletAddress: string | null;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  handleRelayWithdrawal: (note: DepositNote) => Promise<void>;
  relayBusyId: string | null;
  broadcastBusyId: string | null;
  runtimeReady: boolean;
  handleBroadcastWithdrawal: (note: DepositNote) => Promise<void>;
}

export function WithdrawTab({
  activeWithdrawStep, setActiveWithdrawStep,
  withdrawNoteString, handleNoteChange, handleImportNote,
  notePassword, setNotePassword,
  withdrawalBusyId, handleWithdrawAction,
  decryptedNote, walletAddress,
  showAdvanced, setShowAdvanced,
  handleRelayWithdrawal, relayBusyId,
  broadcastBusyId, runtimeReady,
  handleBroadcastWithdrawal
}: WithdrawTabProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={`withdraw-step-${activeWithdrawStep}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex-1 flex flex-col">
        <div className="flex-1">
          {activeWithdrawStep === 0 && (
            <div className="space-y-8">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">1. Paste Recovery Note</label>
                  <button onClick={handleImportNote} className="text-[11px] font-bold text-brand-primary hover:text-brand-primary/80 transition-colors uppercase flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Import JSON
                  </button>
                </div>
                <textarea
                  className="input-clean min-h-[180px] pt-4 font-mono text-[11px] leading-relaxed"
                  placeholder="Paste encrypted note JSON..."
                  value={withdrawNoteString}
                  onChange={(e) => handleNoteChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {activeWithdrawStep === 1 && (
            <div className="space-y-8">
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 block">2. Security Password</label>
                <div className="relative">
                  <input
                    type="password"
                    className="input-clean pl-11"
                    placeholder="Enter your note password..."
                    value={notePassword}
                    onChange={(event) => setNotePassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-primary/40" />
                </div>
                <div className="mt-4 text-[11px] text-slate-400 leading-relaxed bg-[#0D1117] p-4 rounded-none border border-brand-border">
                  <Shield className="w-3.5 h-3.5 text-brand-primary inline-block mr-2 mb-0.5" />
                  Your password is used to decrypt the note metadata locally. If the password is correct, you'll be able to generate the zero-knowledge proof for withdrawal.
                </div>
              </div>
            </div>
          )}

          {activeWithdrawStep === 2 && (
            <div className="space-y-6">
              <div className="p-6 bg-brand-panel/60 border-t border-l border-brand-primary/10 border-b border-r border-black shadow-[0_10px_30px_rgba(0,0,0,0.8)] rounded-none flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-none bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] flex items-center justify-center mb-4">
                  <div className="w-7 h-7 border-[3px] border-brand-primary/30 border-t-brand-primary rounded-none animate-spin" />
                </div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-2">Generating Proof</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                  Synthesizing Groth16 zk-SNARK in your browser. This proves you own an unspent commitment in the pool without revealing which one.
                </p>
              </div>
            </div>
          )}

          {activeWithdrawStep === 3 && (
            <div className="space-y-6">
              <div className="p-5 bg-brand-panel/60 border-t border-l border-brand-primary/10 border-b border-r border-black shadow-[0_10px_30px_rgba(0,0,0,0.8)] rounded-none">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-none bg-brand-primary/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-brand-primary" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Proof Validated</h4>
                    <p className="text-[9px] text-brand-primary/70 font-bold uppercase tracking-[0.2em]">Ready for Prototype Broadcast</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                   <div className="flex justify-between items-center p-3 bg-[#0D1117] rounded-none border border-brand-border">
                     <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Denomination</span>
                     <span className="text-sm font-orbitron font-bold text-brand-primary">{decryptedNote?.denomination} CT</span>
                   </div>
                   <div className="flex justify-between items-center p-3 bg-[#0D1117] rounded-none border border-brand-border">
                     <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Destination</span>
                     <span className="text-[11px] font-mono text-slate-300">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "Relayer Managed"}</span>
                   </div>
                </div>
              </div>

              <div className="p-4 bg-[#0D1117] rounded-none border border-brand-border">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Privacy Disclosure</span>
                   <span className="text-[9px] font-bold text-amber-300 uppercase tracking-widest">Not Quantified</span>
                </div>
                <div className="h-2 w-full bg-[#1a1a2e] rounded-none overflow-hidden">
                   <div className="h-full w-1/3 bg-amber-400/70" />
                </div>
              </div>

              {showAdvanced && (
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-none">
                  <p className="text-[10px] text-red-200/60 leading-relaxed font-medium">
                    <AlertCircle className="w-3.5 h-3.5 inline-block mr-1.5 mb-0.5" />
                    Caution: Direct broadcast will link your wallet address to this withdrawal on the public blockchain.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-10">
          {activeWithdrawStep === 0 && (
            <button
              className="btn-primary w-full py-5 text-sm uppercase tracking-widest"
              onClick={() => setActiveWithdrawStep(1)}
              disabled={!withdrawNoteString}
            >
              Next: Decrypt
            </button>
          )}
          {activeWithdrawStep === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <button className="btn-secondary text-sm uppercase tracking-widest" onClick={() => setActiveWithdrawStep(0)}>Back</button>
              <button
                className="btn-primary py-5 text-sm uppercase tracking-widest flex items-center justify-center gap-3"
                onClick={() => void handleWithdrawAction()}
                disabled={!notePassword || !!withdrawalBusyId}
              >
                {withdrawalBusyId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                    <span>GENERATING...</span>
                  </>
                ) : (
                  "Prepare Proof"
                )}
              </button>
            </div>
          )}
          {activeWithdrawStep === 2 && (
            <div className="w-full flex justify-center">
              <div className="flex items-center gap-2 text-brand-primary text-xs font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-none bg-brand-primary animate-pulse" />
                Computing zk-SNARK...
              </div>
            </div>
          )}
          {activeWithdrawStep === 3 && (
            <div className="flex flex-col gap-4">
              <button
                className="btn-primary w-full py-5 text-sm uppercase tracking-[0.2em] shadow-xl shadow-brand-primary/30"
                onClick={() => decryptedNote && handleRelayWithdrawal(decryptedNote)}
                disabled={relayBusyId !== null || broadcastBusyId !== null}
              >
                {relayBusyId ? "RELAYING..." : "RELAY PRIVATELY"}
              </button>
              
              <div className="flex justify-center">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-400 uppercase tracking-widest"
                >
                  {showAdvanced ? "Hide Direct Option" : "Advanced: Direct Broadcast"}
                </button>
              </div>

              {showAdvanced && (
                <button
                  className="px-6 py-4 rounded-none border border-red-500/30 text-red-400 text-[11px] font-bold uppercase tracking-widest hover:bg-red-500/5 transition-colors"
                  onClick={() => decryptedNote && handleBroadcastWithdrawal(decryptedNote)}
                  disabled={!runtimeReady || !walletAddress || broadcastBusyId !== null || relayBusyId !== null}
                >
                  {broadcastBusyId ? "SENDING..." : "Broadcast Direct (Non-Private)"}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
