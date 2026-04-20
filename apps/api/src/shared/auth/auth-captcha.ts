import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { rateLimit, RateLimits } from "../middleware/rate-limit.middleware.js";
import { verifyTurnstile } from "../utils/turnstile.js";

function isNativeAppRequest(request: Request): boolean {
  const ua = request.header("user-agent") ?? "";
  return /KinSellApp/i.test(ua);
}

export async function enforceAuthCaptcha(request: Request, response: Response): Promise<boolean> {
  const cfToken = request.body?.cfTurnstileToken;
  const isNativeApp = isNativeAppRequest(request);

  if (isNativeApp && env.ALLOW_NATIVE_AUTH_CAPTCHA_FALLBACK) {
    await new Promise<void>((resolve, reject) => {
      rateLimit(RateLimits.LOGIN)(request, response, (err) => err ? reject(err) : resolve());
    });
    return !response.headersSent;
  }

  if (env.TURNSTILE_SECRET_KEY && !cfToken) {
    response.status(400).json({ error: "Vérification CAPTCHA requise" });
    return false;
  }

  if (cfToken) {
    const valid = await verifyTurnstile(cfToken, request.ip);
    if (!valid) {
      response.status(403).json({ error: "Échec de la vérification CAPTCHA" });
      return false;
    }
  }

  return true;
}
