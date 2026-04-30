/**
 * IA ORCHESTRATEUR — Central AI Coordinator
 *
 * Coordonne tous les agents IA de la plateforme.
 *
 * Diagnostic complet d'un compte vendeur :
 * → Détecte les problèmes clés
 * → Identifie quel agent IA peut résoudre chaque problème
 * → Retourne un plan d'action priorisé
 *
 * Exemple réel :
 *   Beaucoup de vues → peu de ventes
 *   → IA Analytique détecte
 *   → IA Marchand propose négociation
 *   → IA Ads propose boost ciblé
 *   → IA Commande optimise conversion
 */

import { CartStatus } from "../../shared/db/prisma-enums.js";
import { prisma } from "../../shared/db/prisma.js";

export type IssueSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AgentName = "IA_MARCHAND" | "IA_COMMANDE" | "IA_ADS" | "IA_ANALYTIQUE" | "IA_LISTING_QUALITY" | "IA_PRICE_ADVISOR" | "IA_CONTENT_GUARD";

export interface DiagnosticIssue {
  type: string;
  severity: IssueSeverity;
  description: string;
  agent: AgentName;
  action: string;
  endpoint: string;
}

export interface DiagnosticReport {
  userId: string;
  overallScore: number;           // 0-100
  overallLabel: "DANGER" | "WARNING" | "STABLE" | "GOOD" | "EXCELLENT";
  issues: DiagnosticIssue[];
  prioritizedActions: string[];
  agentSummary: {
    agentName: AgentName;
    status: "IDLE" | "ACTIVE" | "NEEDED";
    reason: string;
  }[];
  generatedAt: string;
}

export async function runDiagnostic(userId: string): Promise<DiagnosticReport> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all signals in parallel
  const [
    activeListings,
    lowQualityListings,
    pendingNegotiations,
    totalNegotiations,
    acceptedNegotiations,
    completedOrders,
    activeCart,
    adData,
    trustScore,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),

    // Annonces sans image ou description courte (qualité basse)
    prisma.listing.count({
      where: {
        ownerUserId: userId,
        status: "ACTIVE",
        OR: [
          { imageUrl: null },
          { imageUrl: "" },
          { description: null },
          { description: { lt: "aaa" } }, // < 3 chars
        ],
      },
    }),

    prisma.negotiation.count({
      where: { sellerUserId: userId, status: "PENDING" },
    }),

    prisma.negotiation.count({
      where: { sellerUserId: userId, createdAt: { gte: thirtyDaysAgo } },
    }),

    prisma.negotiation.count({
      where: { sellerUserId: userId, status: "ACCEPTED", createdAt: { gte: thirtyDaysAgo } },
    }),

    prisma.order.count({
      where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: thirtyDaysAgo } },
    }),

    prisma.cart.findFirst({
      where: {
        items: { some: { listing: { ownerUserId: userId } } },
        status: CartStatus.OPEN,
        updatedAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // > 6h d'inactivité
      },
    }),

    // Pubs actives
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (prisma as any).advertisement.count({
          where: { userId, status: "ACTIVE" },
        });
      } catch {
        return 0;
      }
    })(),

    prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    }),
  ]);

  const issues: DiagnosticIssue[] = [];
  let score = 80; // base score

  // ── Signal 1 : Pas d'annonce active ──
  if (activeListings === 0) {
    issues.push({
      type: "NO_ACTIVE_LISTINGS",
      severity: "CRITICAL",
      description: "Aucune annonce active. Vous n'êtes pas visible sur la plateforme.",
      agent: "IA_LISTING_QUALITY",
      action: "Publiez votre première annonce",
      endpoint: "/listings",
    });
    score -= 40;
  }

  // ── Signal 2 : Annonces sans image ──
  if (lowQualityListings > 0) {
    const percent = Math.round((lowQualityListings / Math.max(activeListings, 1)) * 100);
    issues.push({
      type: "LOW_QUALITY_LISTINGS",
      severity: percent > 50 ? "WARNING" : "INFO",
      description: `${lowQualityListings} annonce${lowQualityListings > 1 ? "s" : ""} sans image ou description (${percent}% du catalogue).`,
      agent: "IA_LISTING_QUALITY",
      action: "Améliorez la qualité de vos annonces",
      endpoint: "/listings/mine",
    });
    score -= Math.min(20, percent / 3);
  }

  // ── Signal 3 : Négociations en attente sans réponse ──
  if (pendingNegotiations >= 3) {
    issues.push({
      type: "PENDING_NEGOTIATIONS",
      severity: "WARNING",
      description: `${pendingNegotiations} offres en attente de réponse. Chaque heure perdue = risque de perte de l'acheteur.`,
      agent: "IA_MARCHAND",
      action: "Activez l'auto-négociation IA",
      endpoint: "/negotiations/seller",
    });
    score -= 10;
  }

  // ── Signal 4 : Taux conversion négociation faible ──
  const negoConversionRate =
    totalNegotiations > 0
      ? Math.round((acceptedNegotiations / totalNegotiations) * 100)
      : null;

  if (negoConversionRate !== null && negoConversionRate < 25 && totalNegotiations >= 3) {
    issues.push({
      type: "LOW_NEGOTIATION_CONVERSION",
      severity: "WARNING",
      description: `Taux de conversion négociation : ${negoConversionRate}%. Vos offres reçues ne se transforment pas en ventes.`,
      agent: "IA_MARCHAND",
      action: "Consultez les conseils IA pour chaque négociation",
      endpoint: "/negotiations/:id/ai-advice/seller",
    });
    score -= 10;
  }

  // ── Signal 5 : Peu de ventes malgré des négociations ──
  if (totalNegotiations >= 5 && completedOrders === 0) {
    issues.push({
      type: "NEGO_NO_CONVERSION",
      severity: "CRITICAL",
      description: "Des acheteurs négocient mais aucun achat finalisé ce mois. Problème de conversion critique.",
      agent: "IA_COMMANDE",
      action: "Optimisez le tunnel de vente",
      endpoint: "/orders/ai/checkout-advice",
    });
    score -= 20;
  }

  // ── Signal 6 : Panier abandonné ──
  if (activeCart) {
    issues.push({
      type: "CART_ABANDONMENT",
      severity: "INFO",
      description: "Un acheteur a un panier avec vos articles actif depuis plus de 6h.",
      agent: "IA_COMMANDE",
      action: "L'IA Commande peut déclencher une relance",
      endpoint: "/orders/ai/abandonment-risk",
    });
    score -= 5;
  }

  // ── Signal 7 : Pas de pub active ──
  if (adData === 0 && activeListings >= 2) {
    issues.push({
      type: "NO_ADVERTISING",
      severity: "INFO",
      description: "Aucune publicité active. Augmentez votre visibilité avec une campagne ciblée.",
      agent: "IA_ADS",
      action: "Créez une pub guidée par l'IA Ads",
      endpoint: "/ads/ai/targeting-advice",
    });
    score -= 5;
  }

  // ── Signal 8 : Trust score faible ──
  const trust = trustScore?.trustScore ?? 50;
  if (trust < 40) {
    issues.push({
      type: "LOW_TRUST_SCORE",
      severity: "WARNING",
      description: `Score de confiance faible (${trust}/100). Cela réduit votre visibilité et vos chances de vente.`,
      agent: "IA_ANALYTIQUE",
      action: "Complétez votre profil et finalisez vos commandes",
      endpoint: "/analytics/ai/basic",
    });
    score -= 15;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, Math.round(score)));

  let overallLabel: DiagnosticReport["overallLabel"];
  if (score >= 85) overallLabel = "EXCELLENT";
  else if (score >= 70) overallLabel = "GOOD";
  else if (score >= 50) overallLabel = "STABLE";
  else if (score >= 30) overallLabel = "WARNING";
  else overallLabel = "DANGER";

  // Prioritized actions
  const prioritizedActions = issues
    .sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return order[a.severity] - order[b.severity];
    })
    .map((i) => i.action)
    .slice(0, 5);

  if (prioritizedActions.length === 0) {
    prioritizedActions.push("Votre compte est en bonne santé. Continuez ainsi !");
    prioritizedActions.push("Analysez vos performances avec l'IA Analytique Premium.");
  }

  // Agent summary
  const agentSummary: DiagnosticReport["agentSummary"] = [
    {
      agentName: "IA_MARCHAND",
      status: pendingNegotiations > 0 ? "NEEDED" : negoConversionRate !== null && negoConversionRate > 40 ? "ACTIVE" : "IDLE",
      reason: pendingNegotiations > 0
        ? `${pendingNegotiations} offres en attente`
        : negoConversionRate !== null
        ? `Conv. ${negoConversionRate}%`
        : "Aucune négociation récente",
    },
    {
      agentName: "IA_COMMANDE",
      status: activeCart ? "NEEDED" : completedOrders > 0 ? "ACTIVE" : "IDLE",
      reason: activeCart ? "Panier abandonné détecté" : `${completedOrders} commandes finalisées`,
    },
    {
      agentName: "IA_ADS",
      status: adData > 0 ? "ACTIVE" : "IDLE",
      reason: adData > 0 ? `${adData} pub(s) active(s)` : "Aucune campagne en cours",
    },
    {
      agentName: "IA_ANALYTIQUE",
      status: activeListings > 0 ? "ACTIVE" : "IDLE",
      reason: activeListings > 0 ? `${activeListings} annonces analysables` : "Aucune annonce active",
    },
    {
      agentName: "IA_LISTING_QUALITY",
      status: lowQualityListings > 0 ? "NEEDED" : "IDLE",
      reason: lowQualityListings > 0 ? `${lowQualityListings} annonce(s) à améliorer` : "Qualité OK",
    },
  ];

  return {
    userId,
    overallScore: score,
    overallLabel,
    issues,
    prioritizedActions,
    agentSummary,
    generatedAt: new Date().toISOString(),
  };
}
