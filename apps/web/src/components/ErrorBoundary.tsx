import React from "react";

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
    reportError({
      type: "unhandled-rejection",
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack,
      url: window.location.href,
      timestamp: Date.now(),
    });
  });
}
