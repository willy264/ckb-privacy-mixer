export default function LegacyAppNotice() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#090b12",
        color: "#e6edf7",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: "42rem",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "1rem",
          padding: "2rem",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Legacy App Retired</h1>
        <p>
          The root Vite app is no longer the supported UI for this repository.
          Use the workspace frontend in <code>frontend/</code> instead.
        </p>
        <p style={{ marginBottom: 0 }}>
          Run <code>pnpm dev</code> or <code>pnpm --filter frontend dev</code> from the repo root.
        </p>
      </section>
    </main>
  );
}
