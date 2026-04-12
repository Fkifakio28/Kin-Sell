import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clearAuthSession, request } from "../../lib/api-client";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

const APP_CODE_ROLE_KEY_PREFIX = "kin-sell.oauth.app-code.role.";

function getConsumedAppCodeRole(appCode: string): string | null {
  try {
    return sessionStorage.getItem(`${APP_CODE_ROLE_KEY_PREFIX}${appCode}`);
  } catch {
    return null;
  }
}

function markAppCodeConsumed(appCode: string, role: string): void {
  try {
    sessionStorage.setItem(`${APP_CODE_ROLE_KEY_PREFIX}${appCode}`, role);
  } catch {
    // ignore storage failures
  }
}

function logOAuthDebug(stage: string, info?: string) {
  try {
    fetch("/api/auth/oauth/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        stage,
        source: "auth-callback",
        info: info ?? "",
        url: window.location.href,
        ua: navigator.userAgent,
        ts: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore debug failures
  }
}

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

    logOAuthDebug("callback-start", `authSuccess=${authSuccess ?? ""}; role=${role ?? ""}; error=${error ?? ""}; hasAppCode=${appCode ? "1" : "0"}`);

    // Clear any legacy localStorage tokens
    clearAuthSession();

    if (error || !authSuccess) {
      logOAuthDebug("callback-invalid", error ?? "missing authSuccess");
      window.location.replace("/login");
      return;
    }

    // Native app flow: exchange appCode for httpOnly cookies in the WebView
    if (appCode) {
      const consumedRole = getConsumedAppCodeRole(appCode);
      if (consumedRole) {
        logOAuthDebug("app-exchange-skip-duplicate", `role=${consumedRole}`);
        redirectByRole(consumedRole);
        return;
      }

      logOAuthDebug("app-exchange-start", `appCode.length=${appCode.length}`);
      request<{ ok: boolean; role: string }>("/auth/app/exchange", {
        method: "POST",
        body: { appCode },
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => {
          markAppCodeConsumed(appCode, res.role);
          logOAuthDebug("app-exchange-success", `role=${res.role}`);
          redirectByRole(res.role);
        })
        .catch((err: unknown) => {
          const duplicatedRole = getConsumedAppCodeRole(appCode);
          if (duplicatedRole) {
            logOAuthDebug("app-exchange-duplicate-recovered", `role=${duplicatedRole}`);
            redirectByRole(duplicatedRole);
            return;
          }
          const message = err instanceof Error ? err.message : "exchange failed";
          logOAuthDebug("app-exchange-failed", message);
          window.location.replace("/login");
        });
      return;
    }

    // Web flow: cookies already set by the redirect
    logOAuthDebug("web-redirect", `role=${role ?? ""}`);
    redirectByRole(role);
  }, [searchParams]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "1.1rem" }}>{t('auth.callbackLoading')}</p>
    </div>
  );
}

