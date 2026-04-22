import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Role } from "../../types/roles.js";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { logSecurityEvent, checkMultiAccount, createFraudSignal } from "../security/security.service.js";
import { setAuthCookies } from "../../shared/auth/session.js";
import { enforceAuthCaptcha } from "../../shared/auth/auth-captcha.js";
import { extractRequestContext } from "../../shared/http/request-context.js";
import { spamGuard } from "../../shared/middleware/spam-guard.middleware.js";
import * as authService from "./auth.service.js";
import { getGoogleAuthUrl, handleGoogleCallback } from "./google-oauth.service.js";
import { getAppleAuthUrl, handleAppleCallback } from "./apple-oauth.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

/* ── App-code store (ephemeral codes for native app OAuth) ── */
interface AppCodeEntry {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  userId: string;
  role: string;
  displayName: string;
  expiresAt: number;
  consumed?: boolean;
  ip?: string; // SECURITY: bind code to requester IP
}
const appCodeStore = new Map<string, AppCodeEntry>();

/* ── OAuth state store (anti-CSRF random tokens) ── */
const oauthStateStore = new Map<string, { source: string; expiresAt: number }>();

// Purge expired codes & states every 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of appCodeStore) {
    if (v.expiresAt < now) appCodeStore.delete(k);
  }
  for (const [k, v] of oauthStateStore) {
    if (v.expiresAt < now) oauthStateStore.delete(k);
  }
}, 60_000);

function createOAuthState(source: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  const state = `${source}:${token}`;
  oauthStateStore.set(token, { source, expiresAt: Date.now() + 10 * 60 * 1000 });
  return state;
}

function verifyOAuthState(state: string | undefined): string {
  if (!state || !state.includes(":")) throw new Error("Missing OAuth state");
  const [source, token] = state.split(":", 2);
  const entry = oauthStateStore.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    oauthStateStore.delete(token);
    throw new Error("Invalid or expired OAuth state");
  }
  oauthStateStore.delete(token);
  return source;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
  role: z.enum([Role.USER, Role.BUSINESS]).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

const router = Router();

router.post("/oauth/debug", rateLimit(RateLimits.OAUTH_DEBUG), asyncHandler(async (req, res) => {
  const payload = z.object({
    stage: z.string().min(1).max(80),
    source: z.string().max(40).optional(),
    info: z.string().max(500).optional(),
    url: z.string().max(2000).optional(),
    ua: z.string().max(500).optional(),
    ts: z.number().optional(),
  }).safeParse(req.body ?? {});

  if (!payload.success) {
    res.status(400).json({ ok: false });
    return;
  }

  logger.info({
    oauthDebug: {
      ...payload.data,
      ip: req.ip,
      serverTs: Date.now(),
    },
  }, "[OAuth Debug]");

  res.json({ ok: true });
}));

router.post("/register", rateLimit(RateLimits.REGISTER), spamGuard("AUTH"), asyncHandler(async (request, response) => {
  if (!(await enforceAuthCaptcha(request, response))) return;

  const payload = registerSchema.parse(request.body);
  const ctx = extractRequestContext(request);
  const result = await authService.register(payload, ctx);

  // Security: log + multi-account check
  const ip = ctx.ipAddress ?? "unknown";
  void logSecurityEvent({
    userId: result.user.id,
    eventType: "AUTH_REGISTER",
    ipAddress: ip,
    userAgent: ctx.userAgent,
    riskLevel: 0,
  });
  void checkMultiAccount(ip).then(r => {
    if (r.suspicious) {
      void createFraudSignal({
        userId: result.user.id,
        signalType: "MULTI_ACCOUNT_IP",
        severity: 2,
        description: `${r.accountCount} inscriptions depuis la m\u00eame IP en 24h`,
      });
    }
  });

  response.status(201).json(result);
}));

router.post("/login", rateLimit(RateLimits.LOGIN), spamGuard("AUTH"), asyncHandler(async (request, response) => {
  if (!(await enforceAuthCaptcha(request, response))) return;

  const payload = loginSchema.parse(request.body);
  const ctx = extractRequestContext(request);
  const result = await authService.login(payload, ctx);

  // Security: log login
  void logSecurityEvent({
    userId: result.user.id,
    eventType: "AUTH_LOGIN",
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    riskLevel: 0,
  });

  response.json(result);
}));

router.post("/refresh", rateLimit(RateLimits.LOGIN), asyncHandler(async (request, response) => {
  const payload = refreshSchema.parse(request.body);
  const result = await authService.refresh(payload.refreshToken, extractRequestContext(request));
  response.json(result);
}));

router.post("/logout", requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  const result = await authService.logout(request.auth?.sessionId);
  response.json(result);
}));

router.get("/me", requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  const result = await authService.me(request.auth!.userId);
  response.json(result);
}));

// ── Google OAuth ──
router.get("/google", (req, res) => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: "Google OAuth non configuré" });
    return;
  }
  const source = req.query.source === "app" ? "app" : "web";
  const state = createOAuthState(source);
  res.redirect(getGoogleAuthUrl(state));
});

router.get("/google/callback", asyncHandler(async (req, res) => {
  let source: string;
  try {
    source = verifyOAuthState(req.query.state as string | undefined);
  } catch {
    res.status(403).json({ error: "Invalid OAuth state" });
    return;
  }
  const code = req.query.code as string;
  const callbackBase = source === "app"
    ? `${env.FRONTEND_URL}/auth/app-redirect.html`
    : `${env.FRONTEND_URL}/auth/callback`;
  if (!code) {
    const params = new URLSearchParams({ error: "google_no_code" });
    res.redirect(`${callbackBase}?${params.toString()}`);
    return;
  }

  try {
    const result = await handleGoogleCallback(code);

    if (source === "app") {
      // Native app: generate ephemeral one-time code (5 min TTL)
      // Cookies set in the external browser won't reach the WebView,
      // so we pass a code via deep-link that the app exchanges later.
      const appCode = crypto.randomBytes(32).toString("hex");
      appCodeStore.set(appCode, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        userId: result.user.id,
        role: result.user.role,
        displayName: result.user.displayName ?? "",
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
        ip: req.ip,
      });
      const params = new URLSearchParams({
        appCode,
        authSuccess: "1",
        role: result.user.role,
      });
      res.redirect(`${callbackBase}?${params.toString()}`);
    } else {
      // Web: set httpOnly cookies directly
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });

      const params = new URLSearchParams({
        authSuccess: "1",
        userId: result.user.id,
        displayName: result.user.displayName ?? "",
        role: result.user.role,
        isNew: result.isNewUser ? "1" : "0",
      });
      res.redirect(`${callbackBase}?${params.toString()}`);
    }
  } catch (error) {
    logger.error({ err: error }, "[Google OAuth] Callback failed");
    const params = new URLSearchParams({ error: "google_failed" });
    res.redirect(`${callbackBase}?${params.toString()}`);
  }
}));

// ── Apple Sign In ──
router.get("/apple", (req, res) => {
  if (!env.APPLE_CLIENT_ID) {
    res.status(501).json({ error: "Apple Sign In non configuré" });
    return;
  }
  const source = req.query.source === "app" ? "app" : "web";
  const state = createOAuthState(source);
  res.redirect(getAppleAuthUrl(state));
});

// Apple uses form_post — callback is a POST
router.post("/apple/callback", asyncHandler(async (req, res) => {
  const code = req.body?.code as string | undefined;
  const idToken = req.body?.id_token as string | undefined;
  let source: string;
  try {
    source = verifyOAuthState(req.body?.state as string | undefined);
  } catch {
    res.status(403).json({ error: "Invalid OAuth state" });
    return;
  }
  const callbackBase = source === "app"
    ? `${env.FRONTEND_URL}/auth/app-redirect.html`
    : `${env.FRONTEND_URL}/auth/callback`;

  if (!code) {
    const params = new URLSearchParams({ error: "apple_no_code" });
    res.redirect(`${callbackBase}?${params.toString()}`);
    return;
  }

  // Apple may send user info (name/email) as JSON string on first login only
  let userInfo: { name?: { firstName?: string; lastName?: string }; email?: string } | undefined;
  if (req.body?.user) {
    try {
      userInfo = typeof req.body.user === "string" ? JSON.parse(req.body.user) : req.body.user;
    } catch { /* ignore parse errors */ }
  }

  try {
    const result = await handleAppleCallback(code, idToken ?? undefined, userInfo);

    if (source === "app") {
      const appCode = crypto.randomBytes(32).toString("hex");
      appCodeStore.set(appCode, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        userId: result.user.id,
        role: result.user.role,
        displayName: result.user.displayName ?? "",
        expiresAt: Date.now() + 5 * 60 * 1000,
        ip: req.ip,
      });
      const params = new URLSearchParams({
        appCode,
        authSuccess: "1",
        role: result.user.role,
      });
      res.redirect(`${callbackBase}?${params.toString()}`);
    } else {
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
      });

      const params = new URLSearchParams({
        authSuccess: "1",
        userId: result.user.id,
        displayName: result.user.displayName ?? "",
        role: result.user.role,
        isNew: result.isNewUser ? "1" : "0",
      });
      res.redirect(`${callbackBase}?${params.toString()}`);
    }
  } catch (error) {
    logger.error({ err: error }, "[Apple OAuth] Callback failed");
    const params = new URLSearchParams({ error: "apple_failed" });
    res.redirect(`${callbackBase}?${params.toString()}`);
  }
}));


// Apple native SDK: verify identity token from iOS Sign in with Apple
router.post("/apple/native", rateLimit(RateLimits.LOGIN), asyncHandler(async (req, res) => {
  const { identityToken, authorizationCode, fullName } = z.object({
    identityToken: z.string(),
    authorizationCode: z.string(),
    fullName: z.object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    }).optional(),
  }).parse(req.body);

  const userInfo = fullName ? {
    name: { firstName: fullName.givenName, lastName: fullName.familyName },
  } : undefined;

  const result = await handleAppleCallback(authorizationCode, identityToken, userInfo);

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    sessionId: result.sessionId,
  });

  res.json({
    ok: true,
    userId: result.user.id,
    role: result.user.role,
    displayName: result.user.displayName,
    isNew: result.isNewUser,
  });
}));

// ── App code exchange (native app only) ──
// The WebView calls this to exchange the appCode for httpOnly cookies.
// Idempotent: multiple calls with the same code return the same result
// within the TTL window (handles duplicate deep-link race conditions).
router.post("/app/exchange", rateLimit(RateLimits.APP_EXCHANGE), asyncHandler(async (req, res) => {
  const { appCode } = z.object({ appCode: z.string().length(64) }).parse(req.body);

  const entry = appCodeStore.get(appCode);
  if (!entry || entry.expiresAt < Date.now()) {
    appCodeStore.delete(appCode);
    res.status(401).json({ error: "Code invalide ou expiré" });
    return;
  }

  // SECURITY: verify IP matches the one that created the code (prevent interception)
  if (entry.ip && entry.ip !== req.ip) {
    logger.warn({ expected: entry.ip, got: req.ip }, "[AppCode] IP mismatch on exchange");
    appCodeStore.delete(appCode);
    res.status(403).json({ error: "Code invalide" });
    return;
  }

  // Set httpOnly cookies in the WebView context
  setAuthCookies(res, {
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    sessionId: entry.sessionId,
  });

  // Shorten TTL to 30s after first exchange (allow retries but limit window)
  if (!entry.consumed) {
    entry.consumed = true;
    entry.expiresAt = Math.min(entry.expiresAt, Date.now() + 30_000);
  }

  res.json({
    ok: true,
    userId: entry.userId,
    role: entry.role,
    displayName: entry.displayName,
  });
}));

export default router;
