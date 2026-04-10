import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { clearAuthSession } from "../../lib/api-client";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

/**
 * Page de callback OAuth.
 * L'API sets httpOnly cookies during the redirect — no tokens in URL anymore.
 * We just read metadata (role, authSuccess) and redirect to the appropriate dashboard.
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

    // Clear any legacy localStorage tokens
    clearAuthSession();

    if (error || !authSuccess) {
      window.location.replace("/login");
      return;
    }

    // Full page reload pour que AuthProvider bootstrap avec les cookies httpOnly
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      window.location.replace("/admin/dashboard");
    } else if (role === "BUSINESS") {
      window.location.replace("/business/dashboard");
    } else {
      window.location.replace("/account");
    }
  }, [searchParams]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "1.1rem" }}>{t('auth.callbackLoading')}</p>
    </div>
  );
}
