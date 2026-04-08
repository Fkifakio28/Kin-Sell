/**
 * AI TRIGGER SERVICE — Moteur de déclenchement intelligent
 *
 * Écoute les événements métier et génère des AiRecommendation.
 * C'est le "vendeur invisible" de Kin-Sell.
 *
 * Triggers :
 * - LISTING_PUBLISHED  → IA Ads propose boost
 * - MULTI_LISTINGS     → IA Ads propose boost boutique (après 5+ articles)
 * - SALES_GROWTH       → IA Ads/Analytics propose upgrade
 * - SHOP_CREATED       → IA Analytics apprend domaine, propose essai
 * - STAGNATION         → IA Analytics détecte, propose conseil
 * - TRIAL_SUGGEST      → IA Analytics propose période d'essai
 * - UPSELL             → IA Commande propose vente automatique
 */

import { prisma } from "../../shared/db/prisma.js";
import { getMarketMedian, computePricePosition } from "../../shared/market/market-shared.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { computeSellerProfile, generateSmartOffers, type SellerProfile, type SmartOffer } from "../ads/ai-ads-engine.service.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getUserContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      profile: { select: { displayName: true, city: true, country: true } },
    },
  });
  if (!user) return null;

  const business = user.role === "BUSINESS"
    ? await prisma.businessAccount.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, publicName: true, description: true, subscriptionStatus: true },
    })
    : null;

  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { userId, status: "ACTIVE" },
        ...(business ? [{ businessId: business.id, status: "ACTIVE" as const }] : []),
      ],
    },
    select: { planCode: true, status: true, endsAt: true },
  });

  const activeTrial = await prisma.aiTrial.findFirst({
    where: {
      userId,
      status: { in: ["PROPOSED", "ACTIVE"] },
    },
    select: { id: true, status: true, planCode: true, endsAt: true },
  });

  const listingCount = await prisma.listing.count({
    where: { ownerUserId: userId, status: "ACTIVE" },
  });

  const completedOrderCount = await prisma.order.count({
    where: { sellerUserId: userId, status: "DELIVERED" },
  });

  return {
    user,
    business,
    subscription,
    activeTrial,
    listingCount,
    completedOrderCount,
    isBusiness: user.role === "BUSINESS",
    hasPaidPlan: !!subscription && subscription.planCode !== "FREE" && subscription.planCode !== "STARTER",
  };
}

async function hasRecentRecommendation(userId: string, triggerType: string, hoursBack = 24): Promise<boolean> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const count = await prisma.aiRecommendation.count({
    where: {
      userId,
      triggerType,
      createdAt: { gte: since },
    },
  });
  return count > 0;
}

async function createRecommendation(data: {
  engineKey: string;
  userId: string;
  businessId?: string | null;
  accountType: string;
  triggerType: string;
  title: string;
  message: string;
  actionType: string;
  actionTarget?: string;
  actionData?: Record<string, unknown>;
  priority?: number;
  expiresInHours?: number;
}) {
  return prisma.aiRecommendation.create({
    data: {
      engineKey: data.engineKey,
      userId: data.userId,
      businessId: data.businessId ?? undefined,
      accountType: data.accountType,
      triggerType: data.triggerType,
      title: data.title,
      message: data.message,
      actionType: data.actionType,
      actionTarget: data.actionTarget ?? null,
      actionData: (data.actionData as any) ?? undefined,
      priority: data.priority ?? 5,
      expiresAt: data.expiresInHours
        ? new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000)
        : null,
    },
  });
}

// ─────────────────────────────────────────────
// TRIGGER 1: Article publié → IA Ads boost
// ─────────────────────────────────────────────

export async function onListingPublished(userId: string, listingId: string) {
  const ctx = await getUserContext(userId);
  if (!ctx) return null;

  // Anti-spam: max 1 recommandation boost/24h
  if (await hasRecentRecommendation(userId, "LISTING_PUBLISHED", 24)) return null;

  // Récupérer l'article
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, category: true, city: true, priceUsdCents: true },
  });
  if (!listing) return null;

  // ── Moteur intelligent : profiler le vendeur et générer des offres adaptées ──
  const profile = await computeSellerProfile(userId);
  if (profile) {
    const smartOffers = await generateSmartOffers(profile, {
      event: "LISTING_PUBLISHED",
      listingId,
      listingTitle: listing.title,
      listingCategory: listing.category,
    });

    const results = [];
    for (const offer of smartOffers) {
      // Anti-spam par triggerType
      if (await hasRecentRecommendation(userId, offer.triggerType, 24)) continue;
      const rec = await createRecommendation({
        engineKey: offer.engineKey,
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: offer.triggerType,
        title: offer.title,
        message: offer.message,
        actionType: offer.actionType,
        actionTarget: offer.actionTarget,
        actionData: offer.actionData,
        priority: offer.priority,
        expiresInHours: offer.expiresInHours,
      });
      results.push(rec);
    }

    // Toujours ajouter l'info prix marché sur le premier résultat
    if (results.length === 0) {
      // Fallback : proposer au minimum le boost classique
      let priceAdvice = "";
      try {
        const marketData = await getMarketMedian(listing.category, listing.city);
        if (marketData && marketData.medianPriceCents > 0 && listing.priceUsdCents > 0) {
          const result = computePricePosition(listing.priceUsdCents, marketData.medianPriceCents);
          if (result.position === "ABOVE_MARKET") {
            priceAdvice = `\n\n💰 Prix marché estimé : ${(marketData.medianPriceCents / 100).toFixed(2)}$. Votre prix est au-dessus du marché — un boost aiderait la visibilité.`;
          } else if (result.position === "ON_MARKET") {
            priceAdvice = `\n\n✅ Votre prix est bien positionné par rapport au marché.`;
          }
        }
      } catch { /* market data not available */ }

      const rec = await createRecommendation({
        engineKey: "ads",
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: "LISTING_PUBLISHED",
        title: "Booster votre article ?",
        message: `Votre article « ${listing.title} » est maintenant publié ! Voulez-vous booster sa visibilité pour attirer plus d'acheteurs ?${priceAdvice}`,
        actionType: "BOOST_ARTICLE",
        actionTarget: listingId,
        actionData: { listingId, listingTitle: listing.title, category: listing.category },
        priority: 6,
        expiresInHours: 72,
      });
      results.push(rec);
    }

    // Check multi-listings trigger
    if (ctx.listingCount >= 5) {
      await onMultiListings(userId, ctx);
    }

    return results[0] ?? null;
  }

  // Fallback si le profil n'est pas calculable
  let priceAdvice = "";
  try {
    const marketData = await getMarketMedian(listing.category, listing.city);
    if (marketData && marketData.medianPriceCents > 0 && listing.priceUsdCents > 0) {
      const result = computePricePosition(listing.priceUsdCents, marketData.medianPriceCents);
      if (result.position === "ABOVE_MARKET") {
        priceAdvice = `\n\n💰 Prix marché estimé : ${(marketData.medianPriceCents / 100).toFixed(2)}$. Votre prix est au-dessus du marché — un boost aiderait la visibilité.`;
      } else if (result.position === "ON_MARKET") {
        priceAdvice = `\n\n✅ Votre prix est bien positionné par rapport au marché.`;
      }
    }
  } catch { /* market data not available */ }

  const rec = await createRecommendation({
    engineKey: "ads",
    userId: ctx.user.id,
    businessId: ctx.business?.id,
    accountType: ctx.isBusiness ? "BUSINESS" : "USER",
    triggerType: "LISTING_PUBLISHED",
    title: "Booster votre article ?",
    message: `Votre article « ${listing.title} » est maintenant publié ! Voulez-vous booster sa visibilité pour attirer plus d'acheteurs ?${priceAdvice}`,
    actionType: "BOOST_ARTICLE",
    actionTarget: listingId,
    actionData: { listingId, listingTitle: listing.title, category: listing.category },
    priority: 6,
    expiresInHours: 72,
  });

  if (ctx.listingCount >= 5) {
    await onMultiListings(userId, ctx);
  }

  return rec;
}

// ─────────────────────────────────────────────
// TRIGGER 2: +5 articles → boost boutique
// ─────────────────────────────────────────────

async function onMultiListings(userId: string, ctx?: Awaited<ReturnType<typeof getUserContext>>) {
  if (!ctx) ctx = await getUserContext(userId);
  if (!ctx) return null;

  if (await hasRecentRecommendation(userId, "MULTI_LISTINGS", 168)) return null; // 7 jours

  return createRecommendation({
    engineKey: "ads",
    userId: ctx.user.id,
    businessId: ctx.business?.id,
    accountType: ctx.isBusiness ? "BUSINESS" : "USER",
    triggerType: "MULTI_LISTINGS",
    title: "Mettre en avant votre boutique",
    message: `Vous avez ${ctx.listingCount} articles actifs ! Mettez en avant votre boutique pour attirer plus d'acheteurs et augmenter vos ventes.`,
    actionType: "BOOST_SHOP",
    actionTarget: "/pricing",
    actionData: { listingCount: ctx.listingCount },
    priority: 7,
    expiresInHours: 168,
  });
}

// ─────────────────────────────────────────────
// TRIGGER 3: Boutique créée → IA Analytics
// ─────────────────────────────────────────────

export async function onShopCreated(userId: string, businessId: string) {
  const ctx = await getUserContext(userId);
  if (!ctx || !ctx.business) return null;

  return createRecommendation({
    engineKey: "analytics",
    userId: ctx.user.id,
    businessId: ctx.business.id,
    accountType: "BUSINESS",
    triggerType: "SHOP_CREATED",
    title: "Bienvenue sur Kin-Sell !",
    message: `Votre boutique « ${ctx.business.publicName} » est prête ! Kin-Sell Analytique apprend votre domaine pour vous proposer des recommandations personnalisées. Configurez votre boutique pour de meilleurs conseils.`,
    actionType: "VIEW_ANALYTICS",
    actionTarget: "/dashboard/analytics",
    actionData: { businessId, businessName: ctx.business.publicName },
    priority: 8,
    expiresInHours: 168,
  });
}

// ─────────────────────────────────────────────
// TRIGGER 4: Ventes → proposer essai / upgrade
// ─────────────────────────────────────────────

export async function onSaleCompleted(userId: string, orderId: string) {
  const ctx = await getUserContext(userId);
  if (!ctx) return null;

  const results: Array<Awaited<ReturnType<typeof createRecommendation>>> = [];

  // ── Moteur intelligent : profiler le vendeur et générer des offres adaptées ──
  const profile = await computeSellerProfile(userId);
  if (profile) {
    const smartOffers = await generateSmartOffers(profile, { event: "SALE_COMPLETED" });
    for (const offer of smartOffers) {
      if (await hasRecentRecommendation(userId, offer.triggerType, 168)) continue;
      const rec = await createRecommendation({
        engineKey: offer.engineKey,
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: offer.triggerType,
        title: offer.title,
        message: offer.message,
        actionType: offer.actionType,
        actionTarget: offer.actionTarget,
        actionData: offer.actionData,
        priority: offer.priority,
        expiresInHours: offer.expiresInHours,
      });
      results.push(rec);
    }
    if (results.length > 0) return results;
  }

  // ── Fallback : logique originale ──

  // après 3+ ventes sans abonnement payant → proposer essai
  if (ctx.completedOrderCount >= 3 && !ctx.hasPaidPlan && !ctx.activeTrial) {
    const suggestedPlan = ctx.isBusiness
      ? (ctx.completedOrderCount >= 10 ? "SCALE" : "BUSINESS")
      : "PRO_VENDOR";

    // Créer le trial
    const trial = await prisma.aiTrial.create({
      data: {
        userId: ctx.user.id,
        businessId: ctx.business?.id ?? undefined,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        planCode: suggestedPlan,
        sourceEngine: "analytics",
        reason: `${ctx.completedOrderCount} ventes réalisées sans abonnement`,
        status: "PROPOSED",
        endsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 jours
      },
    });

    if (await hasRecentRecommendation(userId, "TRIAL_SUGGEST", 168) === false) {
      const rec = await createRecommendation({
        engineKey: "analytics",
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: "TRIAL_SUGGEST",
        title: "🎁 Essai gratuit 15 jours",
        message: `Félicitations pour vos ${ctx.completedOrderCount} ventes ! Kin-Sell vous offre un essai gratuit du forfait ${suggestedPlan} pendant 15 jours. Analyses marché, recommandations prix et bien plus. Paiement via PayPal après l'essai.`,
        actionType: "ACTIVATE_TRIAL",
        actionTarget: trial.id,
        actionData: { trialId: trial.id, suggestedPlan, salesCount: ctx.completedOrderCount, paymentMethod: "PayPal uniquement" },
        priority: 9,
        expiresInHours: 168,
      });
      results.push(rec);
    }
  }

  // après 5+ ventes → proposer vente automatique (IA Commande)
  if (ctx.completedOrderCount >= 5 && !ctx.hasPaidPlan) {
    if (await hasRecentRecommendation(userId, "UPSELL", 168) === false) {
      const rec = await createRecommendation({
        engineKey: "order",
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: "UPSELL",
        title: "Passer à la vente automatique ?",
        message: `Vous avez ${ctx.completedOrderCount} ventes ! Kin-Sell peut publier vos articles et gérer la vente pour vous : marchandage semi-automatique, commandes, suivi livraison et notification finale. Activation via PayPal.`,
        actionType: "ENABLE_AUTO_SALES",
        actionTarget: "/pricing",
        actionData: { salesCount: ctx.completedOrderCount, suggestedPlan: ctx.isBusiness ? "SCALE" : "AUTO", paymentMethod: "PayPal uniquement" },
        priority: 8,
        expiresInHours: 336,
      });
      results.push(rec);
    }
  }

  // croissance ventes → upgrade
  if (ctx.completedOrderCount >= 10 && ctx.hasPaidPlan) {
    if (await hasRecentRecommendation(userId, "SALES_GROWTH", 336) === false) {
      const rec = await createRecommendation({
        engineKey: "ads",
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: "SALES_GROWTH",
        title: "Votre activité décolle !",
        message: `Avec ${ctx.completedOrderCount} ventes, vous performez bien ! Passez au niveau supérieur pour accéder aux analyses avancées et à l'automatisation complète. Paiement via PayPal.`,
        actionType: "UPGRADE_PLAN",
        actionTarget: "/pricing",
        actionData: { salesCount: ctx.completedOrderCount, paymentMethod: "PayPal uniquement" },
        priority: 7,
        expiresInHours: 336,
      });
      results.push(rec);
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// TRIGGER 5: Article avec mauvaise performance
// ─────────────────────────────────────────────

export async function checkStagnation(userId: string) {
  const ctx = await getUserContext(userId);
  if (!ctx) return null;

  if (await hasRecentRecommendation(userId, "STAGNATION", 168)) return null;

  // ── Moteur intelligent : profiler et proposer l'offre adaptée ──
  const profile = await computeSellerProfile(userId);
  if (profile && profile.hasStagnantListings) {
    const smartOffers = await generateSmartOffers(profile, { event: "STAGNATION_CHECK" });
    const results = [];
    for (const offer of smartOffers) {
      if (await hasRecentRecommendation(userId, offer.triggerType, 168)) continue;
      const rec = await createRecommendation({
        engineKey: offer.engineKey,
        userId: ctx.user.id,
        businessId: ctx.business?.id,
        accountType: ctx.isBusiness ? "BUSINESS" : "USER",
        triggerType: offer.triggerType,
        title: offer.title,
        message: offer.message,
        actionType: offer.actionType,
        actionTarget: offer.actionTarget,
        actionData: offer.actionData,
        priority: offer.priority,
        expiresInHours: offer.expiresInHours,
      });
      results.push(rec);
    }
    if (results.length > 0) return results[0];
  }

  // ── Fallback : logique originale ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldListings = await prisma.listing.findMany({
    where: {
      ownerUserId: userId,
      status: "ACTIVE",
      createdAt: { lte: sevenDaysAgo },
    },
    select: { id: true, title: true, _count: { select: { negotiations: true } } },
    take: 10,
  });
  const stagnantListings = oldListings.filter((l) => l._count.negotiations < 2).slice(0, 3);

  if (stagnantListings.length === 0) return null;

  const titles = stagnantListings.map((l) => l.title).join(", ");

  return createRecommendation({
    engineKey: "analytics",
    userId: ctx.user.id,
    businessId: ctx.business?.id,
    accountType: ctx.isBusiness ? "BUSINESS" : "USER",
    triggerType: "STAGNATION",
    title: "Articles en stagnation",
    message: `Vos articles « ${titles} » ont peu de vues après 7 jours. Voulez-vous booster leur visibilité ou ajuster vos prix ?`,
    actionType: "PRICE_ADVICE",
    actionTarget: stagnantListings[0].id,
    actionData: { stagnantIds: stagnantListings.map((l) => l.id) },
    priority: 6,
    expiresInHours: 168,
  });
}

// ─────────────────────────────────────────────
// Get active recommendations for a user
// ─────────────────────────────────────────────

export async function getActiveRecommendations(userId: string) {
  const now = new Date();
  return prisma.aiRecommendation.findMany({
    where: {
      userId,
      dismissed: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 10,
  });
}

// ─────────────────────────────────────────────
// Seller profile — expose le profil IA du vendeur
// ─────────────────────────────────────────────

export async function getSellerProfile(userId: string) {
  return computeSellerProfile(userId);
}

// ─────────────────────────────────────────────
// Periodic smart check — déclenché par le scheduler
// Analyse un utilisateur et génère des recommandations
// basées sur son profil complet (abonnement, budget, lifecycle)
// ─────────────────────────────────────────────

export async function runPeriodicSmartCheck(userId: string) {
  const ctx = await getUserContext(userId);
  if (!ctx) return [];

  // Anti-spam global : max 1 check périodique / 7 jours
  if (await hasRecentRecommendation(userId, "PERIODIC_SMART", 168)) return [];

  const profile = await computeSellerProfile(userId);
  if (!profile) return [];

  const smartOffers = await generateSmartOffers(profile, { event: "PERIODIC" });
  const results = [];

  for (const offer of smartOffers) {
    if (await hasRecentRecommendation(userId, offer.triggerType, 168)) continue;
    const rec = await createRecommendation({
      engineKey: offer.engineKey,
      userId: ctx.user.id,
      businessId: ctx.business?.id,
      accountType: ctx.isBusiness ? "BUSINESS" : "USER",
      triggerType: offer.triggerType,
      title: offer.title,
      message: offer.message,
      actionType: offer.actionType,
      actionTarget: offer.actionTarget,
      actionData: offer.actionData,
      priority: offer.priority,
      expiresInHours: offer.expiresInHours,
    });
    results.push(rec);
  }

  return results;
}

// ─────────────────────────────────────────────
// Dismiss / interact with recommendation
// ─────────────────────────────────────────────

export async function dismissRecommendation(userId: string, recommendationId: string) {
  return prisma.aiRecommendation.updateMany({
    where: { id: recommendationId, userId },
    data: { dismissed: true },
  });
}

export async function clickRecommendation(userId: string, recommendationId: string) {
  return prisma.aiRecommendation.updateMany({
    where: { id: recommendationId, userId },
    data: { clicked: true, displayedAt: new Date() },
  });
}

export async function acceptRecommendation(userId: string, recommendationId: string) {
  return prisma.aiRecommendation.updateMany({
    where: { id: recommendationId, userId },
    data: { accepted: true, clicked: true },
  });
}

// ─────────────────────────────────────────────
// TRIAL management
// ─────────────────────────────────────────────

/**
 * Demande d'activation d'un essai par l'utilisateur.
 * Ne crée PAS de souscription — passe le trial en PENDING_ADMIN.
 * L'admin utilise adminActivateTrial() pour valider.
 */
export async function requestTrialActivation(userId: string, trialId: string) {
  const trial = await prisma.aiTrial.findFirst({
    where: { id: trialId, userId, status: "PROPOSED" },
  });
  if (!trial) return null;

  // Déduplication
  const existingActive = await prisma.subscription.findFirst({
    where: { userId, planCode: trial.planCode, status: "ACTIVE" },
  });
  if (existingActive) {
    throw new HttpError(409, 'Vous avez déjà un abonnement actif pour ce forfait.');
  }

  const alreadyTrialed = await prisma.aiTrial.findFirst({
    where: { userId, planCode: trial.planCode, status: { in: ["ACTIVE", "PENDING_ADMIN"] }, id: { not: trialId } },
  });
  if (alreadyTrialed) {
    throw new HttpError(409, 'Vous avez déjà un essai en cours pour ce forfait.');
  }

  const updated = await prisma.aiTrial.update({
    where: { id: trialId },
    data: { status: "PENDING_ADMIN" },
  });

  return updated;
}

/**
 * Activation effective d'un essai — appelée UNIQUEMENT par l'admin.
 * Crée la souscription ACTIVE avec période de 15 jours.
 */
export async function adminActivateTrial(adminUserId: string, trialId: string) {
  const trial = await prisma.aiTrial.findFirst({
    where: { id: trialId, status: "PENDING_ADMIN" },
  });
  if (!trial) return null;

  const startsAt = new Date();
  const endsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  const updated = await prisma.aiTrial.update({
    where: { id: trialId },
    data: {
      status: "ACTIVE",
      startsAt,
      endsAt,
      activatedAt: startsAt,
      activatedBy: adminUserId,
    },
  });

  const ctx = await getUserContext(trial.userId);
  const scope = ctx?.isBusiness ? "BUSINESS" : "USER";

  await prisma.subscription.create({
    data: {
      scope: scope as any,
      userId: scope === "USER" ? trial.userId : null,
      businessId: scope === "BUSINESS" && ctx?.business ? ctx.business.id : null,
      planCode: trial.planCode,
      status: "ACTIVE",
      billingCycle: "ONE_TIME" as any,
      priceUsdCents: 0,
      startsAt,
      endsAt,
      autoRenew: false,
      metadata: {
        isTrial: true,
        trialId: trial.id,
        sourceEngine: trial.sourceEngine,
      },
    },
  });

  await prisma.aiRecommendation.updateMany({
    where: { userId: trial.userId, triggerType: "TRIAL_SUGGEST", dismissed: false },
    data: { accepted: true },
  });

  return updated;
}

export async function getMyTrials(userId: string) {
  return prisma.aiTrial.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function declineTrial(userId: string, trialId: string) {
  return prisma.aiTrial.updateMany({
    where: { id: trialId, userId, status: "PROPOSED" },
    data: { status: "DECLINED" },
  });
}

// ─────────────────────────────────────────────
// Admin: get all recommendations stats
// ─────────────────────────────────────────────

export async function getRecommendationStats() {
  const [total, active, clicked, accepted, dismissed, byEngine, byTrigger, trialStats] = await Promise.all([
    prisma.aiRecommendation.count(),
    prisma.aiRecommendation.count({ where: { dismissed: false } }),
    prisma.aiRecommendation.count({ where: { clicked: true } }),
    prisma.aiRecommendation.count({ where: { accepted: true } }),
    prisma.aiRecommendation.count({ where: { dismissed: true } }),
    prisma.aiRecommendation.groupBy({
      by: ["engineKey"],
      _count: { id: true },
    }),
    prisma.aiRecommendation.groupBy({
      by: ["triggerType"],
      _count: { id: true },
    }),
    prisma.aiTrial.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  return {
    recommendations: {
      total,
      active,
      clicked,
      accepted,
      dismissed,
      clickRate: total > 0 ? Math.round((clicked / total) * 100) : 0,
      acceptRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      byEngine: byEngine.map((e) => ({ engine: e.engineKey, count: e._count.id })),
      byTrigger: byTrigger.map((t) => ({ trigger: t.triggerType, count: t._count.id })),
    },
    trials: {
      byStatus: trialStats.map((s) => ({ status: s.status, count: s._count.id })),
      total: trialStats.reduce((acc, s) => acc + s._count.id, 0),
    },
  };
}

// ─────────────────────────────────────────────
// Admin: manual trial / subscription management
// ─────────────────────────────────────────────

export async function adminActivatePlan(params: {
  userId: string;
  planCode: string;
  durationDays: number;
  reason: string;
  exempt: boolean; // gratuit, pas de paiement
  activatedBy: string; // admin userId
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, role: true },
  });
  if (!user) return null;

  const business = user.role === "BUSINESS"
    ? await prisma.businessAccount.findFirst({ where: { ownerUserId: params.userId } })
    : null;

  const scope = user.role === "BUSINESS" ? "BUSINESS" : "USER";
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + params.durationDays * 24 * 60 * 60 * 1000);

  // Cancel existing active subscription
  await prisma.subscription.updateMany({
    where: {
      OR: [
        { userId: params.userId, status: "ACTIVE" },
        ...(business ? [{ businessId: business.id, status: "ACTIVE" as const }] : []),
      ],
    },
    data: { status: "CANCELED", endsAt: new Date() },
  });

  // Create new subscription
  const sub = await prisma.subscription.create({
    data: {
      scope: scope as any,
      userId: scope === "USER" ? params.userId : null,
      businessId: scope === "BUSINESS" && business ? business.id : null,
      planCode: params.planCode,
      status: "ACTIVE",
      billingCycle: "ONE_TIME" as any,
      priceUsdCents: params.exempt ? 0 : undefined,
      startsAt,
      endsAt,
      autoRenew: false,
      metadata: {
        adminActivated: true,
        activatedBy: params.activatedBy,
        reason: params.reason,
        exempt: params.exempt,
      },
    },
  });

  if (business) {
    await prisma.businessAccount.update({
      where: { id: business.id },
      data: { subscriptionStatus: params.planCode },
    });
  }

  return sub;
}
