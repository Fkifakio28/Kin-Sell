import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom";
import "./error.css";

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
    <div className="err-page">
      <h1 className="err-title err-title--sm">{title}</h1>
      <p className="err-message">
        {message}
      </p>
      {debugInfo && (
        <pre className="err-debug">
          {debugInfo}
        </pre>
      )}
      <div className="err-actions">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-btn err-btn"
        >
          ← Retour
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="glass-btn glass-btn--primary err-btn"
        >
          Accueil
        </button>
      </div>
    </div>
  );
}
