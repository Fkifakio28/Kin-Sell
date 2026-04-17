import { useEffect, useRef, useCallback, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = "0x4AAAAAACy1uMSKZD3USTWV";
const SCRIPT_LOAD_TIMEOUT_MS = 30_000; // 30s — réseau lent Afrique
const TOKEN_EXPIRY_MS = 280_000; // ~4m40 (tokens expirent après 5 min)
const POLL_INTERVAL_MS = 500;
const MAX_RETRIES = 3;

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
};

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (expiryTimer.current) { clearTimeout(expiryTimer.current); expiryTimer.current = null; }
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      widgetIdRef.current = null;
    }
  }, []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !mountedRef.current) return;

    cleanup();
    setStatus("ready");
    setErrorMsg("");

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => {
          if (!mountedRef.current) return;
          onToken(token);
          setStatus("ready");
          if (expiryTimer.current) clearTimeout(expiryTimer.current);
          expiryTimer.current = setTimeout(() => {
            if (!mountedRef.current) return;
            onToken("");
            setStatus("expired");
          }, TOKEN_EXPIRY_MS);
        },
        "error-callback": (errorCode: string) => {
          if (!mountedRef.current) return;
          console.warn("[Turnstile] error:", errorCode);
          onToken("");
          setStatus("error");
          setErrorMsg("Erreur de vérification — appuyez pour réessayer");
        },
        "expired-callback": () => {
          if (!mountedRef.current) return;
          onToken("");
          setStatus("expired");
        },
        theme: "dark",
        size: "flexible",
        retry: "auto",
        "retry-interval": 2000,
      });
    } catch (err) {
      console.error("[Turnstile] render failed:", err);
      setStatus("error");
      setErrorMsg("Impossible de charger la vérification");
      onToken("");
    }
  }, [onToken, cleanup]);

  /** Recharge le script Turnstile depuis le CDN si absent */
  const reloadScript = useCallback(() => {
    // Supprimer l'ancien script s'il existe
    const old = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (old) old.remove();
    // Réinitialiser l'objet global
    (window as unknown as Record<string, unknown>).turnstile = undefined;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
    setStatus("loading");
    setErrorMsg("");
    onToken("");

    if (window.turnstile) {
      renderWidget();
    } else {
      reloadScript();
    }
  }, [renderWidget, reloadScript, onToken]);

  // Polling pour attendre le chargement du script Turnstile
  useEffect(() => {
    mountedRef.current = true;
    let interval: ReturnType<typeof setInterval> | undefined;

    if (window.turnstile) {
      renderWidget();
    } else {
      setStatus("loading");
      const start = Date.now();
      interval = setInterval(() => {
        if (!mountedRef.current) { clearInterval(interval); return; }
        if (window.turnstile) {
          clearInterval(interval);
          interval = undefined;
          renderWidget();
        } else if (Date.now() - start > SCRIPT_LOAD_TIMEOUT_MS) {
          clearInterval(interval);
          interval = undefined;
          if (retryCount < MAX_RETRIES) {
            // Auto-retry : recharge le script
            setRetryCount((c) => c + 1);
            reloadScript();
            // Relancer le polling
            const start2 = Date.now();
            interval = setInterval(() => {
              if (!mountedRef.current) { clearInterval(interval); return; }
              if (window.turnstile) {
                clearInterval(interval);
                interval = undefined;
                renderWidget();
              } else if (Date.now() - start2 > SCRIPT_LOAD_TIMEOUT_MS) {
                clearInterval(interval);
                interval = undefined;
                setStatus("error");
                setErrorMsg("CAPTCHA indisponible — vérifiez votre connexion internet ou désactivez votre bloqueur de publicités, puis appuyez ici pour réessayer");
              }
            }, POLL_INTERVAL_MS);
          } else {
            setStatus("error");
            setErrorMsg("CAPTCHA indisponible — vérifiez votre connexion internet ou désactivez votre bloqueur de publicités, puis appuyez ici pour réessayer");
          }
        }
      }, POLL_INTERVAL_MS);
    }

    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  if (status === "loading") {
    return (
      <div style={{
        marginTop: 8, marginBottom: 8, padding: "12px 14px",
        background: "rgba(111,88,255,0.08)", border: "1px solid rgba(111,88,255,0.2)",
        borderRadius: 8, color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", textAlign: "center",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
      }}>
        <span style={{
          display: "inline-block", width: 14, height: 14,
          border: "2px solid rgba(111,88,255,0.3)", borderTopColor: "#6f58ff",
          borderRadius: "50%", animation: "spin 0.8s linear infinite"
        }} />
        Chargement de la vérification…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{
        marginTop: 8, marginBottom: 8, padding: "12px 14px",
        background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.3)",
        borderRadius: 8, color: "#ff8080", fontSize: "0.82rem", textAlign: "center",
        cursor: "pointer"
      }} onClick={handleRetry}>
        ⚠️ {errorMsg || "Erreur CAPTCHA — appuyez pour réessayer"}
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div style={{
        marginTop: 8, marginBottom: 8, padding: "12px 14px",
        background: "rgba(255,180,50,0.12)", border: "1px solid rgba(255,180,50,0.3)",
        borderRadius: 8, color: "#ffb432", fontSize: "0.82rem", textAlign: "center",
        cursor: "pointer"
      }} onClick={handleRetry}>
        ⏳ Vérification expirée — appuyez pour relancer
      </div>
    );
  }

  return <div ref={containerRef} style={{ marginTop: 8, marginBottom: 8 }} />;
}
