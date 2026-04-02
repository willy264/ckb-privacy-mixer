import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Zap,
  Lock,
  Users,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type Denomination = 10 | 100 | 1000;

interface PoolState {
  denomination: Denomination;
  participants: number;
  maxParticipants: number;
}

export default function App() {
  const [selectedPool, setSelectedPool] = useState<Denomination | null>(null);
  const [isMixing, setIsMixing] = useState(false);
  const [mixingStep, setMixingStep] = useState(0);
  const [pools, setPools] = useState<PoolState[]>([
    { denomination: 10, participants: 2, maxParticipants: 5 },
    { denomination: 100, participants: 4, maxParticipants: 5 },
    { denomination: 1000, participants: 1, maxParticipants: 3 },
  ]);

  const startMixing = (denom: Denomination) => {
    setSelectedPool(denom);
    setIsMixing(true);
    setMixingStep(0);
  };

  useEffect(() => {
    if (isMixing) {
      const timer = setInterval(() => {
        setMixingStep((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            return 100;
          }
          return prev + 1;
        });
      }, 50);
      return () => clearInterval(timer);
    }
  }, [isMixing]);

  return (
    <div className="min-h-screen w-full px-6 py-12 flex flex-col items-center">
      <div className="mesh-bg"></div>

      {/* Header */}
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

        <div className="glass-card px-6 py-3 flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-500 uppercase tracking-tighter">
              Current Balance
            </span>
            <span className="font-orbitron text-sm">4,250.00 CT</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f2ff] to-[#7000ff]" />
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Pools */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section>
            <h2 className="text-xl font-orbitron mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" /> Active Pools
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pools.map((pool) => (
                <div
                  key={pool.denomination}
                  className={`glass-card p-6 cursor-pointer relative overflow-hidden group ${selectedPool === pool.denomination ? "border-[#00f2ff]" : ""}`}
                  onClick={() => !isMixing && startMixing(pool.denomination)}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Lock className="w-12 h-12" />
                  </div>
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <span className="text-sm text-gray-400 uppercase">
                        Fixed Amount
                      </span>
                      <h3 className="text-3xl font-orbitron text-white">
                        {pool.denomination} CT
                      </h3>
                    </div>
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
                        width: `${(pool.participants / pool.maxParticipants) * 100}%`,
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
                  CoinJoin-like Aggregation
                </h4>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Your funds stay in your wallet until all participants sign. If
                  a user drops out, the session resets automatically. No funds
                  are ever stuck.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Interaction */}
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
                <h2 className="text-2xl font-orbitron mb-4">Start Mixing</h2>
                <p className="text-gray-400 mb-8 max-w-xs">
                  Select a denomination pool to begin the trustless CoinJoin
                  process.
                </p>
                <button
                  className="btn-primary w-full max-w-xs flex items-center justify-center gap-2"
                  onClick={() =>
                    pools.length > 0 && startMixing(pools[1].denomination)
                  }
                >
                  Join Default Pool <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="mixing"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-8 h-full flex flex-col"
              >
                <h2 className="text-xl font-orbitron mb-8 flex items-center justify-between">
                  <span>Mixing Session</span>
                  <span className="text-sm font-normal text-gray-500">
                    ID: BCX-0042
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
                      label="Collecting Inputs"
                      status={mixingStep > 20 ? "done" : "active"}
                    />
                    <MixingStep
                      label="Generating Stealth Outputs"
                      status={
                        mixingStep > 50
                          ? "done"
                          : mixingStep > 20
                            ? "active"
                            : "pending"
                      }
                    />
                    <MixingStep
                      label="Aggregating Commitments"
                      status={
                        mixingStep > 80
                          ? "done"
                          : mixingStep > 50
                            ? "active"
                            : "pending"
                      }
                    />
                    <MixingStep
                      label="Final Signing"
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
                      onClick={() => setIsMixing(false)}
                    >
                      View Transaction
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

      <footer className="mt-20 text-gray-600 text-xs tracking-widest uppercase flex gap-8">
        <span>Network: CKB Aggron Testnet</span>
        <span>Version: 0.1.0-alpha</span>
        <span>Privacy: Experimental</span>
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
