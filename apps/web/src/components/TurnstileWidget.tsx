import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAACy1uMSKZD3USTWV";
const SCRIPT_LOAD_TIMEOUT_MS = 45_000;
const TOKEN_EXPIRY_MS = 280_000;
const MAX_RETRIES = 4;
const BACKGROUND_RETRY_DELAY_MS = 8_000;
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_ID = "cf-turnstile-api-script";

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
};

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  return <TurnstileWidgetWeb onToken={onToken} />;
}

function TurnstileWidgetWeb({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error" | "expired">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const clearTimers = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (backgroundRetryTimerRef.current) {
      clearTimeout(backgroundRetryTimerRef.current);
      backgroundRetryTimerRef.current = null;
    }
  }, []);

  const cleanupWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // noop
      }
      widgetIdRef.current = null;
    }
  }, []);

  const cleanupAll = useCallback(() => {
    clearTimers();
    cleanupWidget();
  }, [clearTimers, cleanupWidget]);

  const mapErrorMessage = useCallback((errorCode?: string) => {
    if (!errorCode) return "CAPTCHA indisponible, appuyez pour reessayer";
    if (errorCode.startsWith("300") || errorCode.startsWith("600")) {
      return "Echec du controle anti-bot: desactivez VPN/proxy/extensions puis reessayez";
    }
    if (errorCode.startsWith("200")) {
      return "Probleme reseau ou horloge appareil, corrigez puis reessayez";
    }
    if (errorCode.startsWith("110") || errorCode.startsWith("400")) {
      return "Configuration Turnstile invalide, contactez le support";
    }
    return `Erreur Turnstile (${errorCode}), appuyez pour reessayer`;
  }, []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !mountedRef.current) return;

    cleanupWidget();
    setStatus("ready");
    setErrorMsg("");

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => {
          if (!mountedRef.current) return;
          onToken(token);
          setStatus("ready");

          if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
          expiryTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            onToken("");
            setStatus("expired");
          }, TOKEN_EXPIRY_MS);
        },
        "error-callback": (errorCode: string) => {
          if (!mountedRef.current) return true;
          console.warn("[Turnstile] error:", errorCode);
          onToken("");
          setStatus("error");
          setErrorMsg(mapErrorMessage(errorCode));
          return true;
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
      setErrorMsg("Impossible de charger la verification");
      onToken("");
    }
  }, [cleanupWidget, mapErrorMessage, onToken]);

  const ensureScriptLoaded = useCallback(async () => {
    if (window.turnstile) return;

    if (!scriptPromiseRef.current) {
      scriptPromiseRef.current = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
        if (existing && window.turnstile) {
          resolve();
          return;
        }

        const script = existing ?? document.createElement("script");
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";

        script.onload = () => resolve();
        script.onerror = () => reject(new Error("TURNSTILE_SCRIPT_LOAD_FAILED"));

        if (!existing) document.head.appendChild(script);
      });
    }

    await Promise.race([
      scriptPromiseRef.current,
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("TURNSTILE_SCRIPT_TIMEOUT")), SCRIPT_LOAD_TIMEOUT_MS);
      }),
    ]);
  }, []);

  const scheduleBackgroundRetry = useCallback(() => {
    if (backgroundRetryTimerRef.current || !mountedRef.current || retryCount >= MAX_RETRIES) return;

    backgroundRetryTimerRef.current = setTimeout(() => {
      backgroundRetryTimerRef.current = null;
      if (!mountedRef.current) return;
      scriptPromiseRef.current = null;
      setRetryCount((prev) => prev + 1);
    }, BACKGROUND_RETRY_DELAY_MS);
  }, [retryCount]);

  const handleRetry = useCallback(() => {
    scriptPromiseRef.current = null;
    setRetryCount((prev) => prev + 1);
    setStatus("loading");
    setErrorMsg("");
    onToken("");
  }, [onToken]);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        setStatus("loading");
        setErrorMsg("");

        await ensureScriptLoaded();
        if (!mountedRef.current) return;

        renderWidget();
      } catch (err) {
        if (!mountedRef.current) return;
        console.warn("[Turnstile] script/bootstrap error:", err);
        setStatus("error");
        setErrorMsg("CAPTCHA indisponible: verifiez connexion, VPN/proxy et bloqueur de pubs");
        onToken("");
        scheduleBackgroundRetry();
      }
    })();

    return () => {
      mountedRef.current = false;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, ensureScriptLoaded, renderWidget, scheduleBackgroundRetry, onToken, cleanupAll]);

  return (
    <div>
      <div ref={containerRef} style={{ marginTop: 8, marginBottom: 8, minHeight: 64 }} />

      {status === "loading" && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            padding: "12px 14px",
            background: "rgba(111,88,255,0.08)",
            border: "1px solid rgba(111,88,255,0.2)",
            borderRadius: 8,
            color: "rgba(255,255,255,0.6)",
            fontSize: "0.82rem",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              border: "2px solid rgba(111,88,255,0.3)",
              borderTopColor: "#6f58ff",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Chargement de la verification...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            padding: "12px 14px",
            background: "rgba(255,180,50,0.10)",
            border: "1px solid rgba(255,180,50,0.25)",
            borderRadius: 8,
            color: "rgba(255,255,255,0.75)",
            fontSize: "0.8rem",
            textAlign: "center",
            cursor: "pointer",
          }}
          onClick={handleRetry}
        >
          CAPTCHA obligatoire indisponible - appuyez ici pour reessayer
          {errorMsg ? ` (${errorMsg})` : ""}
        </div>
      )}

      {status === "expired" && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            padding: "12px 14px",
            background: "rgba(255,180,50,0.12)",
            border: "1px solid rgba(255,180,50,0.3)",
            borderRadius: 8,
            color: "#ffb432",
            fontSize: "0.82rem",
            textAlign: "center",
            cursor: "pointer",
          }}
          onClick={handleRetry}
        >
          Verification expiree - appuyez pour relancer
        </div>
      )}
    </div>
  );
}
