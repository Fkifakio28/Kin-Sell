import React from "react";
import { isChunkLoadError } from "../shared/chunk-load-error";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Les erreurs de chargement dynamique (chunk/lazy) sont presque toujours
    // dues au réseau ou à un déploiement qui a invalidé les hashes de chunks.
    // On évite de spammer le backend avec ces cas attendus.
    if (isChunkLoadError(error)) return;

    // Report to backend error logging endpoint
    reportError({
      type: "react-error-boundary",
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack || undefined,
      url: window.location.href,
      timestamp: Date.now(),
    });
  }

  render() {
    if (this.state.hasError) {
      // Cas spécifique : chunk/lazy import qui n'a pas pu se charger.
      // Message simple, pas de stack trace, bouton de rechargement.
      if (isChunkLoadError(this.state.error)) {
        return (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "60vh", padding: "2rem", textAlign: "center", color: "var(--color-text, #fff)",
          }}>
            <h2 style={{ marginBottom: "1rem" }}>Chargement interrompu</h2>
            <p style={{ opacity: 0.7, marginBottom: "1.5rem", maxWidth: "32rem" }}>
              La page n'a pas pu être chargée. Vérifiez votre connexion puis réessayez.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "0.75rem 2rem", borderRadius: "12px",
                background: "var(--color-primary, #6f58ff)", color: "#fff",
                border: "none", cursor: "pointer", fontSize: "1rem",
              }}
            >
              Réessayer
            </button>
          </div>
        );
      }

      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: "60vh", padding: "2rem", textAlign: "center", color: "var(--color-text, #fff)",
        }}>
          <h2 style={{ marginBottom: "1rem" }}>Oops, une erreur est survenue</h2>
          <p style={{ opacity: 0.7, marginBottom: "1.5rem" }}>
            L'application a rencontré un problème. Essayez de rafraîchir la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.75rem 2rem", borderRadius: "12px",
              background: "var(--color-primary, #6f58ff)", color: "#fff",
              border: "none", cursor: "pointer", fontSize: "1rem",
            }}
          >
            Rafraîchir
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// ── Global error reporter ──

const ERROR_ENDPOINT = (import.meta.env.VITE_API_URL ?? "/api") + "/errors";
const _reportedErrors = new Set<string>();

interface ErrorReport {
  type: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  timestamp: number;
  userAgent?: string;
}

function reportError(report: ErrorReport): void {
  // Deduplicate by message (don't spam backend)
  const key = `${report.type}:${report.message}`;
  if (_reportedErrors.has(key)) return;
  _reportedErrors.add(key);
  // Cap dedup set
  if (_reportedErrors.size > 100) _reportedErrors.clear();

  report.userAgent = navigator.userAgent;

  // Fire-and-forget POST
  fetch(ERROR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  }).catch(() => { /* silent */ });
}

// ── Global JS error handlers ──

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // Erreurs de chargement de modules dynamiques / chunks : ne pas spammer le backend
    // et empêcher l'affichage brut de l'erreur par le navigateur quand possible.
    // Le rendu propre (page "Réessayer") est pris en charge par les ErrorBoundary React.
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      event.preventDefault();
      return;
    }
    reportError({
      type: "window-error",
      message: event.message || "Unknown error",
      stack: event.error?.stack,
      url: window.location.href,
      timestamp: Date.now(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    // Ne pas spammer le backend pour les erreurs de chunks (chargement lazy interrompu).
    if (isChunkLoadError(reason)) {
      event.preventDefault();
      return;
    }
    reportError({
      type: "unhandled-rejection",
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack,
      url: window.location.href,
      timestamp: Date.now(),
    });
  });
}
