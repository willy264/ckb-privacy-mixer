import { ArrowDownToLine, EyeOff, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, type FormEvent } from "react";

export type DemoDialogAction = "shield" | "payment" | "unshield";

const DIALOG_COPY: Record<
  DemoDialogAction,
  { eyebrow: string; title: string; description: string; button: string }
> = {
  shield: {
    eyebrow: "Protocol simulation",
    title: "Shield assets",
    description:
      "Model one fixed CT note entering the target privacy pool. No transaction will be signed or submitted.",
    button: "Run shield simulation",
  },
  payment: {
    eyebrow: "Future capability simulation",
    title: "Send privately",
    description:
      "Preview an unshield-to-recipient flow. Private-to-private transfers are outside protocol-correct V1.",
    button: "Prepare payment concept",
  },
  unshield: {
    eyebrow: "Protocol simulation",
    title: "Unshield assets",
    description:
      "Model note consumption and a recipient-bound CT output. No transaction will be signed or submitted.",
    button: "Run unshield simulation",
  },
};

export function ActionDialog({
  action,
  recipient,
  recipientBusy,
  recipientError,
  onRecipientChange,
  onClose,
  onConfirm,
}: {
  action: DemoDialogAction;
  recipient: string;
  recipientBusy: boolean;
  recipientError: string | null;
  onRecipientChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const copy = DIALOG_COPY[action];
  const requestClose = useCallback(() => {
    if (!recipientBusy) onClose();
  }, [onClose, recipientBusy]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    (action === "payment" ? recipientInputRef.current : closeButtonRef.current)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [action, requestClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };

  const ActionIcon =
    action === "shield" ? EyeOff : action === "payment" ? Send : ArrowDownToLine;

  return (
    <div className="demo-dialog-backdrop" role="presentation" onMouseDown={requestClose}>
      <section
        ref={dialogRef}
        className="demo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="demo-dialog-header">
          <div>
            <span className="demo-eyebrow">{copy.eyebrow}</span>
            <h2 id="demo-dialog-title">{copy.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="demo-icon-button"
            type="button"
            onClick={requestClose}
            disabled={recipientBusy}
            aria-label="Close dialog"
            title="Close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit}>
          <p className="demo-dialog-description">{copy.description}</p>

          <div className="demo-dialog-amount">
            <span>Amount</span>
            <strong>100 CT</strong>
            <small>Fixed protocol-correct V1 denomination</small>
          </div>

          {action === "payment" ? (
            <label className="demo-field">
              <span>Recipient CKB address</span>
              <input
                ref={recipientInputRef}
                value={recipient}
                onChange={(event) => onRecipientChange(event.target.value)}
                placeholder="Enter a recipient address"
                autoComplete="off"
                required
                aria-invalid={Boolean(recipientError)}
                aria-describedby="demo-recipient-help"
              />
              <small
                id="demo-recipient-help"
                className={recipientError ? "demo-field-error" : undefined}
                role={recipientError ? "alert" : undefined}
              >
                {recipientError ?? "Validated with CCC, then used only in this local simulation."}
              </small>
            </label>
          ) : (
            <div className="demo-dialog-route">
              <span>{action === "shield" ? "Destination" : "Recipient"}</span>
              <strong>
                {action === "shield" ? "Private balance" : "Connected public account"}
              </strong>
            </div>
          )}

          <div className="demo-dialog-actions">
            <button
              className="demo-button demo-button--quiet"
              type="button"
              onClick={requestClose}
              disabled={recipientBusy}
            >
              Cancel
            </button>
            <button
              className="demo-button demo-button--primary"
              type="submit"
              disabled={recipientBusy || (action === "payment" && !recipient.trim())}
            >
              <ActionIcon aria-hidden="true" />
              {recipientBusy ? "Validating address..." : copy.button}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
