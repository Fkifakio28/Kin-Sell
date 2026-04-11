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
const SCRIPT_LOAD_TIMEOUT_MS = 8000;
const TOKEN_EXPIRY_MS = 280_000; // ~4m40 (Turnstile tokens expire after 5 min)

type TurnstileWidgetProps = {
  onToken: (token: string) => void;
};

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* noop */ }
    }
  }, []);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    // Clean up previous widget
    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      widgetIdRef.current = null;
    }

    setError(null);
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => {
        onToken(token);
        // Auto-reset before expiry
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        expiryTimer.current = setTimeout(() => {
          onToken("");
          resetWidget();
        }, TOKEN_EXPIRY_MS);
      },
      "error-callback": () => {
        setError("Erreur CAPTCHA — cliquez pour réessayer");
        onToken("");
      },
      "expired-callback": () => {
        onToken("");
        resetWidget();
      },
      theme: "dark",
      size: "flexible",
    });
  }, [onToken, resetWidget]);

  useEffect(() => {
    // If turnstile is already loaded
    if (window.turnstile) {
      renderWidget();
    } else {
      // Wait for the script to load, with timeout
      const start = Date.now();
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        } else if (Date.now() - start > SCRIPT_LOAD_TIMEOUT_MS) {
          clearInterval(interval);
          setError("CAPTCHA indisponible — vérifiez votre connexion ou désactivez votre bloqueur de publicités");
        }
      }, 200);

      return () => {
        clearInterval(interval);
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        if (widgetIdRef.current && window.turnstile) {
          try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
          widgetIdRef.current = null;
        }
      };
    }

    return () => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (error) {
    return (
      <div style={{
        marginTop: 8, marginBottom: 8, padding: "10px 14px",
        background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.3)",
        borderRadius: 8, color: "#ff8080", fontSize: "0.82rem", textAlign: "center",
        cursor: "pointer"
      }} onClick={() => { setError(null); renderWidget(); }}>
        ⚠️ {error}
      </div>
    );
  }

  return <div ref={containerRef} style={{ marginTop: 8, marginBottom: 8 }} />;
}
