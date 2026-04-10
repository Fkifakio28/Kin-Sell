/**
 * SO-KIN GATING — Contrôle d'accès freemium pour So-Kin enrichi
 *
 * Matrice feature → plan :
 *
 * ┌──────────────────────────────────────┬───────┬───────┬──────────┬──────────┐
 * │ Fonctionnalité                       │ FREE  │ BOOST │ PRO/BUSI │ ADMIN    │
 * ├──────────────────────────────────────┼───────┼───────┼──────────┼──────────┤
 * │ Publier, commenter, réagir, repost   │  ✅   │  ✅   │    ✅    │    ✅    │
 * │ Feed, tendances simples              │  ✅   │  ✅   │    ✅    │    ✅    │
 * │ Insight card post (partie gratuite)  │  ✅   │  ✅   │    ✅    │    ✅    │
 * │ Dashboard auteur (partie gratuite)   │  ✅   │  ✅   │    ✅    │    ✅    │
 * │ Smart feed (public blocks)           │  ✅   │  ✅   │    ✅    │    ✅    │
 * │ Smart ideas / suggestions perso      │  ✅   │  ✅   │    ✅    │    ✅    │
 * ├──────────────────────────────────────┼───────┼───────┼──────────┼──────────┤
 * │ Analytics détaillés (post perf)      │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Analytics auteur complets (7d/30d)   │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Score détaillé + breakdown           │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Insight card premium (local, clics)  │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Dashboard premium (timing, hashtags) │  ❌   │  ❌   │    ✅    │    ✅    │
 * ├──────────────────────────────────────┼───────┼───────┼──────────┼──────────┤
 * │ Advisor IA Ads (tips auteur)         │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Boost opportunities                  │  ❌   │  ❌   │    ✅    │    ✅    │
 * │ Analyze post (IA Ads)                │  ❌   │  ❌   │    ✅    │    ✅    │
 * ├──────────────────────────────────────┼───────┼───────┼──────────┼──────────┤
 * │ Admin opportunities                  │  ❌   │  ❌   │    ❌    │    ✅    │
 * │ Batch scoring / advisor              │  ❌   │  ❌   │    ❌    │    ✅    │
 * └──────────────────────────────────────┴───────┴───────┴──────────┴──────────┘
 *
 * Intégration :
 * - Réutilise le système existant (requirePremiumSubscription, requireRoles)
 * - Ajoute un middleware souple `requireSoKinPremium` avec upsell intégré
 * - Les routes produit (insights) gèrent le split free/premium en interne
 * - Les routes analytics brutes sont bloquées au middleware
 */

import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type SoKinTier = "FREE" | "ANALYTICS" | "ADS" | "ADMIN";

export interface SoKinAccess {
  tier: SoKinTier;
  planCode: string;
  hasAnalytics: boolean;
  hasAds: boolean;
  isAdmin: boolean;
}

export interface UpsellHint {
  feature: string;
  requiredPlan: string;
  message: string;
  ctaLabel: string;
  ctaRoute: string;
}

// ═══════════════════════════════════════════════════════
// Plan codes par tier
// ═══════════════════════════════════════════════════════

/** Plans qui incluent ANALYTICS_MEDIUM ou ANALYTICS_PREMIUM */
const ANALYTICS_PLAN_CODES = new Set([
  "PRO_VENDOR",  // User tier — ANALYTICS_MEDIUM
  "BUSINESS",    // Business tier — ANALYTICS_MEDIUM
  "SCALE",       // Business tier — ANALYTICS_PREMIUM
]);

/** Plans qui incluent IA_MERCHANT (accès IA Ads) */
const ADS_PLAN_CODES = new Set([
  "FREE",        // Inclut IA_MERCHANT par défaut
  "BUSINESS",    // Business tier
  "SCALE",       // Business tier
]);

/** Combiné : plans premium So-Kin (analytics OU ads avancés) */
const PREMIUM_SOKIN_CODES = new Set([
  "PRO_VENDOR",
  "BUSINESS",
  "SCALE",
]);

// ═══════════════════════════════════════════════════════
// Core : resolver d'accès So-Kin
// ═══════════════════════════════════════════════════════

/**
 * Détermine le niveau d'accès So-Kin d'un utilisateur.
 * Résultat utilisable pour gating inline ou middleware.
 */
export async function resolveSoKinAccess(userId: string, role: string): Promise<SoKinAccess> {
  // Admin bypass
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
    return {
      tier: "ADMIN",
      planCode: "ADMIN",
      hasAnalytics: true,
      hasAds: true,
      isAdmin: true,
    };
  }

  // Chercher l'abonnement actif
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) {
    return { tier: "FREE", planCode: "NONE", hasAnalytics: false, hasAds: false, isAdmin: false };
  }

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const sub = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { planCode: true },
  });

  const planCode = sub?.planCode?.toUpperCase() ?? "FREE";
  const hasAnalytics = ANALYTICS_PLAN_CODES.has(planCode);
  const hasAds = PREMIUM_SOKIN_CODES.has(planCode);

  let tier: SoKinTier = "FREE";
  if (hasAnalytics && hasAds) tier = "ADS"; // inclut analytics
  else if (hasAnalytics) tier = "ANALYTICS";
  else if (hasAds) tier = "ADS";

  return { tier, planCode, hasAnalytics, hasAds, isAdmin: false };
}

// ═══════════════════════════════════════════════════════
// Middlewares Express
// ═══════════════════════════════════════════════════════

/**
 * Middleware : bloque si l'utilisateur n'a pas un plan premium So-Kin.
 * Retourne 403 avec un upsell hint JSON au lieu d'un message générique.
 *
 * Usage : router.get("/analytics/post/:id", requireAuth, requireSoKinAnalytics, handler)
 */
export async function requireSoKinAnalytics(req: AuthenticatedRequest, _res: any, next: any) {
  const access = await resolveSoKinAccess(req.auth!.userId, req.auth!.role);
  if (access.hasAnalytics || access.isAdmin) {
    (req as any)._sokinAccess = access;
    return next();
  }
  throw new HttpError(403, JSON.stringify({
    error: "Abonnement Analytics requis",
    upsell: {
      feature: "So-Kin Analytics",
      requiredPlan: "PRO_VENDOR",
      message: "Passez au plan Pro Vendeur pour débloquer les analytics avancés de vos publications.",
      ctaLabel: "Voir les forfaits",
      ctaRoute: "/plans",
    } satisfies UpsellHint,
  }));
}

/**
 * Middleware : bloque si l'utilisateur n'a pas un plan premium So-Kin (Ads).
 * Pour les fonctions IA Ads avancées (tips, analyze, boost).
 *
 * Usage : router.get("/advisor/tips", requireAuth, requireSoKinAds, handler)
 */
export async function requireSoKinAds(req: AuthenticatedRequest, _res: any, next: any) {
  const access = await resolveSoKinAccess(req.auth!.userId, req.auth!.role);
  if (access.hasAds || access.isAdmin) {
    (req as any)._sokinAccess = access;
    return next();
  }
  throw new HttpError(403, JSON.stringify({
    error: "Abonnement Premium requis",
    upsell: {
      feature: "Conseils IA Ads So-Kin",
      requiredPlan: "PRO_VENDOR",
      message: "Passez au plan Pro Vendeur pour recevoir des conseils IA personnalisés sur vos publications.",
      ctaLabel: "Voir les forfaits",
      ctaRoute: "/plans",
    } satisfies UpsellHint,
  }));
}

/**
 * Middleware : admin uniquement (ADMIN ou SUPER_ADMIN).
 * Pour les fonctions batch, admin opportunities, etc.
 */
export function requireSoKinAdmin(req: AuthenticatedRequest, _res: any, next: any) {
  const role = req.auth!.role;
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN) return next();
  throw new HttpError(403, "Accès réservé aux administrateurs.");
}

// ═══════════════════════════════════════════════════════
// Upsell hints (pour les routes free qui veulent teaser)
// ═══════════════════════════════════════════════════════

export function getAnalyticsUpsell(): UpsellHint {
  return {
    feature: "Analytics avancés",
    requiredPlan: "PRO_VENDOR",
    message: "Débloquez les statistiques détaillées, timings optimaux et comparatifs de performance.",
    ctaLabel: "Passer au Pro",
    ctaRoute: "/plans",
  };
}

export function getAdsUpsell(): UpsellHint {
  return {
    feature: "Conseils IA Ads",
    requiredPlan: "PRO_VENDOR",
    message: "Recevez des recommandations de boost et des conseils créatifs pour vos publications.",
    ctaLabel: "Passer au Pro",
    ctaRoute: "/plans",
  };
}
