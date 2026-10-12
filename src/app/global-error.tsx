"use client";

/** Laatste vangnet als zelfs de opmaak niet laadt. Eigen html en body, geen afhankelijkheden. */
export default function GlobaleFout({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f8fa", color: "#1b2230", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Saldoplan is even niet bereikbaar</h1>
          <p style={{ color: "#4a5263", lineHeight: 1.5 }}>Er is niets verloren gegaan. Probeer het over een minuut opnieuw.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 20, padding: "12px 22px", borderRadius: 999, border: 0, background: "#0a7ea3", color: "#fff", fontSize: 16, cursor: "pointer" }}>Opnieuw proberen</button>
        </div>
      </body>
    </html>
  );
}
