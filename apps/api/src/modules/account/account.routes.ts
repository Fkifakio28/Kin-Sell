import { AccountType, AuthProvider, VerificationPurpose } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { isAcceptedImageInput } from "../../shared/utils/media-storage.js";
import { verifyTurnstile } from "../../shared/utils/turnstile.js";
import { env } from "../../config/env.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { setAuthCookies, clearAuthCookies } from "../../shared/auth/session.js";
import * as accountService from "./account.service.js";

const accountTypeSchema = z.nativeEnum(AccountType).optional();

const deviceMetaSchema = z.object({
  deviceId: z.string().min(3).max(120).optional()
});

const entrySchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("email"),
    email: z.string().min(2).max(120),
    password: z.string().min(8).max(120),
    displayName: z.string().min(2).max(80).optional(),
    accountType: accountTypeSchema
  }).merge(deviceMetaSchema),
  z.object({
    method: z.literal("provider"),
    provider: z.enum([AuthProvider.GOOGLE, AuthProvider.FACEBOOK, AuthProvider.APPLE]),
    providerSubject: z.string().min(3).max(300),
    providerEmail: z.string().email().optional(),
    displayName: z.string().min(2).max(80).optional(),
    avatarUrl: z.string().refine(isAcceptedImageInput, "Image invalide").optional(),
    accountType: accountTypeSchema
  }).merge(deviceMetaSchema)
]);

const otpRequestSchema = z.object({
  phone: z.string().min(8).max(32),
  purpose: z.nativeEnum(VerificationPurpose).default(VerificationPurpose.SIGN_IN)
});

const otpVerifySchema = z.object({
  verificationId: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
  phone: z.string().min(8).max(32).optional(),
  displayName: z.string().min(2).max(80).optional(),
  accountType: accountTypeSchema,
  deviceId: z.string().min(3).max(120).optional()
});

const profileCompletionSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  birthDate: z.coerce.date().optional(),
  country: z.string().min(2).max(80).optional(),
  countryCode: z.string().length(2).optional(),
  city: z.string().min(2).max(80).optional(),
  region: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  addressLine1: z.string().min(3).max(160).optional(),
  formattedAddress: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(300).optional(),
  locationVisibility: z.enum([
    "EXACT_PUBLIC", "DISTRICT_PUBLIC", "CITY_PUBLIC",
    "REGION_PUBLIC", "COUNTRY_PUBLIC", "EXACT_PRIVATE",
  ]).optional(),
  avatarUrl: z.string().refine(isAcceptedImageInput, "Image invalide").optional(),
  displayName: z.string().min(2).max(80).optional(),
  onlineStatusVisible: z.boolean().optional(),
  accountType: accountTypeSchema,
  email: z.string().email().optional(),
  phone: z.string().min(8).max(32).optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

const sessionIdSchema = z.object({
  sessionId: z.string().min(10)
});

const emailVerificationRequestSchema = z.object({
  email: z.string().email()
});

const emailVerificationConfirmSchema = z.object({
  verificationId: z.string().min(8),
  code: z.string().regex(/^\d{6}$/)
});

const router = Router();

router.post(
  "/entry",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request, response) => {
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

    const payload = entrySchema.parse(request.body);

    const result = await accountService.authEntry({
      ...payload,
      userAgent: request.header("user-agent") ?? undefined,
      ipAddress: request.ip
    });

    // Set httpOnly cookies for web auth (skip if TOTP challenge)
    if ("accessToken" in result && result.accessToken && result.refreshToken && result.sessionId) {
      setAuthCookies(response, result);
    }

    response.json(result);
  })
);

router.post(
  "/otp/request",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = otpRequestSchema.parse(request.body);
    const result = await accountService.requestPhoneOtp({
      ...payload,
      userId: request.auth?.userId
    });
    response.status(201).json(result);
  })
);

router.post(
  "/otp/verify",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request, response) => {
    const payload = otpVerifySchema.parse(request.body);
    const result = await accountService.verifyPhoneOtpAndSignIn({
      ...payload,
      userAgent: request.header("user-agent") ?? undefined,
      ipAddress: request.ip
    });
    if (result.accessToken && result.refreshToken && result.sessionId) {
      setAuthCookies(response, result);
    }
    response.json(result);
  })
);

router.post(
  "/refresh",
  asyncHandler(async (request, response) => {
    // Read refresh token from httpOnly cookie first, then body fallback
    const refreshToken = (request as any).cookies?.kin_refresh || request.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string" || refreshToken.length < 16) {
      throw new HttpError(401, "Refresh token requis");
    }
    try {
      const result = await accountService.refreshAuth(refreshToken);
      setAuthCookies(response, result);
      response.json(result);
    } catch {
      clearAuthCookies(response);
      throw new HttpError(401, "Refresh token invalide");
    }
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.getCurrentAccount(request.auth!.userId);
    response.json(result);
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.logoutCurrentSession(request.auth?.sessionId);
    clearAuthCookies(response);
    response.json(result);
  })
);

router.patch(
  "/profile/complete",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = profileCompletionSchema.parse(request.body);
    const result = await accountService.completeProfile(request.auth!.userId, payload);
    response.json(result);
  })
);

router.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.listSessions(request.auth!.userId, request.auth?.sessionId);
    response.json(result);
  })
);

router.delete(
  "/sessions/:sessionId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { sessionId } = sessionIdSchema.parse(request.params);
    const result = await accountService.revokeSessionById(request.auth!.userId, sessionId);
    response.json(result);
  })
);

router.delete(
  "/sessions",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.revokeAllOtherUserSessions(request.auth!.userId, request.auth?.sessionId);
    response.json(result);
  })
);

router.post(
  "/verifications/email/request",
  requireAuth,
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = emailVerificationRequestSchema.parse(request.body);
    const result = await accountService.requestEmailVerification(request.auth!.userId, payload.email);
    response.status(201).json(result);
  })
);

router.post(
  "/verifications/email/confirm",
  requireAuth,
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = emailVerificationConfirmSchema.parse(request.body);
    const result = await accountService.confirmEmailVerification(request.auth!.userId, payload.verificationId, payload.code);
    response.json(result);
  })
);

// ═══════════════════════════════════════════════════════════════
// 2FA — TOTP
// ═══════════════════════════════════════════════════════════════

const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const totpDisableSchema = z.object({ password: z.string().min(8) });
const totpChallengeSchema = z.object({ challengeToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });

router.get(
  "/2fa/totp/status",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.getTotpStatus(request.auth!.userId);
    response.json(result);
  })
);

router.post(
  "/2fa/totp/setup",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await accountService.setupTotp(request.auth!.userId);
    response.json(result);
  })
);

router.post(
  "/2fa/totp/enable",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { code } = totpCodeSchema.parse(request.body);
    const result = await accountService.enableTotp(request.auth!.userId, code);
    response.json(result);
  })
);

router.delete(
  "/2fa/totp",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { password } = totpDisableSchema.parse(request.body);
    const result = await accountService.disableTotp(request.auth!.userId, password);
    response.json(result);
  })
);

router.post(
  "/2fa/totp/challenge",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request, response) => {
    const { challengeToken, code } = totpChallengeSchema.parse(request.body);
    const result = await accountService.verifyTotpChallenge(
      challengeToken,
      code,
      request.body.deviceId as string | undefined,
      request.header("user-agent"),
      request.ip
    );
    if (result.accessToken && result.refreshToken && result.sessionId) {
      setAuthCookies(response, result);
    }
    response.json(result);
  })
);

// ═══════════════════════════════════════════════════════
// SUPPRESSION DE COMPTE
// ═══════════════════════════════════════════════════════

const deletionRequestSchema = z.object({ reason: z.string().min(5).max(1000) });

router.post(
  "/deletion-request",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { reason } = deletionRequestSchema.parse(request.body);
    const result = await accountService.requestAccountDeletion(request.auth!.userId, reason);
    response.json(result);
  })
);

// ═══════════════════════════════════════════════════════
// APPEL DE SUSPENSION
// ═══════════════════════════════════════════════════════

const appealSchema = z.object({ message: z.string().min(10).max(2000) });

router.post(
  "/appeal",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { message } = appealSchema.parse(request.body);
    const result = await accountService.submitSuspensionAppeal(request.auth!.userId, message);
    response.json(result);
  })
);

// ═══════════════════════════════════════════════════════
// PASSWORD RECOVERY
// ═══════════════════════════════════════════════════════

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetConfirmSchema = z.object({
  verificationId: z.string().min(8),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(120)
});

router.post(
  "/password-reset/request",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request, response) => {
    const { email } = passwordResetRequestSchema.parse(request.body);
    const result = await accountService.requestPasswordReset(email);
    response.json(result);
  })
);

router.post(
  "/password-reset/confirm",
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request, response) => {
    const { verificationId, code, newPassword } = passwordResetConfirmSchema.parse(request.body);
    const result = await accountService.confirmPasswordReset(verificationId, code, newPassword);
    response.json(result);
  })
);

/* ── Change password (logged-in) ── */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(120),
  newPassword: z.string().min(8).max(120),
});

router.post(
  "/change-password",
  requireAuth,
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
    const result = await accountService.changePassword(
      request.auth!.userId,
      currentPassword,
      newPassword
    );
    response.json(result);
  })
);

export default router;
