import { lazy, Suspense } from "react";

import { PrivacyDemo } from "./demo/PrivacyDemo";

const LegacyMixerApp = lazy(() => import("./legacy/LegacyMixerApp"));

export default function App() {
  const showLegacyMixer =
    new URLSearchParams(window.location.search).get("view") === "legacy";

  if (!showLegacyMixer) return <PrivacyDemo />;

  return (
    <div className="legacy-prototype-shell">
      <aside className="legacy-prototype-banner" role="status">
        <span>
          <strong>Legacy mixer prototype.</strong> Generated activity evidence has been removed. This
          screen does not represent the protocol-correct V1 or a production privacy guarantee.
        </span>
        <a href="/">Open the CCC privacy-module demo</a>
      </aside>
      <Suspense fallback={<div className="legacy-loading">Loading legacy prototype...</div>}>
        <LegacyMixerApp />
      </Suspense>
    </div>
  );
}
