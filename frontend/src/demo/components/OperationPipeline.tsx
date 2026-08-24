import {
  Check,
  Circle,
  CircleDashed,
  Loader2,
  Pause,
  X,
} from "lucide-react";

import type {
  PrivacyOperation,
  PrivacyPipelineStep,
  PrivacyPipelineStepId,
} from "../types";

const STEP_LABELS: Record<PrivacyPipelineStepId, string> = {
  intent: "Intent",
  "privacy-state": "Private state",
  commitment: "Commitment",
  proof: "Proof",
  "ccc-transaction": "CCC transaction",
  signer: "Signer",
  confirmation: "Chain submit",
};

function StepIcon({ step }: { step?: PrivacyPipelineStep }) {
  if (!step || step.status === "queued") {
    return <Circle aria-hidden="true" />;
  }
  if (step.status === "active") {
    return <Loader2 className="demo-spin" aria-hidden="true" />;
  }
  if (step.status === "complete") {
    return <Check aria-hidden="true" />;
  }
  if (step.status === "ready") {
    return <Pause aria-hidden="true" />;
  }
  if (step.status === "failed") {
    return <X aria-hidden="true" />;
  }
  return <CircleDashed aria-hidden="true" />;
}

function operationLabel(operation?: PrivacyOperation) {
  if (!operation) return "No operation prepared";
  if (operation.purpose === "recipient-payment") return "Private payment preview";
  if (operation.kind === "shield") return "Shield simulation";
  return "Unshield simulation";
}

export function OperationPipeline({
  operation,
  compact = false,
}: {
  operation?: PrivacyOperation;
  compact?: boolean;
}) {
  return (
    <section
      className={`demo-pipeline${compact ? " demo-pipeline--compact" : ""}`}
      aria-labelledby="demo-pipeline-title"
      aria-live="polite"
    >
      <div className="demo-section-heading">
        <div>
          <span className="demo-eyebrow">Transaction pipeline</span>
          <h2 id="demo-pipeline-title">{operationLabel(operation)}</h2>
        </div>
        <span className="demo-status-chip demo-status-chip--simulation">Simulation</span>
      </div>

      <ol className="demo-pipeline-list">
        {(Object.keys(STEP_LABELS) as PrivacyPipelineStepId[]).map((id) => {
          const step = operation?.steps.find((candidate) => candidate.id === id);
          const status = step?.status ?? "queued";
          return (
            <li key={id} className={`demo-pipeline-step is-${status}`}>
              <span className="demo-pipeline-icon">
                <StepIcon step={step} />
              </span>
              <span>
                <strong>{STEP_LABELS[id]}</strong>
                <small>
                  {status === "skipped"
                    ? "Not executed"
                    : status === "ready"
                      ? "Ready concept"
                      : status}
                </small>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="demo-pipeline-disclosure">
        No signer call, transaction submission, or chain confirmation is produced by this demo.
      </p>
    </section>
  );
}
