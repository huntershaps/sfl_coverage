"use client";

/**
 * Last-resort boundary: the root layout failed, so no app styles are available.
 * Everything here is inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#07070c",
          color: "#f6f4f1",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>The app failed to load</h1>
          <p style={{ fontSize: 14, color: "#7c7995", lineHeight: 1.6, margin: 0 }}>
            Something went wrong before the page could render. Reloading usually
            clears it.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#454563", marginTop: 10 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 22,
              background: "#ff6b4a",
              color: "#07070c",
              border: 0,
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
