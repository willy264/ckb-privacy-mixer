import {
  ArrowDown,
  Box,
  Boxes,
  CircleDot,
  FileKey2,
  Fingerprint,
  KeyRound,
  Lock,
  Network,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import type { PrivacyArtifact } from "../types";

interface ProtocolViewProps {
  publicBalance: bigint;
  privateBalance: bigint;
  availableNotes: number;
  operationKind?: string;
  operationStatus?: string;
  artifacts: readonly PrivacyArtifact[];
}

const MASKED_VALUE = "0x********";

const protocolPath = [
  {
    title: "User CT",
    detail: "A user-owned fixed-denomination CT input",
    status: "Source asset",
    icon: Wallet,
  },
  {
    title: "StagingDeposit",
    detail: "Covenant-bound deposit waiting for protocol acceptance",
    status: "Target V1 cell",
    icon: Box,
  },
  {
    title: "PoolState + Vault",
    detail: "Atomic authoritative privacy state and CT custody update",
    status: "Target V1 cells",
    icon: Boxes,
  },
  {
    title: "Merkle + proof + nullifier",
    detail: "Membership, recipient binding, and one-time spend checks",
    status: "Target V1 verification",
    icon: ShieldCheck,
  },
  {
    title: "Recipient CT",
    detail: "A fixed-denomination CT output controlled by the recipient",
    status: "Target V1 output",
    icon: KeyRound,
  },
] as const;

const privateState = [
  {
    artifactId: "note",
    label: "Note",
    target: "Encrypted client-side",
    demo: "Represented, never revealed",
    icon: FileKey2,
  },
  {
    artifactId: "commitment",
    label: "Commitment",
    target: "Accepted into the target pool state",
    demo: "Masked representation",
    icon: CircleDot,
  },
  {
    artifactId: "merkle-membership",
    label: "Merkle root",
    target: "Authoritative in PoolState",
    demo: "Masked representation",
    icon: Network,
  },
  {
    artifactId: "nullifier",
    label: "Nullifier",
    target: "Protected until a one-time spend",
    demo: "Masked representation",
    icon: Fingerprint,
  },
  {
    artifactId: "proof",
    label: "Proof",
    target: "Bound to the target withdrawal statement",
    demo: "Abstract pipeline state",
    icon: ShieldCheck,
  },
  {
    artifactId: "recipient",
    label: "Recipient",
    target: "Bound to the resulting CT output",
    demo: "Address details withheld",
    icon: Lock,
  },
] as const;

export function ProtocolView({
  publicBalance,
  privateBalance,
  availableNotes,
  operationKind,
  operationStatus,
  artifacts,
}: ProtocolViewProps) {
  return (
    <section className="demo-protocol-view" aria-labelledby="demo-protocol-title">
      <header className="demo-view-header">
        <div className="demo-view-heading">
          <span className="demo-eyebrow">Protocol view</span>
          <h1 id="demo-protocol-title" className="demo-view-title">
            Target protocol V1
          </h1>
          <p className="demo-view-summary">
            A transparent view of the state transitions the production protocol must enforce beneath
            the application abstraction.
          </p>
        </div>
        <div className="demo-target-badge" role="status">
          Target protocol V1 - not live chain state
        </div>
      </header>

      <aside className="demo-protocol-notice" aria-label="Current protocol status">
        <ShieldCheck className="demo-notice-icon" aria-hidden="true" />
        <div className="demo-notice-copy">
          <strong className="demo-notice-title">Protocol target, not blockchain evidence</strong>
          <p className="demo-notice-text">
            Values and operation stages on this screen are abstract demo state. No transaction hash,
            chain acceptance, or production privacy guarantee is implied.
          </p>
        </div>
      </aside>

      <section className="demo-protocol-summary" aria-labelledby="demo-protocol-summary-title">
        <h2 id="demo-protocol-summary-title" className="demo-section-title">
          Current demo state
        </h2>
        <dl className="demo-protocol-metrics">
          <div className="demo-protocol-metric">
            <dt className="demo-protocol-metric-label">Public CT</dt>
            <dd className="demo-protocol-metric-value">{publicBalance.toString()} CT</dd>
          </div>
          <div className="demo-protocol-metric">
            <dt className="demo-protocol-metric-label">Private CT</dt>
            <dd className="demo-protocol-metric-value">{privateBalance.toString()} CT</dd>
          </div>
          <div className="demo-protocol-metric">
            <dt className="demo-protocol-metric-label">Available notes</dt>
            <dd className="demo-protocol-metric-value">{availableNotes}</dd>
          </div>
          <div className="demo-protocol-metric">
            <dt className="demo-protocol-metric-label">Demo operation</dt>
            <dd className="demo-protocol-metric-value">{operationKind ?? "None"}</dd>
          </div>
          <div className="demo-protocol-metric">
            <dt className="demo-protocol-metric-label">Operation state</dt>
            <dd className="demo-protocol-metric-value">{operationStatus ?? "Idle"}</dd>
          </div>
        </dl>
      </section>

      <section className="demo-protocol-path-section" aria-labelledby="demo-protocol-path-title">
        <div className="demo-section-heading">
          <Boxes className="demo-section-icon" aria-hidden="true" />
          <div className="demo-section-heading-copy">
            <h2 id="demo-protocol-path-title" className="demo-section-title">
              Fixed-note asset path
            </h2>
            <p className="demo-section-description">
              The target V1 path binds accepted privacy state to the CT asset it later releases.
            </p>
          </div>
        </div>

        <ol className="demo-protocol-path" aria-label="Target V1 asset and privacy state path">
          {protocolPath.map((step, index) => {
            const Icon = step.icon;
            return (
              <li className="demo-protocol-path-entry" key={step.title}>
                <article className="demo-protocol-path-node">
                  <Icon className="demo-protocol-path-icon" aria-hidden="true" />
                  <div className="demo-protocol-path-copy">
                    <h3 className="demo-protocol-path-label">{step.title}</h3>
                    <p className="demo-protocol-path-detail">{step.detail}</p>
                  </div>
                  <span className="demo-protocol-path-status">{step.status}</span>
                </article>
                {index < protocolPath.length - 1 && (
                  <ArrowDown className="demo-protocol-path-arrow" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="demo-private-state-section" aria-labelledby="demo-private-state-title">
        <div className="demo-section-heading">
          <Lock className="demo-section-icon" aria-hidden="true" />
          <div className="demo-section-heading-copy">
            <h2 id="demo-private-state-title" className="demo-section-title">
              Private state inspection
            </h2>
            <p className="demo-section-description">Only roles and lifecycle states are visible. Secret values stay hidden.</p>
          </div>
        </div>

        <ul className="demo-private-state-grid">
          {privateState.map(item => {
            const Icon = item.icon;
            const artifact = artifacts.find(candidate => candidate.id === item.artifactId);
            return (
              <li className="demo-private-state-item" key={item.label}>
                <div className="demo-private-state-heading">
                  <Icon className="demo-private-state-icon" aria-hidden="true" />
                  <h3 className="demo-private-state-label">{item.label}</h3>
                  <span className={`demo-artifact-status is-${artifact?.status ?? "idle"}`}>
                    {artifact?.status ?? "idle"}
                  </span>
                </div>
                <code className="demo-private-state-value" aria-label={`${item.label} value masked`}>
                  {artifact?.displayValue ?? MASKED_VALUE}
                </code>
                <dl className="demo-private-state-details">
                  <div className="demo-private-state-detail">
                    <dt className="demo-private-state-term">Target V1</dt>
                    <dd className="demo-private-state-description">{item.target}</dd>
                  </div>
                  <div className="demo-private-state-detail">
                    <dt className="demo-private-state-term">This demo</dt>
                    <dd className="demo-private-state-description">
                      {artifact?.status === "idle" ? item.demo : `Simulation state: ${artifact?.status}`}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="demo-boundary-section" aria-labelledby="demo-boundary-title">
        <div className="demo-section-heading">
          <Box className="demo-section-icon" aria-hidden="true" />
          <div className="demo-section-heading-copy">
            <h2 id="demo-boundary-title" className="demo-section-title">
              Current demo boundary
            </h2>
            <p className="demo-section-description">What the interaction demonstrates and what remains protocol work.</p>
          </div>
        </div>
        <div className="demo-boundary-columns">
          <article className="demo-boundary-column">
            <h3 className="demo-boundary-heading">Demonstrated here</h3>
            <ul className="demo-boundary-list">
              <li className="demo-boundary-item">CCC-compatible privacy-module experience</li>
              <li className="demo-boundary-item">Opt-in public and private application modes</li>
              <li className="demo-boundary-item">Fixed-note balance and operation abstraction</li>
              <li className="demo-boundary-item">Masked protocol-state visualization</li>
            </ul>
          </article>
          <article className="demo-boundary-column">
            <h3 className="demo-boundary-heading">Not claimed by this demo</h3>
            <ul className="demo-boundary-list">
              <li className="demo-boundary-item">Deployed PoolState, Vault, or staging contracts</li>
              <li className="demo-boundary-item">Real privacy-operation signing or submission</li>
              <li className="demo-boundary-item">Private transfers or private payment in V1</li>
              <li className="demo-boundary-item">Arbitrary denominations or production readiness</li>
            </ul>
          </article>
        </div>
      </section>
    </section>
  );
}
