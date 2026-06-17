import { motion } from "framer-motion";

interface FlowStepperProps {
  steps: string[];
  activeStep: number;
}

export function FlowStepper({ steps, activeStep }: FlowStepperProps) {
  return (
    <div className="flex items-center justify-between mb-10 px-4">
      {steps.map((step, idx) => {
        const isActive = activeStep === idx;
        const isCompleted = activeStep > idx;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-none flex items-center justify-center text-[11px] font-semibold transition-all duration-500 ${
                isActive
                  ? "bg-brand-primary text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                  : isCompleted
                    ? "bg-white/10 text-brand-primary border border-brand-primary/30"
                    : "bg-black/30 text-slate-600 border border-white/5"
              }`}>
                {isCompleted ? "✓" : idx + 1}
              </div>
              <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] transition-colors duration-300 ${isActive ? "text-brand-primary" : isCompleted ? "text-slate-400" : "text-slate-600"}`}>{step}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[1px] mx-4 bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full bg-brand-primary"
                  initial={{ width: 0 }}
                  animate={{ width: isCompleted ? "100%" : "0%" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
