import type { NextFunction, Request, Response } from "express";
import { extractRequestContext } from "../http/request-context.js";
import { evaluateSpamRisk, recordSpamVerdict, type SpamGuardCategory } from "../../modules/security/ai-spam-guard.service.js";
import type { AuthenticatedRequest } from "../auth/auth-middleware.js";
import { logger } from "../logger.js";

/**
 * Middleware IA anti-spam qui prend le relais après le captcha sur les flux sensibles.
 *
 * Usage :
 *   router.post("/register", rateLimit(RateLimits.REGISTER), spamGuard("AUTH"), handler);
 *
 * Placement : APRÈS rateLimit + enforceAuthCaptcha (si applicable), AVANT le handler métier.
 * L'ordre garantit que :
 *  - le rate-limit basique filtre déjà les attaques triviales,
 *  - le captcha a validé qu'un humain est présent,
 *  - le spam-guard détecte les comportements anormaux qui ont franchi le captcha
 *    (bots humains, click farms, comptes multi).
 */
export const spamGuard = (category: SpamGuardCategory) => {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const ctx = extractRequestContext(request as unknown as Request);
    const userId = request.auth?.userId;

    const input = {
      category,
      userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      deviceId: ctx.deviceId
    } as const;

    let result;
    try {
      result = await evaluateSpamRisk(input);
    } catch (err) {
      // En cas d'erreur interne on fail-open : mieux vaut laisser passer qu'empêcher
      // des opérations légitimes. L'incident est loggé pour investigation.
      logger.error({ err, category }, "[SpamGuard] evaluate failed — fail-open");
      return next();
    }

    // Enregistre la décision sans bloquer la réponse
    void recordSpamVerdict(input, result);

    if (result.verdict === "HARD_BLOCK") {
      response.status(429).json({
        error: "Trop d'activité détectée. Réessayez plus tard.",
        code: "SPAM_GUARD_BLOCKED",
        retryAfter: 300
      });
      return;
    }

    if (result.verdict === "CHALLENGE") {
      // Signale au client qu'un step-up captcha est requis.
      // Le frontend doit réafficher le challenge Turnstile et rejouer la requête
      // avec le token frais dans le header `x-captcha-token`.
      response.status(423).json({
        error: "Vérification supplémentaire requise.",
        code: "SPAM_GUARD_CHALLENGE",
        requireCaptcha: true
      });
      return;
    }

    if (result.verdict === "SOFT_BLOCK") {
      // Tarpit : on ralentit volontairement pour rendre les bots inefficaces
      // tout en restant tolérable pour un humain (1.5s).
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    next();
  };
};
