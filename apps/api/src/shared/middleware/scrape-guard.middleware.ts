import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/http-error.js";
import { logSecurityEvent } from "../../modules/security/security.service.js";

const SUSPICIOUS_UA = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bpython\b/i,
  /\bscrapy\b/i,
  /\bhttpclient\b/i,
  /\bbot\b/i,
  /\bspider\b/i,
  /\bcrawler\b/i,
];

// Bots SEO légitimes — ne pas bloquer
const ALLOWED_BOTS = /Googlebot|Bingbot|Applebot|DuckDuckBot|YandexBot|Baiduspider|Slurp|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|Discordbot/i;

export function scrapeGuard() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userAgent = String(req.headers["user-agent"] ?? "").trim();
    const isEmpty = userAgent.length === 0;

    // Laisser passer les crawlers SEO légitimes
    if (!isEmpty && ALLOWED_BOTS.test(userAgent)) {
      return next();
    }

    const isSuspicious = SUSPICIOUS_UA.some((rx) => rx.test(userAgent));

    if (isEmpty || isSuspicious) {
      await logSecurityEvent({
        eventType: "SCRAPE_SUSPECTED",
        ipAddress: req.ip ?? undefined,
        userAgent: userAgent || undefined,
        riskLevel: 4,
        metadata: { path: req.path, method: req.method, emptyUserAgent: isEmpty },
      }).catch(() => {});
      next(new HttpError(429, "Trop de requêtes. Réessayez dans quelques instants."));
      return;
    }

    next();
  };
}
