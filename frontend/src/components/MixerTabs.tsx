interface MixerTabsProps {
  activeTab: "deposit" | "withdraw";
  setActiveTab: (tab: "deposit" | "withdraw") => void;
}

export function MixerTabs({ activeTab, setActiveTab }: MixerTabsProps) {
  return (
    <div className="flex h-[52px] relative z-10 w-full mb-[-1px]">
      <button
        onClick={() => setActiveTab("deposit")}
        className={`relative flex-1 flex items-center justify-center font-bold tracking-widest uppercase transition-all ${
          activeTab === "deposit" ? "text-brand-primary z-20" : "text-slate-500 hover:text-slate-300 z-0"
        }`}
      >
        <div
          className={`absolute inset-0 origin-bottom transition-all duration-300 ${
            activeTab === "deposit"
              ? "bg-[#0C0018] border-t border-l border-white/10"
              : "bg-[#05000A]/80 border-b border-white/5"
          }`}
          style={{
            clipPath: "polygon(0 0, calc(100% - 24px) 0, 100% 100%, 0 100%)",
            borderTopLeftRadius: "0px",
          }}
        />
        {activeTab === "deposit" && (
          <div className="absolute top-0 left-0 right-[24px] h-[2px] bg-brand-primary shadow-[0_0_10px_rgba(139,92,246,0.5)] rounded-tl-[12px]" />
        )}
        <span className="relative z-10 text-[13px]">Deposit</span>
      </button>

      <button
        onClick={() => setActiveTab("withdraw")}
        className={`relative flex-1 flex items-center justify-center font-bold tracking-widest uppercase transition-all ${
          activeTab === "withdraw" ? "text-brand-primary z-20" : "text-slate-500 hover:text-slate-300 z-0"
        }`}
        style={{ marginLeft: "-24px" }}
      >
        <div
          className={`absolute inset-0 origin-bottom transition-all duration-300 ${
            activeTab === "withdraw"
              ? "bg-[#0C0018] border-t border-r border-white/10"
              : "bg-[#05000A]/80 border-b border-white/5"
          }`}
          style={{
            clipPath: "polygon(24px 0, 100% 0, 100% 100%, 0 100%)",
            borderTopRightRadius: "0px",
          }}
        />
        {activeTab === "withdraw" && (
          <div className="absolute top-0 left-[24px] right-0 h-[2px] bg-brand-primary shadow-[0_0_10px_rgba(139,92,246,0.5)] rounded-tr-[12px]" />
        )}
        <span className="relative z-10 text-[13px]">Withdraw</span>
      </button>
    </div>
  );
}
