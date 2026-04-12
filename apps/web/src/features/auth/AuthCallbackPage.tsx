import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clearAuthSession, request } from "../../lib/api-client";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

function redirectByRole(role: string | null) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    window.location.replace("/admin/dashboard");
  } else if (role === "BUSINESS") {
    window.location.replace("/business/dashboard");
  } else {
    window.location.replace("/account");
  }
}

/**
 * Page de callback OAuth.
 * - Web: l'API set httpOnly cookies pendant le redirect, on lit juste les métadonnées.
 * - App native: on reçoit un appCode éphémère qu'on échange contre des cookies via POST.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const { t } = useLocaleCurrency();

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const authSuccess = searchParams.get("authSuccess");
    const role = searchParams.get("role");
    const error = searchParams.get("error");
    const appCode = searchParams.get("appCode");

    // Clear any legacy localStorage tokens
    clearAuthSession();

    if (error || !authSuccess) {
      window.location.replace("/login");
      return;
    }

    // Native app flow: exchange appCode for httpOnly cookies in the WebView
    if (appCode) {
      request<{ ok: boolean; role: string }>("/auth/app/exchange", {
        method: "POST",
        body: JSON.stringify({ appCode }),
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => redirectByRole(res.role))
        .catch(() => window.location.replace("/login"));
      return;
    }

    // Web flow: cookies already set by the redirect
    redirectByRole(role);
  }, [searchParams]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "1.1rem" }}>{t('auth.callbackLoading')}</p>
    </div>
  );
}
