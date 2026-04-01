import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken, setRefreshToken, setSessionId } from "../../lib/api-client";

/**
 * Page de callback OAuth.
 * L'API redirige ici avec les tokens en query params après authentification Google/Facebook/Apple.
 * On persiste les tokens puis on redirige — le bootstrap AuthProvider chargera le profil.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    const sessionId = searchParams.get("sessionId");
    const role = searchParams.get("role");
    const error = searchParams.get("error");

    if (error) {
      navigate("/login", { replace: true });
      return;
    }

    if (!token || !refreshToken || !sessionId) {
      navigate("/login", { replace: true });
      return;
    }

    // Persister les tokens
    setToken(token);
    setRefreshToken(refreshToken);
    setSessionId(sessionId);

    // Rediriger immédiatement — AuthProvider bootstrap chargera le profil
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      navigate("/admin/dashboard", { replace: true });
    } else if (role === "BUSINESS") {
      navigate("/business/dashboard", { replace: true });
    } else {
      navigate("/account", { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "1.1rem" }}>Connexion en cours…</p>
    </div>
  );
}
