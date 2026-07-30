"use client"; // Error-boundaries moeten client components zijn.

// Vangnet voor fouten in de root-layout zelf (die de (app)/error.tsx-boundary
// niet kan opvangen). Moet eigen <html>/<body> meebrengen.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.1rem", marginBottom: ".5rem" }}>Er ging iets mis</h1>
          <p style={{ fontSize: ".85rem", color: "#666", marginBottom: "1.25rem" }}>
            De pagina kon niet worden geladen. Probeer het opnieuw.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              padding: ".5rem 1rem",
              borderRadius: ".375rem",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  );
}
