import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setToken, setRefreshToken, setSessionId, getToken, auth as authApi } from "../../lib/api-client";

/**
 * Page de callback OAuth.
 * L'API redirige ici avec les tokens en query params après authentification Google/Facebook/Apple.
 * On persiste les tokens puis valide avec /account/me avant de rediriger.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const [debugInfo, setDebugInfo] = useState<string>("Traitement du callback…");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    void processCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processCallback() {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refreshToken");
    const sessionId = searchParams.get("sessionId");
    const role = searchParams.get("role");
    const error = searchParams.get("error");

    if (error) {
      setDebugInfo(`Erreur OAuth: ${error}`);
      setTimeout(() => window.location.replace("/login"), 3000);
      return;
    }

    if (!token || !refreshToken || !sessionId) {
      setDebugInfo(
        `Paramètres manquants — token: ${token ? "✓" : "✗"}, refreshToken: ${refreshToken ? "✓" : "✗"}, sessionId: ${sessionId ? "✓" : "✗"}`
      );
      setTimeout(() => window.location.replace("/login"), 5000);
      return;
    }

    setDebugInfo("Tokens reçus, persistance…");

    // Persister les tokens
    setToken(token);
    setRefreshToken(refreshToken);
    setSessionId(sessionId);

    // Vérifier que les tokens sont bien en localStorage
    const storedToken = getToken();
    if (!storedToken) {
      setDebugInfo("ERREUR: Token non persisté dans localStorage !");
      return;
    }

    setDebugInfo("Tokens persistés. Validation auprès de l'API…");

    // Tester l'appel /account/me AVANT de rediriger
    try {
      const user = await authApi.me();
      setDebugInfo(`Utilisateur vérifié: ${user.email} (${user.role}). Redirection…`);

      const target =
        role === "ADMIN" || role === "SUPER_ADMIN"
          ? "/admin/dashboard"
          : role === "BUSINESS"
            ? "/business/dashboard"
            : "/account";

      // Petit délai pour voir le message de succès
      setTimeout(() => window.location.replace(target), 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDebugInfo(`ERREUR API /account/me: ${msg}`);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: "1rem", padding: "2rem" }}>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "1.1rem" }}>Connexion en cours…</p>
      <p style={{ color: "#aaa", fontSize: "0.85rem", fontFamily: "monospace", textAlign: "center", maxWidth: "90vw", wordBreak: "break-all" }}>
        {debugInfo}
      </p>
    </div>
  );
}
