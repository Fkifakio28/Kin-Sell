import { env } from "../../config/env.js";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

/**
 * Verify a Cloudflare Turnstile token server-side.
 * If TURNSTILE_SECRET_KEY is not configured, verification is skipped (dev mode).
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // skip in dev

  // Strict mode: explicit fallback tokens are not valid for web verification.
  if (!token || token === "captcha-unavailable") return false;

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });

    const data = (await res.json()) as TurnstileResponse;
    return data.success === true;
  } catch {
    if (env.TURNSTILE_FAIL_OPEN) {
      console.warn("[Turnstile] verification failed - fail-open enabled");
      return true;
    }
    console.warn("[Turnstile] verification failed - fail-closed");
    return false;
  }
}
