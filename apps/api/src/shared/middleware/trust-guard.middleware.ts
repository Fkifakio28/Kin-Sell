/**
 * Trust Guard Middleware — Kin-Sell
 *
 * Checks user restrictions before allowing specific actions.
 * Call after requireAuth middleware.
 */

import { RestrictionType } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth-middleware.js";
import { HttpError } from "../errors/http-error.js";
import { hasRestriction } from "../../modules/security/security.service.js";

const RESTRICTION_MESSAGES: Record<RestrictionType, string> = {
  MESSAGE_LIMIT: "Votre accès à la messagerie est temporairement restreint.",
  LISTING_LIMIT: "Vous ne pouvez pas publier d'annonces pour le moment.",
  NEGOTIATION_BLOCK: "Les négociations sont temporairement bloquées pour votre compte.",
  VISIBILITY_REDUCED: "Votre visibilité est réduite suite à une action de modération.",
  MANUAL_REVIEW: "Votre compte est en cours de vérification manuelle.",
  SOKIN_RESTRICTED: "Votre accès à So-Kin est temporairement restreint.",
  FULL_READONLY: "Votre compte est en mode lecture seule.",
};

/**
 * Creates a middleware that blocks the request if the user has
 * any of the specified restriction types active.
 */
export function requireNoRestriction(...types: RestrictionType[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.auth?.userId) {
      next();
      return;
    }

    // FULL_READONLY blocks everything — always check it
    const allTypes = types.includes("FULL_READONLY") ? types : [...types, "FULL_READONLY" as RestrictionType];

    for (const type of allTypes) {
      const restricted = await hasRestriction(authReq.auth.userId, type);
      if (restricted) {
        throw new HttpError(403, RESTRICTION_MESSAGES[type]);
      }
    }

    next();
  };
}
