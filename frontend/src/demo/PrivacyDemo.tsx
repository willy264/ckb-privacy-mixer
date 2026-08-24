import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowRight,
  Braces,
  Check,
  ExternalLink,
  EyeOff,
  Landmark,
  Layers,
  Lock,
  Network,
  Plug,
  RefreshCcw,
  Send,
  ShieldCheck,
  Smartphone,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { createDemoPrivacyClient, type DemoPrivacyClient } from "./client/DemoPrivacyClient";
import { ActionDialog, type DemoDialogAction } from "./components/ActionDialog";
import { OperationPipeline } from "./components/OperationPipeline";
import {
  DEFAULT_DEMO_POOL_ID,
  type DemoPrivacySnapshot,
  type PrivacyConsumerId,
  type PrivacyOperation,
} from "./types";
import { DeveloperView } from "./views/DeveloperView";
import { ProtocolView } from "./views/ProtocolView";
import "./demo.css";

type DemoView = "application" | "developer" | "protocol";
type Connection =
  | { status: "demo" }
  | { status: "connecting" }
  | { status: "live"; address: string }
  | { status: "error"; message: string };
type Notice = { tone: "success" | "error" | "info"; message: string };

const VIEW_ITEMS: readonly { id: DemoView; label: string; icon: LucideIcon }[] = [
  { id: "application", label: "Application", icon: Smartphone },
  { id: "developer", label: "Developer", icon: Braces },
  { id: "protocol", label: "Protocol", icon: Network },
];

const CONSUMERS: Record<
  PrivacyConsumerId,
  { shortLabel: string; title: string; eyebrow: string; icon: LucideIcon; description: string }
> = {
  "reference-wallet": {
    shortLabel: "Reference Wallet",
    title: "Obscell Privacy Reference Wallet",
    eyebrow: "Reference implementation - Prototype",
    icon: WalletCards,
    description: "One application consuming the same CCC-compatible privacy interface.",
  },
  "payment-app": {
    shortLabel: "Payment App",
    title: "CKB Payment App",
    eyebrow: "Second CCC application - Example consumer",
    icon: Landmark,
    description: "A separate payment experience reusing the shared private state abstraction.",
  },
};

function shortAddress(address: string) {
  if (address.length <= 22) return address;
  return `${address.slice(0, 11)}...${address.slice(-8)}`;
}

function latestOperation(snapshot: DemoPrivacySnapshot): PrivacyOperation | undefined {
  if (snapshot.activeOperationId) {
    return snapshot.operations.find((operation) => operation.id === snapshot.activeOperationId);
  }
  return snapshot.operations[snapshot.operations.length - 1];
}

function DemoHeader({
  connection,
  onConnect,
  onUseDemo,
}: {
  connection: Connection;
  onConnect: () => void;
  onUseDemo: () => void;
}) {
  const isLive = connection.status === "live";
  return (
    <header className="demo-header">
      <div className="demo-header-inner">
        <a className="demo-brand" href="/" aria-label="Obscell Privacy demo home">
          <img src="/logo.png" alt="" />
          <span>
            <strong>Obscell Privacy</strong>
            <small>CCC module preview</small>
          </span>
        </a>

        <div className="demo-header-status">
          <span className="demo-status-chip demo-status-chip--simulation">
            Interactive concept - privacy simulated
          </span>
          {isLive ? (
            <button
              className="demo-connection-button is-live"
              type="button"
              onClick={onUseDemo}
              title="Return to the local CCC fixture"
            >
              <span className="demo-live-dot" aria-hidden="true" />
              <span>
                <strong>JoyID connected through CCC</strong>
                <small>{shortAddress(connection.address)}</small>
              </span>
              <X aria-hidden="true" />
            </button>
          ) : (
            <button
              className="demo-connection-button"
              type="button"
              onClick={onConnect}
              disabled={connection.status === "connecting"}
              title="Connect a live JoyID wallet through CCC"
            >
              <Plug aria-hidden="true" />
              <span>
                <strong>
                  {connection.status === "connecting" ? "Opening JoyID..." : "Connect live CCC wallet"}
                </strong>
                <small>Current session: local CCC fixture</small>
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AudienceTabs({ view, onChange }: { view: DemoView; onChange: (view: DemoView) => void }) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % VIEW_ITEMS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + VIEW_ITEMS.length) % VIEW_ITEMS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = VIEW_ITEMS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextView = VIEW_ITEMS[nextIndex].id;
    onChange(nextView);
    requestAnimationFrame(() => document.getElementById(`demo-${nextView}-tab`)?.focus());
  };

  return (
    <nav className="demo-audience-tabs" aria-label="Demo audience view">
      <div role="tablist" aria-label="Application, developer, and protocol views">
        {VIEW_ITEMS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`demo-${id}-tab`}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls={`demo-${id}-panel`}
            tabIndex={view === id ? 0 : -1}
            className={view === id ? "is-active" : ""}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <Icon aria-hidden="true" />
            {label} View
          </button>
        ))}
      </div>
    </nav>
  );
}

function BalanceBand({ snapshot, privacyEnabled }: { snapshot: DemoPrivacySnapshot; privacyEnabled: boolean }) {
  return (
    <section className="demo-balance-band" aria-label="CT balances">
      <div className="demo-balance-item">
        <span>Public balance</span>
        <strong>{snapshot.publicBalance.toString()} <small>CT</small></strong>
        <p>CCC application state</p>
      </div>
      <div className="demo-balance-divider" aria-hidden="true">
        <ArrowRight />
      </div>
      <div className={`demo-balance-item demo-balance-item--private${privacyEnabled ? " is-visible" : ""}`}>
        <span>Private balance</span>
        <strong>
          {privacyEnabled ? snapshot.privateBalance.toString() : "--"} <small>CT</small>
        </strong>
        <p>
          {privacyEnabled
            ? `${snapshot.notes.filter((note) => note.status === "available").length} available fixed note`
            : "Available after opt-in"}
        </p>
      </div>
    </section>
  );
}

function AssetJourney({ snapshot }: { snapshot: DemoPrivacySnapshot }) {
  const hasPrivateAsset = snapshot.privateBalance > 0n;
  return (
    <section className="demo-asset-journey" aria-labelledby="asset-journey-title">
      <div className="demo-section-heading">
        <div>
          <span className="demo-eyebrow">Opt-in asset route</span>
          <h2 id="asset-journey-title">CCC stays underneath the privacy capability</h2>
        </div>
        <span className="demo-mini-label">100 CT fixed note</span>
      </div>
      <div className="demo-journey-track">
        <div className={!hasPrivateAsset ? "is-current" : ""}>
          <Landmark aria-hidden="true" />
          <span>Public</span>
          <strong>{snapshot.publicBalance.toString()} CT</strong>
        </div>
        <span className="demo-journey-arrow">
          <ArrowRight aria-hidden="true" />
          <small>shield</small>
        </span>
        <motion.div
          className="demo-journey-privacy"
          animate={{ y: hasPrivateAsset ? -3 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <Layers aria-hidden="true" />
          <span>Obscell</span>
          <strong>Privacy layer</strong>
        </motion.div>
        <span className="demo-journey-arrow">
          <ArrowRight aria-hidden="true" />
          <small>state</small>
        </span>
        <div className={hasPrivateAsset ? "is-current is-private" : ""}>
          <Lock aria-hidden="true" />
          <span>Private</span>
          <strong>{snapshot.privateBalance.toString()} CT</strong>
        </div>
      </div>
    </section>
  );
}

function ApplicationView({
  consumer,
  onConsumerChange,
  privacyEnabled,
  privacyEnabling,
  onPrivacyModeChange,
  snapshot,
  operation,
  onOpenAction,
}: {
  consumer: PrivacyConsumerId;
  onConsumerChange: (consumer: PrivacyConsumerId) => void;
  privacyEnabled: boolean;
  privacyEnabling: boolean;
  onPrivacyModeChange: (enabled: boolean) => void;
  snapshot: DemoPrivacySnapshot;
  operation?: PrivacyOperation;
  onOpenAction: (action: DemoDialogAction) => void;
}) {
  const app = CONSUMERS[consumer];
  const AppIcon = app.icon;
  const availableNote = snapshot.notes.some((note) => note.status === "available");
  const busy = Boolean(snapshot.activeOperationId) || privacyEnabling;

  return (
    <div className="demo-application-layout">
      <section className="demo-app-frame" aria-labelledby="consumer-app-title">
        <header className="demo-app-toolbar">
          <div className="demo-app-identity">
            <span className="demo-app-icon"><AppIcon aria-hidden="true" /></span>
            <div>
              <span className="demo-eyebrow">{app.eyebrow}</span>
              <h1 id="consumer-app-title">{app.title}</h1>
              <p>{app.description}</p>
            </div>
          </div>
          <div className="demo-consumer-switch" role="group" aria-label="Example application">
            {(Object.keys(CONSUMERS) as PrivacyConsumerId[]).map((id) => (
              <button
                type="button"
                key={id}
                className={consumer === id ? "is-active" : ""}
                aria-pressed={consumer === id}
                onClick={() => onConsumerChange(id)}
              >
                {CONSUMERS[id].shortLabel}
              </button>
            ))}
          </div>
        </header>

        <div className="demo-mode-band">
          <div>
            <span className="demo-eyebrow">Application mode</span>
            <strong>{privacyEnabled ? "Obscell privacy enabled" : "Standard CCC application"}</strong>
          </div>
          <div className="demo-mode-control" role="group" aria-label="Application privacy mode">
            <button
              type="button"
              className={!privacyEnabled ? "is-active" : ""}
              aria-pressed={!privacyEnabled}
              onClick={() => onPrivacyModeChange(false)}
              disabled={busy}
            >
              <Landmark aria-hidden="true" /> Public
            </button>
            <button
              type="button"
              className={privacyEnabled ? "is-active is-private" : ""}
              aria-pressed={privacyEnabled}
              onClick={() => onPrivacyModeChange(true)}
              disabled={busy}
            >
              <EyeOff aria-hidden="true" />
              {privacyEnabling ? "Enabling..." : "Private"}
            </button>
          </div>
        </div>

        <BalanceBand snapshot={snapshot} privacyEnabled={privacyEnabled} />

        <div className="demo-action-band">
          <div>
            <span className="demo-eyebrow">Privacy operations</span>
            <p>
              {privacyEnabled
                ? "Future SDK operations are available through the existing CCC session."
                : "Enable Private mode to add the Obscell capability to this application."}
            </p>
          </div>
          <div className="demo-action-buttons">
            {!privacyEnabled ? (
              <button
                className="demo-button demo-button--primary"
                type="button"
                onClick={() => onPrivacyModeChange(true)}
                disabled={busy}
              >
                <ShieldCheck aria-hidden="true" /> Enable privacy
              </button>
            ) : (
              <>
                <button
                  className="demo-button demo-button--primary"
                  type="button"
                  onClick={() => onOpenAction("shield")}
                  disabled={busy || snapshot.publicBalance < 100n}
                >
                  <EyeOff aria-hidden="true" /> Shield assets
                </button>
                <button
                  className="demo-button demo-button--privacy"
                  type="button"
                  onClick={() => onOpenAction("payment")}
                  disabled={busy || !availableNote}
                >
                  <Send aria-hidden="true" /> Send privately
                </button>
                <button
                  className="demo-button demo-button--quiet"
                  type="button"
                  onClick={() => onOpenAction("unshield")}
                  disabled={busy || !availableNote}
                >
                  <ArrowDownToLine aria-hidden="true" /> Unshield
                </button>
              </>
            )}
          </div>
        </div>

        <AssetJourney snapshot={snapshot} />
      </section>

      <aside className="demo-pipeline-rail">
        <OperationPipeline operation={operation} />
      </aside>
    </div>
  );
}

export function PrivacyDemo() {
  const clientRef = useRef<DemoPrivacyClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = createDemoPrivacyClient({ transitionDelayMs: 230 });
  }
  const client = clientRef.current;
  const [snapshot, setSnapshot] = useState<DemoPrivacySnapshot>(() => client.getSnapshot());
  const [view, setView] = useState<DemoView>("application");
  const [consumer, setConsumer] = useState<PrivacyConsumerId>("reference-wallet");
  const [privacyEnabled, setPrivacyEnabled] = useState(false);
  const [privacyEnabling, setPrivacyEnabling] = useState(false);
  const [connection, setConnection] = useState<Connection>({ status: "demo" });
  const [dialog, setDialog] = useState<DemoDialogAction | null>(null);
  const [recipient, setRecipient] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [recipientValidating, setRecipientValidating] = useState(false);
  const [notice, setNotice] = useState<Notice>({
    tone: "info",
    message: "Local CCC fixture ready. Privacy operations are protocol simulations.",
  });

  useEffect(() => client.subscribe(setSnapshot), [client]);

  const operation = useMemo(() => latestOperation(snapshot), [snapshot]);
  const closeDialog = useCallback(() => {
    setDialog(null);
    setRecipientError(null);
    setRecipientValidating(false);
  }, []);

  const openDialog = (action: DemoDialogAction) => {
    setRecipientError(null);
    setDialog(action);
  };

  const connectLive = async () => {
    setConnection({ status: "connecting" });
    setNotice({ tone: "info", message: "Opening JoyID through the existing CCC signer..." });
    try {
      const { connectJoyIdWallet } = await import("../joyid");
      const address = await connectJoyIdWallet();
      setConnection({ status: "live", address });
      setNotice({
        tone: "success",
        message: "Live JoyID connection established through CCC. Privacy actions remain simulated.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "JoyID connection was not completed.";
      setConnection({ status: "error", message });
      setNotice({ tone: "error", message: `${message} The local CCC fixture remains available.` });
    }
  };

  const useDemoConnection = () => {
    if (connection.status === "live") {
      void import("../joyid").then(({ disconnectJoyIdWallet }) => disconnectJoyIdWallet());
    }
    setConnection({ status: "demo" });
    setNotice({
      tone: "info",
      message: "Using the local CCC fixture. No wallet or chain transaction is involved.",
    });
  };

  const changePrivacyMode = async (enabled: boolean) => {
    if (!enabled) {
      setPrivacyEnabled(false);
      setNotice({
        tone: "info",
        message: "Public mode restored. The simulated private note state is preserved locally.",
      });
      return;
    }
    setPrivacyEnabling(true);
    try {
      await client.sync({ poolId: DEFAULT_DEMO_POOL_ID });
      setPrivacyEnabled(true);
      setNotice({
        tone: "success",
        message: "Obscell capability enabled for this CCC application - local simulation.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The privacy state could not be prepared.",
      });
    } finally {
      setPrivacyEnabling(false);
    }
  };

  const runOperation = async (action: DemoDialogAction) => {
    if (action === "payment") {
      setRecipientValidating(true);
      try {
        const { validateCkbRecipientAddress } = await import("./validateRecipient");
        const validRecipient = await validateCkbRecipientAddress(recipient);
        if (!validRecipient) {
          setRecipientError("Enter a valid CKB address for the configured network.");
          return;
        }
      } catch {
        setRecipientError("CCC address validation is unavailable. Try again after reconnecting.");
        return;
      } finally {
        setRecipientValidating(false);
      }
    }
    setDialog(null);
    setNotice({ tone: "info", message: "Preparing local privacy operation..." });
    const note = snapshot.notes.find((candidate) => candidate.status === "available");
    try {
      if (action === "shield") {
        await client.shield({ poolId: DEFAULT_DEMO_POOL_ID, consumer });
        setNotice({
          tone: "success",
          message: "Shield simulation complete - balances changed locally; no transaction submitted.",
        });
        return;
      }
      if (!note) throw new Error("No available simulated private note was found.");
      if (action === "payment") {
        await client.unshield({
          poolId: DEFAULT_DEMO_POOL_ID,
          consumer,
          noteId: note.id,
          recipient,
          purpose: "recipient-payment",
        });
        setNotice({
          tone: "success",
          message: "Payment concept prepared to the signing boundary - no transaction submitted.",
        });
        return;
      }
      await client.unshield({
        poolId: DEFAULT_DEMO_POOL_ID,
        consumer,
        noteId: note.id,
        recipient: connection.status === "live" ? connection.address : "Local CCC fixture account",
        purpose: "return-public",
      });
      setNotice({
        tone: "success",
        message: "Unshield simulation complete - note consumed locally; no transaction submitted.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The simulated operation failed.",
      });
    }
  };

  const resetDemo = () => {
    client.reset();
    setPrivacyEnabled(false);
    setPrivacyEnabling(false);
    setConsumer("reference-wallet");
    setView("application");
    setDialog(null);
    setRecipient("");
    setRecipientError(null);
    setRecipientValidating(false);
    setNotice({ tone: "info", message: "Demo scenario reset. No chain state was changed." });
  };

  const availableNotes = snapshot.notes.filter((note) => note.status === "available").length;

  return (
    <div className="privacy-demo">
      <DemoHeader connection={connection} onConnect={connectLive} onUseDemo={useDemoConnection} />

      <main className="demo-main">
        <section className="demo-intro" aria-labelledby="demo-title">
          <div>
            <span className="demo-kicker">CKB application workbench</span>
            <h1 id="demo-title">Opt into privacy. Keep CCC.</h1>
            <p>
              Obscell is represented here as a privacy capability consumed by applications already
              using CCC for connectivity, signing, transactions, and chain access.
            </p>
          </div>
          <div className="demo-foundation-map" aria-label="CCC and Obscell relationship">
            <span><Check aria-hidden="true" /> CCC foundation</span>
            <ArrowRight aria-hidden="true" />
            <strong><Layers aria-hidden="true" /> Obscell capability</strong>
            <ArrowRight aria-hidden="true" />
            <span><ShieldCheck aria-hidden="true" /> CKB application</span>
          </div>
        </section>

        <AudienceTabs view={view} onChange={setView} />

        <div className={`demo-notice is-${notice.tone}`} role="status" aria-live="polite">
          <span>{notice.message}</span>
          <button
            className="demo-icon-button"
            type="button"
            onClick={() => setNotice({ tone: "info", message: "Privacy operations are simulated locally." })}
            aria-label="Dismiss status message"
            title="Dismiss"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            id={`demo-${view}-panel`}
            role="tabpanel"
            aria-labelledby={`demo-${view}-tab`}
            tabIndex={0}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            {view === "application" ? (
              <ApplicationView
                consumer={consumer}
                onConsumerChange={setConsumer}
                privacyEnabled={privacyEnabled}
                privacyEnabling={privacyEnabling}
                onPrivacyModeChange={changePrivacyMode}
                snapshot={snapshot}
                operation={operation}
                onOpenAction={openDialog}
              />
            ) : view === "developer" ? (
              <DeveloperView onOpenApplication={() => setView("application")} />
            ) : (
              <ProtocolView
                publicBalance={snapshot.publicBalance}
                privateBalance={snapshot.privateBalance}
                availableNotes={availableNotes}
                artifacts={snapshot.artifacts}
                operationKind={
                  operation?.purpose === "recipient-payment"
                    ? "recipient payment preview"
                    : operation?.kind
                }
                operationStatus={operation?.status}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <footer className="demo-footer">
          <p>
            <strong>Demo boundary:</strong> local deterministic state only. The protocol-correct V1
            must replace this client before privacy operations can be live.
          </p>
          <div>
            <a href="?view=legacy">
              Legacy mixer prototype <ExternalLink aria-hidden="true" />
            </a>
            <button className="demo-button demo-button--quiet" type="button" onClick={resetDemo}>
              <RefreshCcw aria-hidden="true" /> Reset demo
            </button>
          </div>
        </footer>
      </main>

      {dialog ? (
        <ActionDialog
          action={dialog}
          recipient={recipient}
          recipientBusy={recipientValidating}
          recipientError={recipientError}
          onRecipientChange={(value) => {
            setRecipient(value);
            setRecipientError(null);
          }}
          onClose={closeDialog}
          onConfirm={() => runOperation(dialog)}
        />
      ) : null}
    </div>
  );
}
