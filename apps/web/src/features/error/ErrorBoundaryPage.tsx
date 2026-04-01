import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom";

export function ErrorBoundaryPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Erreur inattendue";
  let message = "Quelque chose s'est mal passé. Veuillez réessayer.";

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
