import { Wallet, Settings, Copy } from "lucide-react";

interface HeaderProps {
  walletAddress: string | null;
  onConnect: () => void;
}

export function Header({ walletAddress, onConnect }: HeaderProps) {
  return (
    <header className="w-full max-w-7xl px-8 py-6 flex justify-between items-center z-20">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-3 group cursor-pointer">
          <img src="/logo.png" alt="SpectraMix Logo" className="w-9 h-9 object-contain group-hover:scale-105 transition-transform" />
          <span className="text-xl font-orbitron font-semibold tracking-wide text-white">SpectraMix</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-none bg-brand-panel/60 border-t border-l border-brand-primary/10 border-b border-r border-black shadow-[0_10px_30px_rgba(0,0,0,0.8)] text-[10px] font-bold text-brand-primary uppercase tracking-widest backdrop-blur-xl">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"/></svg>
          Pudge Testnet
        </div>
        {walletAddress ? (
          <div className="flex items-center gap-0 rounded-none border border-white/10 overflow-hidden backdrop-blur-xl bg-[#0C0018]">
            <div className="px-4 py-2 text-xs font-mono font-medium text-slate-300">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(walletAddress)}
              className="px-3 py-2 hover:bg-white/[0.05] transition-colors text-slate-400 hover:text-white border-l border-white/10"
              title="Copy Address"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="btn-primary flex items-center gap-2 text-[13px] py-2.5 px-6"
          >
            <Wallet className="w-4 h-4 opacity-80" />
            Connect
          </button>
        )}
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-none border border-white/10 bg-[#0C0018] backdrop-blur-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
          <Settings className="w-4 h-4 opacity-70" />
          Settings
        </button>
      </div>
    </header>
  );
}
