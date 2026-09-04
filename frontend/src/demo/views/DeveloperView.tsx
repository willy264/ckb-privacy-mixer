import {
  ArrowDown,
  ArrowLeft,
  Box,
  Braces,
  CheckCircle2,
  Code2,
  KeyRound,
  Layers,
  Network,
  ShieldCheck,
  Wallet,
} from "lucide-react";

interface DeveloperViewProps {
  onOpenApplication: () => void;
}

const SDK_API = `import { createPrivacyClient } from "mixer-sdk";

const privacy = createPrivacyClient({
  client,
  deployment,
  prover,
  stateStore,
  services,
});

const capabilities = await privacy.getCapabilities();

await privacy.shield({
  poolId,
  signer,
});

const balance = await privacy.getPrivateBalance({
  poolId,
});

await privacy.unshield({
  noteId,
  recipient,
  submission: { kind: "relayed", maxFee },
});`;

const architecture = [
  { label: "Application", detail: "Expresses public or private user intent", icon: Code2 },
  { label: "CCC Client + Signer", detail: "Provides wallet, RPC, signing, and CKB primitives", icon: Wallet },
  { label: "Obscell Privacy SDK", detail: "Plans privacy state, proofs, and protocol operations", icon: ShieldCheck },
  { label: "CCC Transaction", detail: "Returns a standard CKB transaction for review and signing", icon: Braces },
  { label: "CKB", detail: "Validates the deployed scripts and state transition", icon: Network },
] as const;

export function DeveloperView({ onOpenApplication }: DeveloperViewProps) {
  return (
    <section className="demo-developer-view" aria-labelledby="demo-developer-title">
      <header className="demo-view-header">
        <div className="demo-view-heading">
          <span className="demo-eyebrow">Developer view</span>
          <h1 id="demo-developer-title" className="demo-view-title">
            Add privacy to an application already using CCC
          </h1>
          <p className="demo-view-summary">
            CCC remains the connectivity, wallet, signing, and transaction foundation. Obscell is an
            opt-in privacy module that consumes those capabilities.
          </p>
        </div>
        <button className="demo-back-button" type="button" onClick={onOpenApplication}>
          <ArrowLeft className="demo-button-icon" aria-hidden="true" />
          Application view
        </button>
      </header>

      <aside className="demo-prototype-notice" aria-label="SDK foundation status">
        <Box className="demo-notice-icon" aria-hidden="true" />
        <div className="demo-notice-copy">
          <strong className="demo-notice-title">V1 SDK foundation</strong>
          <p className="demo-notice-text">
            This API boundary now exists in source, but live settlement adapters are unavailable.
            Demo privacy operations remain simulated and are not submitted to CKB.
          </p>
        </div>
      </aside>

      <div className="demo-developer-layout">
        <section className="demo-code-section" aria-labelledby="demo-code-title">
          <div className="demo-section-heading">
            <Code2 className="demo-section-icon" aria-hidden="true" />
            <div className="demo-section-heading-copy">
              <h2 id="demo-code-title" className="demo-section-title">
                Integrate privacy
              </h2>
              <p className="demo-section-description">The source-level PrivacyClient built around injected CCC primitives.</p>
            </div>
          </div>

          <figure className="demo-code-editor">
            <figcaption className="demo-code-caption">
              <span className="demo-code-filename">privacy.ts</span>
              <span className="demo-code-status">Foundation API</span>
            </figcaption>
            <pre className="demo-code-block" tabIndex={0} aria-label="PrivacyClient foundation integration example">
              <code className="demo-code-content">{SDK_API}</code>
            </pre>
          </figure>
        </section>

        <section className="demo-responsibility-section" aria-labelledby="demo-responsibility-title">
          <div className="demo-section-heading">
            <Layers className="demo-section-icon" aria-hidden="true" />
            <div className="demo-section-heading-copy">
              <h2 id="demo-responsibility-title" className="demo-section-title">
                Responsibility split
              </h2>
              <p className="demo-section-description">Obscell extends CCC. It does not replace it.</p>
            </div>
          </div>

          <div className="demo-responsibility-columns">
            <article className="demo-responsibility-column">
              <div className="demo-responsibility-heading">
                <Wallet className="demo-responsibility-icon" aria-hidden="true" />
                <h3 className="demo-responsibility-title">Your application keeps using CCC</h3>
              </div>
              <ul className="demo-responsibility-list">
                <li className="demo-responsibility-item">Wallet connection and connectors</li>
                <li className="demo-responsibility-item">Signer approval</li>
                <li className="demo-responsibility-item">RPC and indexer access</li>
                <li className="demo-responsibility-item">Canonical CKB transaction primitives</li>
              </ul>
            </article>

            <article className="demo-responsibility-column">
              <div className="demo-responsibility-heading">
                <ShieldCheck className="demo-responsibility-icon" aria-hidden="true" />
                <h3 className="demo-responsibility-title">Obscell adds privacy capabilities</h3>
              </div>
              <ul className="demo-responsibility-list">
                <li className="demo-responsibility-item">Private local state</li>
                <li className="demo-responsibility-item">Shield and unshield operation planning</li>
                <li className="demo-responsibility-item">Proof generation for the target protocol</li>
                <li className="demo-responsibility-item">Privacy-aware CCC transaction construction</li>
              </ul>
            </article>
          </div>
        </section>
      </div>

      <section className="demo-capability-section" aria-labelledby="demo-capability-title">
        <div className="demo-section-heading">
          <KeyRound className="demo-section-icon" aria-hidden="true" />
          <div className="demo-section-heading-copy">
            <h2 id="demo-capability-title" className="demo-section-title">
              Future PrivacyClient capabilities
            </h2>
            <p className="demo-section-description">Capability discovery keeps unsupported behavior explicit.</p>
          </div>
        </div>
        <dl className="demo-capability-grid">
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Shield fixed notes</dt>
            <dd className="demo-capability-value">Target protocol V1</dd>
          </div>
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Private balance</dt>
            <dd className="demo-capability-value">Intended fixed-note abstraction</dd>
          </div>
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Unshield to recipient</dt>
            <dd className="demo-capability-value">Target protocol V1</dd>
          </div>
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Private payment</dt>
            <dd className="demo-capability-value">Future concept, outside V1</dd>
          </div>
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Arbitrary denominations</dt>
            <dd className="demo-capability-value">Not supported by V1</dd>
          </div>
          <div className="demo-capability-item">
            <dt className="demo-capability-name">Private transfers</dt>
            <dd className="demo-capability-value">Not supported by V1</dd>
          </div>
        </dl>
      </section>

      <section className="demo-architecture-section" aria-labelledby="demo-architecture-title">
        <div className="demo-section-heading">
          <Network className="demo-section-icon" aria-hidden="true" />
          <div className="demo-section-heading-copy">
            <h2 id="demo-architecture-title" className="demo-section-title">
              Integration architecture
            </h2>
            <p className="demo-section-description">
              The module accepts CCC dependencies and returns CCC-compatible transaction plans.
            </p>
          </div>
        </div>

        <ol className="demo-architecture-flow" aria-label="Application to CKB architecture">
          {architecture.map((step, index) => {
            const Icon = step.icon;
            return (
              <li className="demo-architecture-entry" key={step.label}>
                <div className="demo-architecture-node">
                  <Icon className="demo-architecture-icon" aria-hidden="true" />
                  <div className="demo-architecture-copy">
                    <strong className="demo-architecture-label">{step.label}</strong>
                    <span className="demo-architecture-detail">{step.detail}</span>
                  </div>
                  {index === 1 && (
                    <span className="demo-architecture-foundation">
                      <CheckCircle2 className="demo-architecture-foundation-icon" aria-hidden="true" />
                      CCC foundation
                    </span>
                  )}
                </div>
                {index < architecture.length - 1 && (
                  <ArrowDown className="demo-architecture-arrow" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
