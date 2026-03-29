import { Router } from "express";
import { z } from "zod";
import { Role } from "../../types/roles.js";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { logSecurityEvent, checkMultiAccount, createFraudSignal } from "../security/security.service.js";
import * as authService from "./auth.service.js";

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

export default router;
