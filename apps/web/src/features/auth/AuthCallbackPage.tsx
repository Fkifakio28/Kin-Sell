import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { setToken, setRefreshToken, setSessionId } from "../../lib/api-client";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

/**
 * Page de callback OAuth.
 * L'API redirige ici avec les tokens en query params après authentification Google/Facebook/Apple.
 * On persiste les tokens puis on force un rechargement complet pour que AuthProvider bootstrap avec les tokens.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const { t } = useLocaleCurrency();

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    const sessionId = searchParams.get("sessionId");
    const role = searchParams.get("role");
    const error = searchParams.get("error");

    if (error) {
      window.location.replace("/login");
      return;
    }

    if (!token || !refreshToken || !sessionId) {
      window.location.replace("/login");
      return;
    }

    // Persister les tokens
    setToken(token);
    setRefreshToken(refreshToken);
    setSessionId(sessionId);

    // Full page reload pour que AuthProvider bootstrap avec les tokens
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
