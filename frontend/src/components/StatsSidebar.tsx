import { motion } from "framer-motion";
import { Info, Shield } from "lucide-react";
import type { Denomination, PoolState } from "../utils/app-helpers";

interface StatsSidebarProps {
  selectedPool: Denomination;
  currentPool: PoolState;
  onRefreshPool: () => void;
}

export function StatsSidebar({ selectedPool, currentPool, onRefreshPool }: StatsSidebarProps) {
  return (
    <div className="lg:col-span-5 flex flex-col gap-6">
      <div className="glass-panel">
        <div className="flex items-center justify-between border-b border-white/5 px-8 py-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-[0.2em]">Statistics</h2>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-semibold text-brand-primary uppercase tracking-[0.2em] px-3 py-1.5 rounded-none border border-brand-primary/20 bg-brand-primary/5 shadow-[0_0_10px_rgba(139,92,246,0.2)]">{selectedPool}</span>
            <button
              onClick={onRefreshPool}
              className="w-7 h-7 flex items-center justify-center rounded-none bg-[#0C0018] border border-white/5 text-[10px] font-bold text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors uppercase tracking-widest shadow-sm"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Anonymity set</span>
              <Info className="w-3.5 h-3.5 text-slate-600 cursor-help" />
            </div>
            <div className="h-2 w-full bg-[#05000A]/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] rounded-none overflow-hidden border border-white/5">
              <motion.div
                className="h-full bg-brand-primary shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                initial={{ width: 0 }}
                animate={{ width: `${(currentPool.participants / currentPool.maxParticipants) * 100}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[11px] text-slate-500 font-medium tracking-wide">{currentPool.participants} / {currentPool.maxParticipants} participants</span>
              <span className="text-[10px] text-brand-primary font-semibold tracking-widest uppercase">{currentPool.statusLabel}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mb-5 block">Latest deposits</span>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className={`flex-[2] h-[34px] rounded-none transition-all duration-500 ${
                    i < currentPool.participants
                      ? "bg-brand-primary/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] border border-brand-primary/20 backdrop-blur-md"
                      : "bg-[#0C0018] border border-white/5"
                  }`}>
                    {i < currentPool.participants && (
                      <div className="h-full flex items-center px-4">
                        <span className="text-[11px] font-mono text-brand-primary/80">0x{(Math.random() * 0xffffffffffff).toString(16).slice(0, 12)}...</span>
                      </div>
                    )}
                  </div>
                  <div className={`flex-1 h-[34px] rounded-none transition-all duration-500 ${
                    i < currentPool.participants
                      ? "bg-[#0C0018] border border-white/10 backdrop-blur-md"
                      : "bg-[#0C0018] border border-white/5"
                  }`}>
                    {i < currentPool.participants && (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-[10px] font-medium tracking-wide text-slate-400">{Math.floor(Math.random() * 60)}m ago</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-brand-primary/5 border border-brand-primary/10 rounded-none backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <Shield className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-400 leading-relaxed font-medium tracking-wide">
            <strong className="text-brand-primary block mb-2 uppercase tracking-[0.2em] text-[9px]">Privacy Note</strong>
            SpectraMix uses non-interactive zero-knowledge proofs (Groth16) to decouple your identity from your assets. Your funds are protected by the mathematics of the BN254 curve.
          </div>
        </div>
      </div>
    </div>
  );
}
