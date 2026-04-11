/**
 * SUBSCRIPTION GUARD — Kin-Sell
 *
 * Utilitaire pour vérifier si un utilisateur a accès à une fonctionnalité IA
 * en fonction de son abonnement actif + addons.
 *
 * Utilisé par les batch IA pour filtrer les users sans abonnement valide.
 *
 * Logique :
 *   1. IA_MERCHANT est GRATUIT pour tous les comptes USER (early return)
 *   2. Récupérer l'abonnement ACTIF (status=ACTIVE + endsAt non dépassé)
 *   3. Vérifier si le plan inclut la feature IA
 *   4. OU vérifier si un addon actif donne la feature
 *
 * Cache en mémoire par session batch (évite N*2 requêtes DB).
 *
 * ── API publique ──
 *   • assertIaAccess(userId, feature)       → throw 403 (services/batch)
 *   • assertAddonAccess(userId, addonCode)  → throw 403 (services)
 *   • assertFeatureAccess(userId, code)     → unifié IA + addon
 *   • checkIaAccessOrLog(userId, f, source) → bool + log warn (boucles batch)
 *   • requireIa(feature)                   → middleware Express
 *   • userHasIaAccess(userId, feature)      → bool simple
 *   • checkIaAccess(userId, feature)        → détails {hasAccess, planCode, source}
 *   • logBatchSkip(userId, feature, source) → log warn standalone
 *
 * ── HOOK TEMPS RÉEL (PROPOSITION FUTURE) ──
 *
 *   Objectif : invalider le frontend instantanément quand un abonnement change.
 *
 *   Architecture proposée :
 *     1. Événement Socket.IO : "subscription:updated"
 *        - Émis depuis billing.service.ts lors de :
 *          • activateSubscriptionFromOrder()
 *          • cancelSubscription()
 *          • runSubscriptionExpiryCheck() (quand expiredSubs.count > 0)
 *        - Payload : { userId, planCode, status, features: string[] }
 *
 *     2. Point d'émission (backend) :
 *        import { getIO } from "../shared/socket.js";
 *        getIO().to(`user:${userId}`).emit("subscription:updated", payload);
 *
 *     3. Réception (frontend) :
 *        socket.on("subscription:updated", (data) => {
 *          queryClient.invalidateQueries({ queryKey: ["billing", "active-plan"] });
 *          // + cleanup localStorage si accès perdu
 *        });
 *
 *     4. Bénéfice : remplacerait le refetch 5min actuel par une invalidation < 1s.
 *        Pas prioritaire car le backend bloque déjà les mutations
 *        (la latence frontend n'est qu'un problème d'UX, pas de sécurité).
 *
 *     5. Effort estimé : ~30 lignes de code, 3 fichiers.
 */

import { AddonCode, AddonStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { PLAN_CATALOG } from "../../modules/billing/billing.catalog.js";
import { HttpError } from "../errors/http-error.js";
import { logger } from "../logger.js";
import type { AuthenticatedRequest } from "../auth/auth-middleware.js";

// ── Types ──────────────────────────────────────────────────

export type IaFeature = "IA_MERCHANT" | "IA_ORDER";
export type FeatureOrAddon = IaFeature | AddonCode;

interface SubscriptionAccess {
  hasAccess: boolean;
  planCode: string;
  source: "PLAN_FEATURE" | "ADDON" | "FREE_DEFAULT" | "NONE";
}

// ── Cache batch ────────────────────────────────────────────

const _batchCache = new Map<string, SubscriptionAccess>();
let _batchCacheExpiry = 0;

/** Réinitialise le cache (appelé en début de chaque cycle batch) */
export function clearSubscriptionCache(): void {
  _batchCache.clear();
  _batchCacheExpiry = 0;
}

function getCacheKey(userId: string, feature: IaFeature): string {
  return `${userId}:${feature}`;
}

// ── Core check ─────────────────────────────────────────────

/**
 * Vérifie si un utilisateur a accès à une fonctionnalité IA.
 * Résultat mis en cache pendant la durée du batch (max 15min).
 */
export async function userHasIaAccess(userId: string, feature: IaFeature): Promise<boolean> {
  const result = await checkIaAccess(userId, feature);
  return result.hasAccess;
}

/**
 * Vérifie l'accès IA avec détails (source de l'accès).
 */
export async function checkIaAccess(userId: string, feature: IaFeature): Promise<SubscriptionAccess> {
  // Cache check
  const now = Date.now();
  if (now < _batchCacheExpiry) {
    const cached = _batchCache.get(getCacheKey(userId, feature));
    if (cached) return cached;
  } else {
    // Expirer le cache toutes les 15 minutes
    _batchCache.clear();
    _batchCacheExpiry = now + 15 * 60 * 1000;
  }

  const result = await _resolveAccess(userId, feature);
  _batchCache.set(getCacheKey(userId, feature), result);
  return result;
}

// ── Express middleware factories ───────────────────────────

/**
 * Middleware Express : vérifie que l'utilisateur a accès à une feature IA.
 * Usage : router.get("/ai/foo", requireAuth, requireIa("IA_MERCHANT"), handler)
 */
export function requireIa(feature: IaFeature) {
  return async (req: AuthenticatedRequest, _res: any, next: any) => {
    const hasAccess = await userHasIaAccess(req.auth!.userId, feature);
    if (!hasAccess) throw new HttpError(403, "Abonnement requis pour accéder à cette fonctionnalité IA.");
    next();
  };
}

// ── Throwing guards (services / batch) ────────────────────

/**
 * Garde-fou dur pour les services et batch jobs.
 * Vérifie que l'utilisateur a accès à une feature IA ; throw HttpError(403) sinon.
 * Usage : await assertIaAccess(userId, "IA_MERCHANT");
 */
export async function assertIaAccess(userId: string, feature: IaFeature): Promise<void> {
  const result = await checkIaAccess(userId, feature);
  if (!result.hasAccess) {
    logger.warn(
      { userId, feature, planCode: result.planCode, source: result.source, guard: "assertIaAccess" },
      "[SUBSCRIPTION GUARD] Accès IA refusé — feature=%s user=%s plan=%s",
      feature, userId, result.planCode,
    );
    throw new HttpError(403, "Abonnement requis pour accéder à cette fonctionnalité IA.");
  }
}

/**
 * Garde-fou dur pour les addons (ex: BOOST_VISIBILITY).
 * Vérifie que l'utilisateur possède un addon actif + non expiré
 * sur un abonnement actif + non expiré.
 * throw HttpError(403) si l'addon n'est pas actif.
 */
export async function assertAddonAccess(userId: string, addonCode: AddonCode): Promise<void> {
  const now = new Date();
  const addon = await prisma.subscriptionAddon.findFirst({
    where: {
      addonCode,
      status: AddonStatus.ACTIVE,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          { OR: [{ userId }, { business: { ownerUserId: userId } }] },
        ],
      },
    },
  });
  if (!addon) {
    logger.warn(
      { userId, addonCode, guard: "assertAddonAccess" },
      "[SUBSCRIPTION GUARD] Add-on refusé — addon=%s user=%s",
      addonCode, userId,
    );
    throw new HttpError(403, "Add-on requis. Souscrivez via la page Forfaits.");
  }
}

/**
 * Garde-fou unifiée : vérifie une feature IA OU un addon selon le code passé.
 * Gère IA_MERCHANT, IA_ORDER (features IA) et BOOST_VISIBILITY, ADS_PACK, ADS_PREMIUM (addons).
 * throw HttpError(403) si accès refusé.
 *
 * Usage centralisé recommandé pour tout nouveau service/batch :
 *   await assertFeatureAccess(userId, "IA_MERCHANT");
 *   await assertFeatureAccess(userId, "BOOST_VISIBILITY");
 */
const IA_FEATURES = new Set<string>(["IA_MERCHANT", "IA_ORDER"]);

export async function assertFeatureAccess(userId: string, code: FeatureOrAddon): Promise<void> {
  if (IA_FEATURES.has(code)) {
    return assertIaAccess(userId, code as IaFeature);
  }
  return assertAddonAccess(userId, code as AddonCode);
}

/**
 * Vérifie l'accès IA en mode batch : retourne false + log warn au lieu de throw.
 * Utile dans les boucles batch pour skip + tracer sans interrompre le lot.
 */
export async function checkIaAccessOrLog(
  userId: string,
  feature: IaFeature,
  source: string,
): Promise<boolean> {
  const result = await checkIaAccess(userId, feature);
  if (!result.hasAccess) {
    logger.warn(
      { userId, feature, planCode: result.planCode, source, guard: "batch-skip" },
      "[SUBSCRIPTION GUARD] Batch skip — feature=%s user=%s plan=%s source=%s",
      feature, userId, result.planCode, source,
    );
  }
  return result.hasAccess;
}

/**
 * Middleware Express : vérifie l'abonnement Premium (PRO_VENDOR / BUSINESS / SCALE).
 * Gère correctement les scopes USER et BUSINESS.
 */
const PREMIUM_PLAN_CODES = new Set(["PRO_VENDOR", "BUSINESS", "SCALE"]);

export async function requirePremiumSubscription(req: AuthenticatedRequest, _res: any, next: any) {
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) throw new HttpError(403, "Utilisateur introuvable.");

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const subscription = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { planCode: true },
  });

  if (!subscription) throw new HttpError(403, "Abonnement Premium requis pour accéder à cette fonctionnalité.");
  if (!PREMIUM_PLAN_CODES.has(subscription.planCode.toUpperCase())) {
    throw new HttpError(403, "Abonnement Premium requis pour accéder à cette fonctionnalité.");
  }
  next();
}

async function _resolveAccess(userId: string, feature: IaFeature): Promise<SubscriptionAccess> {
  const noAccess: SubscriptionAccess = { hasAccess: false, planCode: "NONE", source: "NONE" };

  // 1. Trouver l'abonnement actif (user OU business)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      businesses: { select: { id: true }, take: 1 },
    },
  });
  if (!user) return noAccess;

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  // IA_MERCHANT is FREE for ALL user accounts — always grant access regardless of plan
  if (!isBusinessScope && feature === "IA_MERCHANT") {
    return { hasAccess: true, planCode: "FREE", source: "FREE_DEFAULT" };
  }

  const sub = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId
        ? { businessId }
        : { userId }),
      // Vérifier que l'abonnement n'est pas expiré
      OR: [
        { endsAt: null },
        { endsAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      planCode: true,
      addons: {
        where: { status: AddonStatus.ACTIVE },
        select: { addonCode: true, endsAt: true },
      },
    },
  });

  // 2. Pas d'abonnement
  if (!sub) {
    return noAccess;
  }

  // 3. Vérifier si le plan inclut la feature
  const planDef = PLAN_CATALOG.find(
    (p) => p.code === sub.planCode && p.scope === (isBusinessScope ? "BUSINESS" : "USER"),
  );
  if (planDef && planDef.features.includes(feature)) {
    return { hasAccess: true, planCode: sub.planCode, source: "PLAN_FEATURE" };
  }

  // 4. Vérifier si un addon actif donne la feature
  const addonMatch = sub.addons.find(
    (a) => a.addonCode === feature && (a.endsAt === null || a.endsAt > new Date()),
  );
  if (addonMatch) {
    return { hasAccess: true, planCode: sub.planCode, source: "ADDON" };
  }

  return { ...noAccess, planCode: sub.planCode };
}

// ── Batch helpers ──────────────────────────────────────────

/**
 * Filtre une liste d'IDs utilisateurs pour ne garder que ceux
 * ayant accès à une feature IA donnée.
 * Optimisé pour les batch : cache interne, requêtes parallèles.
 */
export async function filterUsersWithIaAccess(
  userIds: string[],
  feature: IaFeature,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  // Traiter par lots de 20 pour limiter la pression DB
  const batchSize = 20;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (uid) => ({ uid, has: await userHasIaAccess(uid, feature) })),
    );
    for (const { uid, has } of results) {
      if (has) allowed.add(uid);
    }
  }
  return allowed;
}

// ── Subscription Expiry Job ────────────────────────────────

export interface SubscriptionExpiryResult {
  expiredSubscriptions: number;
  expiredAddons: number;
}

/**
 * Expire automatiquement les abonnements et addons dont endsAt est dépassé.
 * À appeler dans le scheduler (cycle lent ou nightly).
 */
export async function runSubscriptionExpiryCheck(): Promise<SubscriptionExpiryResult> {
  const now = new Date();

  // 1. Expirer les abonnements ACTIVE dont endsAt est passé (y compris autoRenew — pas de paiement récurrent implémenté)
  const expiredSubs = await prisma.subscription.updateMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      endsAt: { lte: now },
    },
    data: {
      status: SubscriptionStatus.EXPIRED,
      autoRenew: false,
    },
  });

  // 1b. Mettre à jour BusinessAccount.subscriptionStatus pour les abonnements business expirés
  if (expiredSubs.count > 0) {
    const expiredBusinessSubs = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.EXPIRED,
        endsAt: { lte: now },
        businessId: { not: null },
      },
      select: { businessId: true },
    });

    const businessIds = expiredBusinessSubs
      .map((s) => s.businessId)
      .filter((id): id is string => id !== null);

    if (businessIds.length > 0) {
      // Ne réinitialiser que ceux qui n'ont pas un AUTRE abonnement actif
      for (const bizId of businessIds) {
        const activeReplacement = await prisma.subscription.findFirst({
          where: { businessId: bizId, status: SubscriptionStatus.ACTIVE },
        });
        if (!activeReplacement) {
          await prisma.businessAccount.update({
            where: { id: bizId },
            data: { subscriptionStatus: "FREE" },
          });
        }
      }
    }
  }

  // 2. Expirer les addons ACTIVE dont endsAt est passé
  const expiredAddons = await prisma.subscriptionAddon.updateMany({
    where: {
      status: AddonStatus.ACTIVE,
      endsAt: { lte: now },
    },
    data: {
      status: AddonStatus.DISABLED,
    },
  });

  // 3. Expirer les addons orphelins (liés à un abonnement expiré)
  const orphanAddons = await prisma.subscriptionAddon.updateMany({
    where: {
      status: AddonStatus.ACTIVE,
      subscription: {
        status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELED] },
      },
    },
    data: {
      status: AddonStatus.DISABLED,
    },
  });

  return {
    expiredSubscriptions: expiredSubs.count,
    expiredAddons: expiredAddons.count + orphanAddons.count,
  };
}

// ── Logging helper pour batch skip ─────────────────────────

/**
 * Log un refus batch de manière structurée sans interrompre le lot.
 * Usage interne dans les boucles batch qui utilisent `userHasIaAccess()` directement.
 */
export function logBatchSkip(
  userId: string,
  feature: string,
  source: string,
): void {
  logger.warn(
    { userId, feature, source, guard: "batch-skip" },
    "[SUBSCRIPTION GUARD] Batch skip — feature=%s user=%s source=%s",
    feature, userId, source,
  );
}
