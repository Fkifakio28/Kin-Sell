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
    // Fail-open: if Cloudflare is unreachable, let the user through (rate-limit protects against abuse)
    console.warn("[Turnstile] verification timed out or failed — fail-open");
    return true;
  }
}
