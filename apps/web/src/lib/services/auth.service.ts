import { request, mutate, setToken, setRefreshToken, setSessionId, clearAuthSession, ApiError, getRefreshToken, type AccountUser } from "../api-core";
import type { LocationVisibility } from "./geo.service";

type AccountAuthResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AccountUser;
};

export type AuthResponse = {
  token: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AccountUser;
};

function persistAuth(data: AccountAuthResponse): AuthResponse {
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  setSessionId(data.sessionId);

  return {
    token: data.accessToken,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    sessionId: data.sessionId,
    user: data.user
  };
}

export const auth = {
  register: async (body: { email: string; password: string; displayName: string; role?: string; cfTurnstileToken?: string }) => {
    const data = await request<AccountAuthResponse>("/account/entry", {
      method: "POST",
      body: {
        method: "email",
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        accountType: body.role === "BUSINESS" ? "BUSINESS" : "USER",
        cfTurnstileToken: body.cfTurnstileToken,
      }
    });
    return persistAuth(data);
  },

  login: async (body: { email: string; password: string; cfTurnstileToken?: string }) => {
    const raw = await request<AccountAuthResponse | { totpRequired: true; challengeToken: string }>("/account/entry", {
      method: "POST",
      body: {
        method: "email",
        email: body.email,
        password: body.password,
        cfTurnstileToken: body.cfTurnstileToken,
      }
    });
    if ("totpRequired" in raw && raw.totpRequired) {
      return raw as { totpRequired: true; challengeToken: string };
    }
    return persistAuth(raw as AccountAuthResponse);
  },

  logout: async () => {
    try {
      await request<void>("/account/logout", { method: "POST" }, false);
    } finally {
      clearAuthSession();
    }
  },

  refresh: async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError(401, "Session expiree");

    const res = await request<{ accessToken: string; refreshToken: string; sessionId: string }>(
      "/account/refresh",
      { method: "POST", body: { refreshToken } },
      false
    );
    setToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setSessionId(res.sessionId);
  },

  me: () => request<AccountUser>("/account/me"),
  completeProfile: (body: {
    username?: string;
    birthDate?: string;
    country?: string;
    city?: string;
    addressLine1?: string;
    avatarUrl?: string;
    displayName?: string;
    onlineStatusVisible?: boolean;
    accountType?: "USER" | "BUSINESS";
    email?: string;
    phone?: string;
    countryCode?: string;
    region?: string;
    district?: string;
    postalCode?: string;
    formattedAddress?: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
    locationVisibility?: LocationVisibility;
  }) => mutate<AccountUser>("/account/profile/complete", { method: "PATCH", body }, ["/account/me", "/users/me"]),
  sessions: () => request<{ sessions: Array<{
    id: string;
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
    lastSeenAt: string;
    createdAt: string;
    isCurrent: boolean;
  }> }>("/account/sessions"),
  requestOtp: (body: { phone: string; purpose?: "SIGN_IN" | "VERIFY_PHONE" }) =>
    request<{ verificationId: string; expiresAt: string; resendAfterSeconds: number; previewCode?: string }>("/account/otp/request", { method: "POST", body }),
  verifyOtp: (body: {
    verificationId: string;
    code: string;
    phone?: string;
    displayName?: string;
    accountType?: "USER" | "BUSINESS";
    deviceId?: string;
  }) => request<AccountAuthResponse>("/account/otp/verify", { method: "POST", body }).then(persistAuth),

  // ── TOTP 2FA ──
  totpStatus: () => request<{ totpEnabled: boolean }>("/account/2fa/totp/status"),
  totpSetup: () => request<{ secret: string; uri: string }>("/account/2fa/totp/setup", { method: "POST" }),
  totpEnable: (code: string) => request<{ success: boolean }>("/account/2fa/totp/enable", { method: "POST", body: { code } }),
  totpDisable: (password: string) => request<{ success: boolean }>("/account/2fa/totp", { method: "DELETE", body: { password } }),
  totpChallenge: (challengeToken: string, code: string) =>
    request<AccountAuthResponse>("/account/2fa/totp/challenge", { method: "POST", body: { challengeToken, code } }).then(persistAuth),

  requestDeletion: (reason: string) =>
    request<{ ok: boolean; scheduledDeletionAt: string }>("/account/deletion-request", { method: "POST", body: { reason } }),

  submitAppeal: (message: string) =>
    request<{ ok: boolean }>("/account/appeal", { method: "POST", body: { message } }),

  // ── Password Recovery ──
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean; verificationId?: string; message: string; previewCode?: string }>("/account/password-reset/request", { method: "POST", body: { email } }),
  confirmPasswordReset: (body: { verificationId: string; code: string; newPassword: string }) =>
    request<{ ok: boolean }>("/account/password-reset/confirm", { method: "POST", body }),

  // ── Change Password (logged-in) ──
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/account/change-password", { method: "POST", body: { currentPassword, newPassword } }),

  // ── Email Verification ──
  requestEmailVerification: (email: string) =>
    request<{ verificationId: string; expiresAt: string; previewCode?: string }>("/account/verifications/email/request", { method: "POST", body: { email } }),
  confirmEmailVerification: (body: { verificationId: string; code: string }) =>
    request<{ success: boolean }>("/account/verifications/email/confirm", { method: "POST", body }),

  revokeSession: (sessionId: string) =>
    request<{ success: boolean }>(`/account/sessions/${sessionId}`, { method: "DELETE" }),
  revokeAllOtherSessions: () =>
    request<{ success: boolean }>("/account/sessions", { method: "DELETE" }),
};
