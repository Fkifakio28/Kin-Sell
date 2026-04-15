/**
 * POST-PUBLISH FREEMIUM GATING
 *
 * Logique de gating "friction contrôlée" pour le conseiller IA post-publication.
 *
 * Règles :
 *   - 1 conseil gratuit pour le 1er PRODUIT publié
 *   - 1 conseil gratuit pour le 1er SERVICE publié
 *   - Plans supérieurs (AUTO, PRO_VENDOR, BUSINESS, SCALE) → accès complet
 *   - PROMO / BULK → lock total (preview uniquement)
 *   - Sinon → tout lock
 */

import { prisma } from "../../shared/db/prisma.js";
import { PLAN_CATALOG } from "../billing/billing.catalog.js";
import type { PostPublishAdvice, PostPublishReport, PublishContext } from "./post-publish-advisor.service.js";

// Plans qui donnent un accès complet au conseiller post-publish
const FULL_ACCESS_PLANS = ["AUTO", "PRO_VENDOR", "BUSINESS", "SCALE"];

// Catégories commerciales : JAMAIS floutées (elles poussent vers les forfaits)
const ALWAYS_VISIBLE_CATEGORIES = ["BOOST", "ADS_PACK", "ADS_PREMIUM", "PLAN"];

export type FreemiumMode = "FULL" | "PREVIEW" | "LOCKED";

export interface FreemiumMeta {
  mode: FreemiumMode;
  listingType: string | null;
  visibleAdviceCount: number;
  blurredAdviceCount: number;
  usedProductFree: boolean;
  usedServiceFree: boolean;
  upgradeCtaTarget: string;
  upgradeCtaLabel: string;
}

export interface GatedAdvice extends PostPublishAdvice {
  isLocked: boolean;
  lockReason: string | null;
  previewText: string | null;
}

export interface GatedPostPublishReport extends Omit<PostPublishReport, "advice"> {
  advice: GatedAdvice[];
  freemium: FreemiumMeta;
}

/**
 * Résout le plan actif d'un utilisateur (USER ou BUSINESS scope).
 */
async function resolveActivePlan(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      businesses: { select: { id: true }, take: 1 },
    },
  });
  if (!user) return null;

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const sub = await prisma.subscription.findFirst({
    where: {
      status: "ACTIVE",
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { planCode: true },
  });

  return sub?.planCode ?? "FREE";
}

/**
 * Détermine l'état freemium d'un utilisateur pour le post-publish advisor.
 */
export async function resolveFreemiumState(
  userId: string,
  ctx: PublishContext,
  listingType: string | null
): Promise<{ mode: FreemiumMode; usedProductFree: boolean; usedServiceFree: boolean; planCode: string }> {
  const planCode = (await resolveActivePlan(userId)) ?? "FREE";

  // Plans supérieurs → full access
  if (FULL_ACCESS_PLANS.includes(planCode)) {
    const usages = await prisma.aiFreemiumUsage.findMany({
      where: { userId, feature: "POST_PUBLISH_ADVISOR" },
      select: { listingType: true },
    });
    return {
      mode: "FULL",
      usedProductFree: usages.some((u) => u.listingType === "PRODUCT"),
      usedServiceFree: usages.some((u) => u.listingType === "SERVICE"),
      planCode,
    };
  }

  // PROMO / BULK → lock total (pas de free credit)
  if (ctx.type === "PROMO" || ctx.type === "BULK") {
    const usages = await prisma.aiFreemiumUsage.findMany({
      where: { userId, feature: "POST_PUBLISH_ADVISOR" },
      select: { listingType: true },
    });
    return {
      mode: "LOCKED",
      usedProductFree: usages.some((u) => u.listingType === "PRODUCT"),
      usedServiceFree: usages.some((u) => u.listingType === "SERVICE"),
      planCode,
    };
  }

  // SINGLE — vérifier les crédits gratuits
  const usages = await prisma.aiFreemiumUsage.findMany({
    where: { userId, feature: "POST_PUBLISH_ADVISOR" },
    select: { listingType: true },
  });

  const usedProductFree = usages.some((u) => u.listingType === "PRODUCT");
  const usedServiceFree = usages.some((u) => u.listingType === "SERVICE");

  const normalizedType = listingType === "SERVICE" ? "SERVICE" : "PRODUCT";
  const alreadyUsed = normalizedType === "PRODUCT" ? usedProductFree : usedServiceFree;

  if (!alreadyUsed) {
    return { mode: "PREVIEW", usedProductFree, usedServiceFree, planCode };
  }

  return { mode: "LOCKED", usedProductFree, usedServiceFree, planCode };
}

/**
 * Consomme le crédit gratuit pour un listing type donné.
 * Idempotent : si déjà consommé, ne fait rien (upsert).
 */
export async function consumeFreeCredit(
  userId: string,
  listingType: string,
  listingId: string
): Promise<void> {
  const normalizedType = listingType === "SERVICE" ? "SERVICE" : "PRODUCT";
  await prisma.aiFreemiumUsage.upsert({
    where: {
      userId_feature_listingType: {
        userId,
        feature: "POST_PUBLISH_ADVISOR",
        listingType: normalizedType,
      },
    },
    create: {
      userId,
      feature: "POST_PUBLISH_ADVISOR",
      listingType: normalizedType,
      listingId,
    },
    update: {}, // déjà consommé, rien à faire
  });
}

/**
 * Applique le gating freemium sur un rapport de conseils post-publication.
 */
export function applyFreemiumGating(
  report: PostPublishReport,
  mode: FreemiumMode,
  usedProductFree: boolean,
  usedServiceFree: boolean,
  listingType: string | null,
  planCode: string
): GatedPostPublishReport {
  const isUserScope = !["STARTER", "BUSINESS", "SCALE"].includes(planCode);
  const upgradeCtaTarget = isUserScope ? "/forfaits?tab=user&highlight=AUTO" : "/forfaits?tab=business&highlight=BUSINESS";
  const upgradeCtaLabel = isUserScope ? "Passer au forfait AUTO" : "Passer au forfait BUSINESS";

  if (mode === "FULL") {
    return {
      ...report,
      advice: report.advice.map((a) => ({ ...a, isLocked: false, lockReason: null, previewText: null })),
      freemium: {
        mode: "FULL",
        listingType,
        visibleAdviceCount: report.advice.length,
        blurredAdviceCount: 0,
        usedProductFree,
        usedServiceFree,
        upgradeCtaTarget,
        upgradeCtaLabel,
      },
    };
  }

  // PREVIEW: 1er conseil analytique visible, le reste lock — mais les conseils commerciaux restent toujours visibles
  if (mode === "PREVIEW") {
    const sorted = [...report.advice].sort((a, b) => b.priority - a.priority);
    let analyticalFreeUsed = false;
    const gated: GatedAdvice[] = sorted.map((a) => {
      // Les conseils commerciaux (BOOST, ADS, PLAN) ne sont JAMAIS floutés
      if (ALWAYS_VISIBLE_CATEGORIES.includes(a.category)) {
        return { ...a, isLocked: false, lockReason: null, previewText: null };
      }
      // 1er conseil analytique gratuit
      if (!analyticalFreeUsed) {
        analyticalFreeUsed = true;
        return { ...a, isLocked: false, lockReason: null, previewText: null };
      }
      return {
        ...a,
        isLocked: true,
        lockReason: "freemium_limit",
        previewText: a.title,
        message: "••• " + a.message.slice(0, 30) + "…",
        rationale: "",
      };
    });

    const visibleCount = gated.filter((a) => !a.isLocked).length;
    return {
      ...report,
      advice: gated,
      freemium: {
        mode: "PREVIEW",
        listingType,
        visibleAdviceCount: visibleCount,
        blurredAdviceCount: gated.length - visibleCount,
        usedProductFree,
        usedServiceFree,
        upgradeCtaTarget,
        upgradeCtaLabel,
      },
    };
  }

  // LOCKED: conseils analytiques lock, mais commerciaux toujours visibles
  const gated: GatedAdvice[] = report.advice.map((a) => {
    if (ALWAYS_VISIBLE_CATEGORIES.includes(a.category)) {
      return { ...a, isLocked: false, lockReason: null, previewText: null };
    }
    return {
      ...a,
      isLocked: true,
      lockReason: "freemium_exhausted",
      previewText: a.title,
      message: "••• " + a.message.slice(0, 30) + "…",
      rationale: "",
    };
  });

  const visibleCountLocked = gated.filter((a) => !a.isLocked).length;
  return {
    ...report,
    advice: gated,
    freemium: {
      mode: "LOCKED",
      listingType,
      visibleAdviceCount: visibleCountLocked,
      blurredAdviceCount: gated.length - visibleCountLocked,
      usedProductFree,
      usedServiceFree,
      upgradeCtaTarget,
      upgradeCtaLabel,
    },
  };
}
