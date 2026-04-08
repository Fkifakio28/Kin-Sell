/**
 * ADS KNOWLEDGE BASE — Base métier enrichie pour l'IA Ads Kin-Sell
 *
 * Source unique de vérité pour toutes les recommandations commerciales.
 * Chaque service IA (commercial-advisor, pricing-nudge, post-publish-advisor,
 * post-sale-advisor, analytics-cta, ai-ads-engine) importe cette base.
 *
 * Structure :
 *   1. SCÉNARIOS DÉCLENCHEURS — quand recommander
 *   2. CATALOGUE OFFRES        — quoi recommander
 *   3. MATRICE DE RÉSOLUTION   — scénario × profil → offre(s)
 *   4. JUSTIFICATIONS          — pourquoi recommander
 *   5. CTA CONTEXTUELS         — comment présenter
 *
 * Références :
 *   - billing.catalog.ts pour les prix
 *   - pricingLinks.ts (frontend) pour les deep-links
 */

import {
  PLAN_CATALOG,
  ADDON_CATALOG,
  type PlanCatalogItem,
  type AddonCatalogItem,
} from "../billing/billing.catalog.js";

/* ═══════════════════════════════════════════════════════════════
   1. SCÉNARIOS DÉCLENCHEURS — les moments-clés
   ═══════════════════════════════════════════════════════════════ */

/**
 * Chaque scénario décrit un moment commercial où une recommandation
 * est pertinente. Les seuils numériques sont calibrés sur le marché
 * Kinshasa et les habitudes Kin-Sell.
 */
export type TriggerScenario =
  // ── Visibilité ──
  | "LOW_VISIBILITY"           // Annonces stagnantes, peu de vues
  | "PROMO_WITHOUT_BOOST"      // Promo active sans boost
  | "HIGH_COMPETITION"         // Beaucoup de concurrents dans la catégorie
  | "NEW_IN_CATEGORY"          // Nouveau dans une catégorie concurrentielle

  // ── Croissance ──
  | "SALES_GROWTH"             // Croissance ventes > 30% mois/mois
  | "REVENUE_MILESTONE"        // Palier de revenu atteint (10$, 50$, 200$, 500$)
  | "CATALOG_EXPANSION"        // Nombre d'articles en forte hausse
  | "CATEGORY_DOMINANCE"       // Domination d'une catégorie (> 5 ventes)
  | "MULTI_CATEGORY"           // Vend dans 3+ catégories

  // ── Post-publication ──
  | "AFTER_FIRST_LISTING"      // Premier article publié
  | "AFTER_LISTING"            // Publication standard
  | "AFTER_BULK_IMPORT"        // Import de plusieurs articles
  | "AFTER_PROMO_CREATION"     // Promo créée

  // ── Post-vente ──
  | "FIRST_SALE"               // Toute première vente
  | "REPEAT_SALE"              // Vente récurrente (même acheteur ou catégorie)
  | "HIGH_VALUE_SALE"          // Vente au-dessus de la médiane catégorie
  | "SALE_AFTER_BOOST"         // Vente déclenchée après boost
  | "SALE_AFTER_PROMO"         // Vente sur un article en promotion
  | "SALE_STREAK"              // 3+ ventes en 7 jours

  // ── Automation ──
  | "HIGH_MESSAGE_VOLUME"      // > 25 messages / semaine reçus
  | "LOW_RESPONSE_RATE"        // Taux de réponse < 50% en 24h
  | "MANUAL_ORDER_OVERLOAD"    // > 8 commandes manuelles / mois
  | "NEGOTIATION_FATIGUE"      // Beaucoup de négos, conversion < 40%

  // ── Analytics ──
  | "PRICE_UNCERTAINTY"        // Prix éloigné de la médiane marché
  | "IRREGULAR_RESULTS"        // Ventes fluctuantes (écart-type élevé)
  | "OPTIMIZATION_OPPORTUNITY" // Articles performants non optimisés
  | "MARKET_SHIFT";            // Changement de tendance détecté dans la catégorie

export interface TriggerDefinition {
  scenario: TriggerScenario;
  /** Description lisible */
  label: string;
  /** Catégorie de moment */
  category: "visibility" | "growth" | "post_publish" | "post_sale" | "automation" | "analytics";
  /** Applicable à USER, BUSINESS, ou BOTH */
  scope: "USER" | "BUSINESS" | "BOTH";
  /** Priorité de base du scénario (1-10, 10 = le plus urgent) */
  basePriority: number;
  /**
   * Seuils de détection par défaut.
   * Les services adaptent selon le contexte réel.
   */
  thresholds: Record<string, number>;
  /** Moment optimal d'affichage */
  timing: "immediate" | "next_visit" | "dashboard" | "periodic";
  /** Durée de validité du scénario en heures */
  ttlHours: number;
}

export const TRIGGERS: TriggerDefinition[] = [
  // ━━━━━━━━━━━ VISIBILITÉ ━━━━━━━━━━━
  {
    scenario: "LOW_VISIBILITY",
    label: "Articles en perte de visibilité",
    category: "visibility",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { stagnantRatio: 0.4, minListings: 3, stagnantDays: 7 },
    timing: "dashboard",
    ttlHours: 168,
  },
  {
    scenario: "PROMO_WITHOUT_BOOST",
    label: "Promotions sans visibilité amplifiée",
    category: "visibility",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { minPromoWithoutBoost: 2 },
    timing: "immediate",
    ttlHours: 72,
  },
  {
    scenario: "HIGH_COMPETITION",
    label: "Forte concurrence dans la catégorie",
    category: "visibility",
    scope: "BOTH",
    basePriority: 5,
    thresholds: { competitorCount: 20, positionPercentile: 50 },
    timing: "dashboard",
    ttlHours: 336,
  },
  {
    scenario: "NEW_IN_CATEGORY",
    label: "Nouvel entrant dans une catégorie concurrentielle",
    category: "visibility",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { categoryListingCount: 15, userCategorySales: 0 },
    timing: "next_visit",
    ttlHours: 168,
  },

  // ━━━━━━━━━━━ CROISSANCE ━━━━━━━━━━━
  {
    scenario: "SALES_GROWTH",
    label: "Croissance des ventes",
    category: "growth",
    scope: "BOTH",
    basePriority: 8,
    thresholds: { growthPercent: 30, minSalesLast30d: 5 },
    timing: "dashboard",
    ttlHours: 168,
  },
  {
    scenario: "REVENUE_MILESTONE",
    label: "Palier de revenus atteint",
    category: "growth",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { milestones: 1000 }, // 10$, 50$, 200$, 500$ en cents
    timing: "immediate",
    ttlHours: 96,
  },
  {
    scenario: "CATALOG_EXPANSION",
    label: "Expansion rapide du catalogue",
    category: "growth",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { listingsLast7d: 5, totalListings: 10 },
    timing: "next_visit",
    ttlHours: 168,
  },
  {
    scenario: "CATEGORY_DOMINANCE",
    label: "Position dominante dans une catégorie",
    category: "growth",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { categorySales: 5, shareOfCategory: 15 },
    timing: "dashboard",
    ttlHours: 336,
  },
  {
    scenario: "MULTI_CATEGORY",
    label: "Diversification multi-catégorie",
    category: "growth",
    scope: "BOTH",
    basePriority: 5,
    thresholds: { minCategories: 3, minSalesPerCategory: 2 },
    timing: "periodic",
    ttlHours: 336,
  },

  // ━━━━━━━━━━━ POST-PUBLICATION ━━━━━━━━━━━
  {
    scenario: "AFTER_FIRST_LISTING",
    label: "Premier article publié",
    category: "post_publish",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { totalListings: 1 },
    timing: "immediate",
    ttlHours: 72,
  },
  {
    scenario: "AFTER_LISTING",
    label: "Article publié",
    category: "post_publish",
    scope: "BOTH",
    basePriority: 5,
    thresholds: {},
    timing: "immediate",
    ttlHours: 48,
  },
  {
    scenario: "AFTER_BULK_IMPORT",
    label: "Import en masse",
    category: "post_publish",
    scope: "BUSINESS",
    basePriority: 7,
    thresholds: { bulkCount: 5 },
    timing: "immediate",
    ttlHours: 72,
  },
  {
    scenario: "AFTER_PROMO_CREATION",
    label: "Promotion créée",
    category: "post_publish",
    scope: "BOTH",
    basePriority: 6,
    thresholds: {},
    timing: "immediate",
    ttlHours: 48,
  },

  // ━━━━━━━━━━━ POST-VENTE ━━━━━━━━━━━
  {
    scenario: "FIRST_SALE",
    label: "Première vente réalisée",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 9,
    thresholds: { totalSales: 1 },
    timing: "immediate",
    ttlHours: 96,
  },
  {
    scenario: "REPEAT_SALE",
    label: "Vente récurrente",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { sameCategory: 2 },
    timing: "immediate",
    ttlHours: 48,
  },
  {
    scenario: "HIGH_VALUE_SALE",
    label: "Vente au-dessus de la médiane",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { aboveMedianPercent: 20 },
    timing: "immediate",
    ttlHours: 72,
  },
  {
    scenario: "SALE_AFTER_BOOST",
    label: "Vente déclenchée par un boost",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 8,
    thresholds: {},
    timing: "immediate",
    ttlHours: 48,
  },
  {
    scenario: "SALE_AFTER_PROMO",
    label: "Vente sur article en promotion",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 7,
    thresholds: {},
    timing: "immediate",
    ttlHours: 48,
  },
  {
    scenario: "SALE_STREAK",
    label: "Série de ventes consécutives",
    category: "post_sale",
    scope: "BOTH",
    basePriority: 8,
    thresholds: { salesIn7d: 3 },
    timing: "immediate",
    ttlHours: 72,
  },

  // ━━━━━━━━━━━ AUTOMATION ━━━━━━━━━━━
  {
    scenario: "HIGH_MESSAGE_VOLUME",
    label: "Volume élevé de messages",
    category: "automation",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { messagesPerWeek: 25 },
    timing: "dashboard",
    ttlHours: 168,
  },
  {
    scenario: "LOW_RESPONSE_RATE",
    label: "Taux de réponse faible",
    category: "automation",
    scope: "BOTH",
    basePriority: 8,
    thresholds: { responseRate: 50, minMessages: 10 },
    timing: "next_visit",
    ttlHours: 168,
  },
  {
    scenario: "MANUAL_ORDER_OVERLOAD",
    label: "Surcharge de commandes manuelles",
    category: "automation",
    scope: "BOTH",
    basePriority: 8,
    thresholds: { ordersPerMonth: 8 },
    timing: "dashboard",
    ttlHours: 168,
  },
  {
    scenario: "NEGOTIATION_FATIGUE",
    label: "Fatigue de négociation",
    category: "automation",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { negotiations: 10, conversionRate: 40 },
    timing: "dashboard",
    ttlHours: 168,
  },

  // ━━━━━━━━━━━ ANALYTICS ━━━━━━━━━━━
  {
    scenario: "PRICE_UNCERTAINTY",
    label: "Prix hors fourchette marché",
    category: "analytics",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { deviationPercent: 25 },
    timing: "next_visit",
    ttlHours: 168,
  },
  {
    scenario: "IRREGULAR_RESULTS",
    label: "Résultats de vente irréguliers",
    category: "analytics",
    scope: "BOTH",
    basePriority: 6,
    thresholds: { variationCoeff: 50, minWeeks: 4 },
    timing: "periodic",
    ttlHours: 336,
  },
  {
    scenario: "OPTIMIZATION_OPPORTUNITY",
    label: "Articles performants non optimisés",
    category: "analytics",
    scope: "BOTH",
    basePriority: 7,
    thresholds: { performantButUnboosted: 2 },
    timing: "dashboard",
    ttlHours: 168,
  },
  {
    scenario: "MARKET_SHIFT",
    label: "Changement de tendance dans la catégorie",
    category: "analytics",
    scope: "BOTH",
    basePriority: 5,
    thresholds: { trendChangePercent: 20 },
    timing: "periodic",
    ttlHours: 336,
  },
];

/** Index par scenario pour lookup rapide */
export const TRIGGER_MAP: ReadonlyMap<TriggerScenario, TriggerDefinition> = new Map(
  TRIGGERS.map((t) => [t.scenario, t]),
);

/* ═══════════════════════════════════════════════════════════════
   2. CATALOGUE OFFRES — enrichi avec objectifs et bénéfices
   ═══════════════════════════════════════════════════════════════ */

export type OfferCode =
  | "BOOST"
  | "AUTO"
  | "PRO_VENDOR"
  | "STARTER"
  | "BUSINESS"
  | "SCALE"
  | "IA_MERCHANT"
  | "IA_ORDER"
  | "BOOST_VISIBILITY"
  | "ADS_PACK"
  | "ADS_PREMIUM"
  | "ANALYTICS_MEDIUM"
  | "ANALYTICS_PREMIUM";

export interface OfferDefinition {
  code: OfferCode;
  /** Type de produit (plan, addon, analytics) */
  productType: "PLAN" | "ADDON" | "BOOST" | "ADS_PACK" | "ADS_PREMIUM" | "ANALYTICS";
  /** Cible principale */
  scope: "USER" | "BUSINESS" | "BOTH";
  /** Objectif business de l'offre */
  objective: string;
  /** Bénéfices concrets (max 4) */
  benefits: string[];
  /** Problème principal que l'offre résout */
  solves: string;
  /** Meilleur moment pour proposer cette offre */
  bestMoments: TriggerScenario[];
  /** Anti-pattern : ne pas proposer si… */
  avoidWhen: string[];
  /** Deep-link paramétré vers /forfaits */
  ctaPath: string;
  /** Prix affiché */
  pricingLabel: string;
  /** CTA label adapté par scope */
  ctaLabel: { user: string; business: string };
  /** Icône emoji */
  icon: string;
}

export const OFFERS: OfferDefinition[] = [
  // ━━━━━━━━━━━ PLANS USER ━━━━━━━━━━━
  {
    code: "BOOST",
    productType: "PLAN",
    scope: "USER",
    objective: "Augmenter la visibilité des articles et du profil vendeur",
    benefits: [
      "Boost profil automatique",
      "Boost articles inclus",
      "Publicité basique",
      "Visibilité ×2 à ×5",
    ],
    solves: "Articles publiés mais peu ou pas vus par les acheteurs",
    bestMoments: ["LOW_VISIBILITY", "PROMO_WITHOUT_BOOST", "AFTER_LISTING", "HIGH_COMPETITION"],
    avoidWhen: ["Déjà plan BOOST ou supérieur", "Moins de 3 articles actifs", "Aucun article stagnant"],
    ctaPath: "/forfaits?tab=users&highlight=BOOST",
    pricingLabel: "6$/mois",
    ctaLabel: { user: "Passer à BOOST", business: "—" },
    icon: "🚀",
  },
  {
    code: "AUTO",
    productType: "PLAN",
    scope: "USER",
    objective: "Automatiser la gestion des ventes et des messages",
    benefits: [
      "IA commande incluse",
      "Réponses automatiques",
      "Gestion des ventes automatisée",
      "Tout le BOOST inclus",
    ],
    solves: "Trop de messages à gérer manuellement, ventes qui prennent du temps",
    bestMoments: ["HIGH_MESSAGE_VOLUME", "MANUAL_ORDER_OVERLOAD", "SALE_STREAK", "LOW_RESPONSE_RATE"],
    avoidWhen: ["Déjà plan AUTO ou supérieur", "Moins de 25 messages/semaine", "Moins de 3 ventes/7j"],
    ctaPath: "/forfaits?tab=users&highlight=AUTO",
    pricingLabel: "12$/mois",
    ctaLabel: { user: "Passer à AUTO", business: "—" },
    icon: "⚡",
  },
  {
    code: "PRO_VENDOR",
    productType: "PLAN",
    scope: "USER",
    objective: "Analyser le marché et optimiser la stratégie de vente",
    benefits: [
      "Kin-Sell Analytique Medium",
      "Tendances marché en temps réel",
      "Prix optimal par catégorie",
      "Tout le AUTO inclus",
    ],
    solves: "Vend bien mais sans vision data, prix non optimisés, marché mal compris",
    bestMoments: ["CATEGORY_DOMINANCE", "SALES_GROWTH", "PRICE_UNCERTAINTY", "OPTIMIZATION_OPPORTUNITY"],
    avoidWhen: ["Déjà PRO VENDEUR", "Moins de 8 ventes/mois", "Profil NEW"],
    ctaPath: "/forfaits?tab=users&highlight=PRO_VENDOR",
    pricingLabel: "20$/mois",
    ctaLabel: { user: "Devenir Pro Vendeur", business: "—" },
    icon: "👑",
  },

  // ━━━━━━━━━━━ PLANS BUSINESS ━━━━━━━━━━━
  {
    code: "STARTER",
    productType: "PLAN",
    scope: "BUSINESS",
    objective: "Lancer une présence boutique professionnelle",
    benefits: [
      "Boutique en ligne dédiée",
      "Visibilité standard",
      "Publicité basique",
      "Badge entreprise",
    ],
    solves: "Entreprise sans présence organisée sur la marketplace",
    bestMoments: ["AFTER_FIRST_LISTING", "CATALOG_EXPANSION"],
    avoidWhen: ["Déjà plan STARTER ou supérieur"],
    ctaPath: "/forfaits?tab=business&highlight=STARTER",
    pricingLabel: "15$/mois",
    ctaLabel: { user: "—", business: "Lancer ma boutique" },
    icon: "🏪",
  },
  {
    code: "BUSINESS",
    productType: "PLAN",
    scope: "BUSINESS",
    objective: "Accélérer la croissance avec IA et analytics",
    benefits: [
      "IA marchand incluse",
      "Analytics Medium",
      "Visibilité renforcée",
      "Optimisation opérationnelle",
    ],
    solves: "Boutique qui grandit mais gestion manuelle et pas de vision data",
    bestMoments: ["SALES_GROWTH", "HIGH_MESSAGE_VOLUME", "NEGOTIATION_FATIGUE", "CATEGORY_DOMINANCE"],
    avoidWhen: ["Déjà plan BUSINESS ou supérieur", "Moins de 5 ventes/mois"],
    ctaPath: "/forfaits?tab=business&highlight=BUSINESS",
    pricingLabel: "30$/mois",
    ctaLabel: { user: "—", business: "Passer à Business" },
    icon: "📈",
  },
  {
    code: "SCALE",
    productType: "PLAN",
    scope: "BUSINESS",
    objective: "Automatisation et intelligence avancée pour scaler",
    benefits: [
      "Analytics Premium (prédictions IA)",
      "IA commande incluse",
      "Automatisation complète",
      "Support dédié",
    ],
    solves: "Business établi qui atteint les limites du plan intermédiaire",
    bestMoments: ["REVENUE_MILESTONE", "MULTI_CATEGORY", "SALE_STREAK", "MARKET_SHIFT"],
    avoidWhen: ["Déjà SCALE", "Moins de 15 ventes/mois", "Lifecycle NEW ou GROWING"],
    ctaPath: "/forfaits?tab=business&highlight=SCALE",
    pricingLabel: "50$/mois",
    ctaLabel: { user: "—", business: "Passer à SCALE" },
    icon: "🏆",
  },

  // ━━━━━━━━━━━ ADD-ONS ━━━━━━━━━━━
  {
    code: "IA_MERCHANT",
    productType: "ADDON",
    scope: "BOTH",
    objective: "Améliorer le taux de conversion des négociations",
    benefits: [
      "Négociation assistée par IA",
      "Suggestions de prix optimaux",
      "Contre-offres automatiques",
      "Gain de temps sur chaque discussion",
    ],
    solves: "Beaucoup de négociations mais conversion faible",
    bestMoments: ["NEGOTIATION_FATIGUE", "HIGH_MESSAGE_VOLUME", "LOW_RESPONSE_RATE"],
    avoidWhen: ["Déjà actif", "Inclus dans le plan", "Moins de 5 négociations/mois"],
    ctaPath: "/forfaits?tab=addons&highlight=IA_MERCHANT",
    pricingLabel: "3$/mois",
    ctaLabel: { user: "Activer IA Marchand", business: "Optimiser mes conversions" },
    icon: "🤖",
  },
  {
    code: "IA_ORDER",
    productType: "ADDON",
    scope: "BOTH",
    objective: "Automatiser le cycle de commande complet",
    benefits: [
      "Confirmation automatique",
      "Suivi livraison IA",
      "Relances intelligentes",
      "Réponses automatiques aux acheteurs",
    ],
    solves: "Trop de commandes à traiter manuellement, délais de réponse longs",
    bestMoments: ["MANUAL_ORDER_OVERLOAD", "LOW_RESPONSE_RATE", "SALE_STREAK", "SALES_GROWTH"],
    avoidWhen: ["Déjà actif", "Inclus dans le plan", "Moins de 5 commandes/mois"],
    ctaPath: "/forfaits?tab=addons&highlight=IA_ORDER",
    pricingLabel: "7$/mois",
    ctaLabel: { user: "Activer IA Commande", business: "Automatiser les opérations" },
    icon: "📦",
  },
  {
    code: "BOOST_VISIBILITY",
    productType: "BOOST",
    scope: "BOTH",
    objective: "Relancer la visibilité des articles stagnants",
    benefits: [
      "Mise en avant immédiate",
      "Priorité dans les résultats de recherche",
      "Durée flexible (24h à 30j)",
      "Applicable au profil/boutique",
    ],
    solves: "Articles qui ne reçoivent plus d'interactions après quelques jours",
    bestMoments: ["LOW_VISIBILITY", "AFTER_LISTING", "PROMO_WITHOUT_BOOST", "OPTIMIZATION_OPPORTUNITY"],
    avoidWhen: ["Déjà actif", "Aucun article stagnant", "Moins de 3 articles"],
    ctaPath: "/forfaits?tab=addons&highlight=BOOST_VISIBILITY",
    pricingLabel: "1$/24h · 5$/7j · 15$/30j",
    ctaLabel: { user: "Booster mes articles", business: "Relancer mon catalogue" },
    icon: "🔥",
  },
  {
    code: "ADS_PACK",
    productType: "ADS_PACK",
    scope: "BOTH",
    objective: "Diffuser des publicités ciblées avec budget maîtrisé",
    benefits: [
      "Diffusion multi-zones",
      "Budget prévisible",
      "Ciblage par catégorie et zone",
      "Format intégré à la marketplace",
    ],
    solves: "Bons résultats organiques mais potentiel inexploité en publicité",
    bestMoments: ["SALES_GROWTH", "CATEGORY_DOMINANCE", "AFTER_PROMO_CREATION", "NEW_IN_CATEGORY"],
    avoidWhen: ["Campagne pub déjà active", "Lifecycle NEW", "Budget ZERO"],
    ctaPath: "/forfaits?tab=addons&highlight=ADS_PACK",
    pricingLabel: "5$ / 10$ / 15$",
    ctaLabel: { user: "Voir les packs pub", business: "Lancer une campagne" },
    icon: "📢",
  },
  {
    code: "ADS_PREMIUM",
    productType: "ADS_PREMIUM",
    scope: "BOTH",
    objective: "Visibilité maximale : homepage et top résultats",
    benefits: [
      "Placement homepage",
      "Top des résultats de recherche",
      "Ciblage ville",
      "Volume maximum de vues",
    ],
    solves: "Vendeur/boutique établi(e) voulant dominer la visibilité marketplace",
    bestMoments: ["REVENUE_MILESTONE", "CATEGORY_DOMINANCE", "SALE_STREAK"],
    avoidWhen: ["Budget LOW ou ZERO", "Lifecycle NEW", "Moins de 15 ventes/mois"],
    ctaPath: "/forfaits?tab=addons&highlight=ADS_PREMIUM",
    pricingLabel: "25$",
    ctaLabel: { user: "Pub Premium", business: "Dominer la marketplace" },
    icon: "🌟",
  },

  // ━━━━━━━━━━━ ANALYTICS ━━━━━━━━━━━
  {
    code: "ANALYTICS_MEDIUM",
    productType: "ANALYTICS",
    scope: "BOTH",
    objective: "Comprendre le marché et optimiser les prix",
    benefits: [
      "Tendances marché en temps réel",
      "Prix optimal par catégorie",
      "Produits les plus populaires",
      "Catégories prometteuses",
    ],
    solves: "Vend sans comprendre le marché, prix définis à l'intuition",
    bestMoments: ["PRICE_UNCERTAINTY", "CATEGORY_DOMINANCE", "IRREGULAR_RESULTS", "MULTI_CATEGORY"],
    avoidWhen: ["Déjà Analytics Medium ou Premium", "Lifecycle NEW", "Moins de 5 ventes historiques"],
    ctaPath: "/forfaits?tab=addons&section=analytics",
    pricingLabel: "Inclus dans PRO VENDEUR (20$) ou BUSINESS (30$)",
    ctaLabel: { user: "Activer l'Analytique", business: "Activer le pilotage data" },
    icon: "📊",
  },
  {
    code: "ANALYTICS_PREMIUM",
    productType: "ANALYTICS",
    scope: "BUSINESS",
    objective: "Prédictions IA, segmentation et stratégie avancée",
    benefits: [
      "Tout le Medium inclus",
      "Prédictions de tendances par IA",
      "Segmentation clients avancée",
      "Recommandations stratégiques",
    ],
    solves: "Business qui a besoin d'intelligence prédictive pour garder son avance",
    bestMoments: ["MARKET_SHIFT", "REVENUE_MILESTONE", "MULTI_CATEGORY", "CATEGORY_DOMINANCE"],
    avoidWhen: ["Déjà Analytics Premium", "Lifecycle NEW ou GROWING", "Moins de 15 ventes/mois"],
    ctaPath: "/forfaits?tab=business&highlight=SCALE",
    pricingLabel: "Inclus dans SCALE (50$)",
    ctaLabel: { user: "—", business: "Passer à SCALE" },
    icon: "🔮",
  },
];

/** Index par code pour lookup rapide */
export const OFFER_MAP: ReadonlyMap<OfferCode, OfferDefinition> = new Map(
  OFFERS.map((o) => [o.code, o]),
);

/* ═══════════════════════════════════════════════════════════════
   3. MATRICE DE RÉSOLUTION — scénario × profil → offre(s)
   ═══════════════════════════════════════════════════════════════ */

export interface ResolvedRecommendation {
  offer: OfferDefinition;
  trigger: TriggerDefinition;
  /** Priorité composite (trigger.basePriority × facteur contextuel) */
  priority: number;
  /** Confiance estimée 0-100 */
  confidence: number;
  /** Justification contextuelle (texte complet) */
  justification: string;
  /** Objectif de la recommandation pour l'utilisateur */
  userObjective: string;
  /** CTA label adapté */
  ctaLabel: string;
  /** CTA target (deep-link) */
  ctaTarget: string;
}

export interface ResolutionContext {
  isBusiness: boolean;
  planCode: string;
  planIndex: number;
  maxPlanIndex: number;
  lifecycle: string;
  budgetTier: string;
  activeAddons: string[];
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
  // Métriques
  totalListings: number;
  salesLast30d: number;
  salesPrev30d: number;
  revenueUsdCents: number;
  messagesLast7d: number;
  ordersLast30d: number;
  negotiations: number;
  conversionRate: number;
  stagnantCount: number;
  stagnantRatio: number;
  topCategory?: string;
  categoryCount: number;
}

/**
 * Résout quelles offres recommander pour un ensemble de scénarios détectés.
 * Retourne les offres triées par score, dédupliquées, max `limit`.
 */
export function resolveRecommendations(
  activeScenarios: TriggerScenario[],
  ctx: ResolutionContext,
  limit = 3,
): ResolvedRecommendation[] {
  const scope = ctx.isBusiness ? "BUSINESS" : "USER";
  const results: ResolvedRecommendation[] = [];
  const usedOfferCodes = new Set<OfferCode>();
  const usedProductTypes = new Set<string>();

  // Trier les scénarios par priorité décroissante
  const sortedScenarios = [...activeScenarios]
    .map((s) => TRIGGER_MAP.get(s))
    .filter((t): t is TriggerDefinition => !!t)
    .sort((a, b) => b.basePriority - a.basePriority);

  for (const trigger of sortedScenarios) {
    // Trouver les offres compatibles avec ce scénario
    const candidates = OFFERS.filter((o) => {
      // Scope compatible
      if (o.scope !== "BOTH" && o.scope !== scope) return false;
      // L'offre cible bien ce scénario
      if (!o.bestMoments.includes(trigger.scenario)) return false;
      // Pas déjà utilisée
      if (usedOfferCodes.has(o.code)) return false;
      // Max 1 PLAN
      if (o.productType === "PLAN" && usedProductTypes.has("PLAN")) return false;
      // Max 1 ANALYTICS
      if (o.productType === "ANALYTICS" && usedProductTypes.has("ANALYTICS")) return false;
      return true;
    });

    for (const offer of candidates) {
      // Vérifier éligibilité contextuelle
      if (!isOfferEligible(offer, ctx)) continue;

      const confidence = computeConfidence(offer, trigger, ctx);
      const priority = trigger.basePriority * (1 + confidence / 200);
      const justification = buildJustification(offer, trigger, ctx);
      const userObjective = buildUserObjective(offer, trigger);
      const ctaLabel = ctx.isBusiness ? offer.ctaLabel.business : offer.ctaLabel.user;
      if (ctaLabel === "—") continue; // offre non applicable

      results.push({
        offer,
        trigger,
        priority,
        confidence,
        justification,
        userObjective,
        ctaLabel,
        ctaTarget: offer.ctaPath,
      });

      usedOfferCodes.add(offer.code);
      usedProductTypes.add(offer.productType);
    }
  }

  // Tri par score composite et limite
  return results
    .sort((a, b) => b.priority * b.confidence - a.priority * a.confidence)
    .slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════════
   4. VÉRIFICATION D'ÉLIGIBILITÉ
   ═══════════════════════════════════════════════════════════════ */

function isOfferEligible(offer: OfferDefinition, ctx: ResolutionContext): boolean {
  switch (offer.code) {
    // Plans user — vérifier qu'on est en dessous
    case "BOOST":
      return !ctx.isBusiness && ctx.planIndex < 1;
    case "AUTO":
      return !ctx.isBusiness && ctx.planIndex < 2;
    case "PRO_VENDOR":
      return !ctx.isBusiness && ctx.planIndex < 3;

    // Plans business
    case "STARTER":
      return ctx.isBusiness && ctx.planIndex < 0;
    case "BUSINESS":
      return ctx.isBusiness && ctx.planIndex < 1;
    case "SCALE":
      return ctx.isBusiness && ctx.planIndex < 2;

    // Add-ons
    case "IA_MERCHANT":
      return !ctx.activeAddons.includes("IA_MERCHANT") && ctx.negotiations >= 5;
    case "IA_ORDER":
      return !ctx.activeAddons.includes("IA_ORDER") && ctx.ordersLast30d >= 5;
    case "BOOST_VISIBILITY":
      return !ctx.activeAddons.includes("BOOST_VISIBILITY") && ctx.stagnantCount >= 2;
    case "ADS_PACK":
      return !ctx.activeAddons.includes("ADS_PACK") && ctx.budgetTier !== "ZERO" && ctx.lifecycle !== "NEW";
    case "ADS_PREMIUM":
      return (
        !ctx.activeAddons.includes("ADS_PREMIUM") &&
        ctx.budgetTier !== "ZERO" &&
        ctx.budgetTier !== "LOW" &&
        ctx.salesLast30d >= 15
      );

    // Analytics
    case "ANALYTICS_MEDIUM":
      return ctx.analyticsTier === "NONE" && ctx.salesLast30d >= 3;
    case "ANALYTICS_PREMIUM":
      return ctx.isBusiness && ctx.analyticsTier !== "PREMIUM" && ctx.salesLast30d >= 10;

    default:
      return true;
  }
}

/* ═══════════════════════════════════════════════════════════════
   5. CONFIANCE
   ═══════════════════════════════════════════════════════════════ */

function computeConfidence(
  offer: OfferDefinition,
  trigger: TriggerDefinition,
  ctx: ResolutionContext,
): number {
  let base = 40;

  // Plus le scénario est urgent, plus la confiance monte
  base += trigger.basePriority * 3;

  // Métriques contextuelles
  if (ctx.salesLast30d >= 10) base += 10;
  if (ctx.stagnantRatio >= 0.5) base += 8;
  if (ctx.messagesLast7d >= 30) base += 6;
  if (ctx.ordersLast30d >= 10) base += 6;
  if (ctx.categoryCount >= 3) base += 5;

  // Croissance ventes
  if (ctx.salesPrev30d > 0) {
    const growth = ((ctx.salesLast30d - ctx.salesPrev30d) / ctx.salesPrev30d) * 100;
    if (growth > 50) base += 12;
    else if (growth > 20) base += 6;
  }

  // Lifecycle alignment
  if (offer.productType === "PLAN") {
    if (ctx.lifecycle === "POWER") base += 10;
    else if (ctx.lifecycle === "ESTABLISHED") base += 6;
    else if (ctx.lifecycle === "GROWING") base += 3;
  }

  // Budget alignment
  if (offer.productType === "ADS_PREMIUM" && ctx.budgetTier === "PREMIUM") base += 10;
  if (offer.productType === "ADS_PACK" && ctx.budgetTier === "MEDIUM") base += 5;

  return Math.min(95, Math.max(10, base));
}

/* ═══════════════════════════════════════════════════════════════
   6. JUSTIFICATIONS CONTEXTUELLES
   ═══════════════════════════════════════════════════════════════ */

function buildJustification(
  offer: OfferDefinition,
  trigger: TriggerDefinition,
  ctx: ResolutionContext,
): string {
  const isBiz = ctx.isBusiness;
  const cat = ctx.topCategory;

  // ── Par catégorie de trigger ──
  switch (trigger.category) {
    case "visibility": {
      if (trigger.scenario === "LOW_VISIBILITY") {
        return isBiz
          ? `${ctx.stagnantCount} articles de votre catalogue stagnent sans interaction depuis 7+ jours. ${offer.solves}. Le ${offer.code} relance le trafic sur votre boutique.`
          : `${ctx.stagnantCount} de vos ${ctx.totalListings} annonces n'ont reçu aucune interaction récente. ${offer.solves}. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "PROMO_WITHOUT_BOOST") {
        return isBiz
          ? `Vos promotions actives ne bénéficient pas de boost — leur portée est limitée. Amplifez-les avec ${offer.code}.`
          : `Vos promos sont en ligne mais peu vues. Un boost multiplie leur portée par 2 à 5×.`;
      }
      return `Votre visibilité est en dessous du potentiel. ${offer.objective}.`;
    }

    case "growth": {
      if (trigger.scenario === "SALES_GROWTH") {
        const growth = ctx.salesPrev30d > 0
          ? Math.round(((ctx.salesLast30d - ctx.salesPrev30d) / ctx.salesPrev30d) * 100)
          : 100;
        return isBiz
          ? `Croissance de +${growth}% ce mois (${ctx.salesLast30d} ventes). Le moment idéal pour investir dans ${offer.code} (${offer.pricingLabel}) et accélérer.`
          : `+${growth}% de ventes ce mois ! Avec ${ctx.salesLast30d} ventes, ${offer.code} vous donne les outils pour maintenir cette dynamique. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "REVENUE_MILESTONE") {
        return `Vous avez atteint ${(ctx.revenueUsdCents / 100).toFixed(0)}$ de revenus ce mois. ${offer.objective}. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "CATEGORY_DOMINANCE" && cat) {
        return isBiz
          ? `Vous dominez "${cat}" avec un volume de ventes significatif. ${offer.code} vous donne les insights pour consolider et étendre votre position.`
          : `Vous êtes expert "${cat}" — ${offer.code} vous montre les tendances et prix du marché pour garder votre avance. ${offer.pricingLabel}.`;
      }
      return `Votre activité grandit. ${offer.objective}. ${offer.pricingLabel}.`;
    }

    case "post_publish": {
      if (trigger.scenario === "AFTER_FIRST_LISTING") {
        return isBiz
          ? `Votre première publication est en ligne ! ${offer.objective} pour maximiser son impact dès le départ.`
          : `Votre premier article est publié ! ${offer.code} peut booster sa visibilité immédiatement. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "AFTER_BULK_IMPORT") {
        return `Import en masse détecté — ${offer.objective} pour que tous vos articles bénéficient de visibilité dès le départ.`;
      }
      return `Nouvelle publication en ligne. ${offer.objective}. ${offer.pricingLabel}.`;
    }

    case "post_sale": {
      if (trigger.scenario === "FIRST_SALE") {
        return isBiz
          ? `Première vente réalisée ! C'est le moment de structurer votre croissance avec ${offer.code} (${offer.pricingLabel}).`
          : `Bravo pour votre première vente ! ${offer.code} vous aide à enchaîner. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "SALE_AFTER_BOOST") {
        return isBiz
          ? `Votre dernière vente a été déclenchée par un boost — le ROI est prouvé. ${offer.objective}.`
          : `Le boost a généré une vente ! Continuez sur cette lancée avec ${offer.code}. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "SALE_STREAK") {
        return `${ctx.salesLast30d} ventes récentes — vous êtes dans une bonne dynamique. ${offer.objective} pour maintenir le rythme. ${offer.pricingLabel}.`;
      }
      return `Vente confirmée. ${offer.objective}. ${offer.pricingLabel}.`;
    }

    case "automation": {
      if (trigger.scenario === "HIGH_MESSAGE_VOLUME") {
        return isBiz
          ? `${ctx.messagesLast7d} messages cette semaine — votre équipe est débordée. ${offer.code} automatise les réponses et le suivi.`
          : `${ctx.messagesLast7d} messages cette semaine ! ${offer.code} répond automatiquement pour vous. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "NEGOTIATION_FATIGUE") {
        return `${ctx.negotiations} négociations avec ${ctx.conversionRate}% de conversion. ${offer.code} optimise chaque échange pour vendre plus. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "MANUAL_ORDER_OVERLOAD") {
        return `${ctx.ordersLast30d} commandes ce mois. ${offer.code} automatise le cycle complet : confirmation, suivi, relance. ${offer.pricingLabel}.`;
      }
      return `Votre volume nécessite de l'automatisation. ${offer.objective}. ${offer.pricingLabel}.`;
    }

    case "analytics": {
      if (trigger.scenario === "PRICE_UNCERTAINTY") {
        return isBiz
          ? `Certains prix de votre catalogue semblent éloignés du marché. ${offer.code} révèle les tendances et le prix optimal par catégorie.`
          : `Vos prix pourraient être optimisés. ${offer.code} vous montre ce que le marché paie réellement. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "IRREGULAR_RESULTS") {
        return `Vos résultats de vente fluctuent — ${offer.code} identifie les causes et propose des ajustements pour stabiliser votre performance. ${offer.pricingLabel}.`;
      }
      if (trigger.scenario === "MARKET_SHIFT") {
        return isBiz
          ? `Changement de tendance détecté dans votre catégorie. ${offer.code} vous donne les prédictions pour anticiper et vous adapter avant la concurrence.`
          : `Votre catégorie évolue. ${offer.code} vous montre les nouvelles tendances pour adapter votre offre. ${offer.pricingLabel}.`;
      }
      return `Des insights marché sont disponibles pour optimiser votre activité. ${offer.objective}. ${offer.pricingLabel}.`;
    }

    default:
      return `${offer.objective}. ${offer.pricingLabel}.`;
  }
}

function buildUserObjective(
  offer: OfferDefinition,
  trigger: TriggerDefinition,
): string {
  switch (trigger.category) {
    case "visibility":
      return "Augmenter la visibilité de vos articles pour toucher plus d'acheteurs";
    case "growth":
      return "Capitaliser sur votre croissance pour accélérer vos résultats";
    case "post_publish":
      return "Maximiser l'impact de votre publication dès maintenant";
    case "post_sale":
      return "Transformer cette vente en une série de succès";
    case "automation":
      return "Libérer votre temps en automatisant les tâches répétitives";
    case "analytics":
      return "Comprendre votre marché pour prendre de meilleures décisions";
    default:
      return offer.objective;
  }
}

/* ═══════════════════════════════════════════════════════════════
   7. HELPERS D'EXPORT POUR LES SERVICES
   ═══════════════════════════════════════════════════════════════ */

/** Retourne la liste des scénarios pertinents pour un type de moment */
export function scenariosForCategory(
  category: TriggerDefinition["category"],
): TriggerDefinition[] {
  return TRIGGERS.filter((t) => t.category === category);
}

/** Retourne les offres compatibles avec un scénario et un scope */
export function offersForScenario(
  scenario: TriggerScenario,
  scope: "USER" | "BUSINESS",
): OfferDefinition[] {
  return OFFERS.filter(
    (o) => o.bestMoments.includes(scenario) && (o.scope === "BOTH" || o.scope === scope),
  );
}

/** Retourne le chemin upgrade naturel pour un rôle */
export function getUpgradePath(isBusiness: boolean): OfferDefinition[] {
  const codes: OfferCode[] = isBusiness
    ? ["STARTER", "BUSINESS", "SCALE"]
    : ["BOOST", "AUTO", "PRO_VENDOR"];
  return codes.map((c) => OFFER_MAP.get(c)!).filter(Boolean);
}

/** CTA label adapté au scope */
export function ctaLabelFor(offer: OfferDefinition, isBusiness: boolean): string {
  return isBusiness ? offer.ctaLabel.business : offer.ctaLabel.user;
}

/** Info pricing lisible */
export function pricingFor(code: OfferCode): string {
  const offer = OFFER_MAP.get(code);
  return offer?.pricingLabel ?? "—";
}
