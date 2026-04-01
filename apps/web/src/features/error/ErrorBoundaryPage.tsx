import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom";

export function ErrorBoundaryPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  // Log temporaire pour diagnostic
  console.error("[KS ErrorBoundary] error:", error);

  let title = "Erreur inattendue";
  let message = "Quelque chose s'est mal passé. Veuillez réessayer.";

  // Extraire le message réel pour affichage debug
  let debugInfo: string | null = null;
  if (error instanceof Error) {
    debugInfo = `${error.name}: ${error.message}`;
  } else if (typeof error === "string") {
    debugInfo = error;
  } else if (error && typeof error === "object" && "message" in error) {
    debugInfo = String((error as { message: unknown }).message);
  }

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "404 — Page introuvable";
      message = "Cette page n'existe pas ou a été déplacée.";
    } else {
      title = `Erreur ${error.status}`;
      message = error.statusText || message;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "3rem", margin: 0, color: "var(--color-primary, #6f58ff)" }}>{title}</h1>
      <p style={{ fontSize: "1.15rem", color: "var(--color-text-secondary, #b0a8d0)", marginTop: "0.5rem" }}>
        {message}
      </p>
      {debugInfo && (
        <pre style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "rgba(255,0,0,0.1)", borderRadius: "8px", fontSize: "0.75rem", color: "#ff8080", maxWidth: "90vw", overflowX: "auto", textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {debugInfo}
        </pre>
      )}
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-btn"
          style={{ padding: "0.6rem 1.5rem", cursor: "pointer" }}
        >
          ← Retour
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="glass-btn glass-btn--primary"
          style={{ padding: "0.6rem 1.5rem", cursor: "pointer" }}
        >
          Accueil
        </button>
      </div>
    </div>
  );
}
