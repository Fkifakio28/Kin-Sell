import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth as authApi, clearAuthSession, clearCache, scheduleTokenRefresh, clearScheduledRefresh } from "../../lib/api-client";
import type { AccountUser } from "../../lib/api-client";

type AuthContextValue = {
  user: AccountUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string, cfTurnstileToken?: string) => Promise<AccountUser>;
  register: (email: string, password: string, displayName: string, role?: string, cfTurnstileToken?: string) => Promise<AccountUser>;
  refreshUser: () => Promise<AccountUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    // Retry 2 fois avec backoff (réseau instable 2G/3G Afrique)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      try {
        const data = await authApi.me();
        setUser(data);
        return data;
      } catch (err) {
        // Erreur réseau → retry
        if (err instanceof TypeError && attempt < 2) continue;
        if (err instanceof DOMException && err.name === "AbortError" && attempt < 2) continue;
        // Erreur API (401, etc.) → pas la peine de retry
        clearAuthSession();
        setUser(null);
        return null;
      }
    }
    clearAuthSession();
    setUser(null);
    return null;
  }, []);

  // Bootstrap — httpOnly cookies carry auth. Try /me to check if session is active.
  useEffect(() => {
    // Clear any legacy localStorage tokens from pre-cookie migration
    clearAuthSession();

    const bootstrap = async () => {
      try {
        await refreshUser();
      } catch {
        // No valid session — user is not logged in
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [refreshUser]);

  // Proactive token refresh — keeps session alive before JWT expires
  useEffect(() => {
    if (!user) {
      clearScheduledRefresh();
      return;
    }
    const cleanup = scheduleTokenRefresh(() => {
      // Session could not be refreshed — clear state
      clearAuthSession();
      setUser(null);
    });
    return cleanup;
  }, [user]);

  const login = useCallback(async (email: string, password: string, cfTurnstileToken?: string) => {
    const result = await authApi.login({ email, password, cfTurnstileToken });
    // Si TOTP requis, on ne peut pas persister la session — lancer une erreur spéciale
    if ("totpRequired" in result && result.totpRequired) {
      throw Object.assign(new Error("TOTP_REQUIRED"), { challengeToken: result.challengeToken });
    }
    const { user: u } = result as { user: import("../../lib/api-client").AccountUser };
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string, role?: string, cfTurnstileToken?: string) => {
    const { user: u } = await authApi.register({ email, password, displayName, role, cfTurnstileToken });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearAuthSession();
      clearCache();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isLoggedIn: user !== null,
    login,
    register,
    refreshUser,
    logout,
  }), [user, isLoading, login, register, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Redirige automatiquement vers /suspended si l'utilisateur connecté est suspendu.
 * Doit être rendu à l'intérieur d'un RouterProvider (accès à useNavigate/useLocation).
 */
export function SuspensionGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (user?.accountStatus === "SUSPENDED" && location.pathname !== "/suspended") {
      navigate("/suspended", { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  return <>{children}</>;
}
