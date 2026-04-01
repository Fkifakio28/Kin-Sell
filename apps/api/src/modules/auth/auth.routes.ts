import { Router } from "express";
import { z } from "zod";
import { Role } from "../../types/roles.js";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { logSecurityEvent, checkMultiAccount, createFraudSignal } from "../security/security.service.js";
import * as authService from "./auth.service.js";
import { getGoogleAuthUrl, handleGoogleCallback } from "./google-oauth.service.js";
import { verifyTurnstile } from "../../shared/utils/turnstile.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

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

router.post("/register", rateLimit(RateLimits.REGISTER), asyncHandler(async (request, response) => {
  // Turnstile CAPTCHA verification
  const cfToken = request.body?.cfTurnstileToken;
  if (env.TURNSTILE_SECRET_KEY && !cfToken) {
    response.status(400).json({ error: "Vérification CAPTCHA requise" });
    return;
  }
  if (cfToken) {
    const valid = await verifyTurnstile(cfToken, request.ip);
    if (!valid) {
      response.status(403).json({ error: "Échec de la vérification CAPTCHA" });
      return;
    }
  }

  const payload = registerSchema.parse(request.body);
  const result = await authService.register(payload);

  // Security: log + multi-account check
  const ip = request.ip ?? "unknown";
  void logSecurityEvent({
    userId: result.user.id,
    eventType: "AUTH_REGISTER",
    ipAddress: ip,
    userAgent: request.headers["user-agent"],
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

router.post("/login", rateLimit(RateLimits.LOGIN), asyncHandler(async (request, response) => {
  // Turnstile CAPTCHA verification
  const cfToken = request.body?.cfTurnstileToken;
  if (env.TURNSTILE_SECRET_KEY && !cfToken) {
    response.status(400).json({ error: "Vérification CAPTCHA requise" });
    return;
  }
  if (cfToken) {
    const valid = await verifyTurnstile(cfToken, request.ip);
    if (!valid) {
      response.status(403).json({ error: "Échec de la vérification CAPTCHA" });
      return;
    }
  }

  const payload = loginSchema.parse(request.body);
  const result = await authService.login(payload);

  // Security: log login
  void logSecurityEvent({
    userId: result.user.id,
    eventType: "AUTH_LOGIN",
    ipAddress: request.ip ?? undefined,
    userAgent: request.headers["user-agent"],
    riskLevel: 0,
  });

  response.json(result);
}));

router.post("/refresh", asyncHandler(async (request, response) => {
  const payload = refreshSchema.parse(request.body);
  const result = await authService.refresh(payload.refreshToken);
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
  res.redirect(getGoogleAuthUrl());
});

router.get("/google/callback", asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.redirect(`${env.FRONTEND_URL}/login?error=google_no_code`);
    return;
  }

  try {
    const result = await handleGoogleCallback(code);
    const params = new URLSearchParams({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      userId: result.user.id,
      displayName: result.user.displayName ?? "",
      role: result.user.role,
      isNew: result.isNewUser ? "1" : "0",
    });
    res.redirect(`${env.FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (error) {
    logger.error({ err: error }, "[Google OAuth] Callback failed");
    const errMsg = error instanceof Error ? error.message : "unknown";
    res.redirect(`${env.FRONTEND_URL}/login?error=google_failed&detail=${encodeURIComponent(errMsg)}`);
  }
}));

export default router;
