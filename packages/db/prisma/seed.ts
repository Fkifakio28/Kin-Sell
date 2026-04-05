import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

dotenv.config({ path: "../../.env" });

const prisma = new PrismaClient();

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value || value.trim().length === 0) {
    throw new Error(`Variable manquante: ${key}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const email = requireEnv(process.env.SUPER_ADMIN_EMAIL, "SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv(process.env.SUPER_ADMIN_PASSWORD, "SUPER_ADMIN_PASSWORD");
  const displayName = requireEnv(process.env.SUPER_ADMIN_DISPLAY_NAME, "SUPER_ADMIN_DISPLAY_NAME");

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.SUPER_ADMIN,
      accountStatus: "ACTIVE",
      passwordHash,
      profile: {
        upsert: {
          create: { displayName },
          update: { displayName }
        }
      }
    },
    create: {
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      accountStatus: "ACTIVE",
      profile: {
        create: { displayName }
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SEED_SUPER_ADMIN",
      entityType: "USER",
      entityId: user.id,
      metadata: { email }
    }
  });

  // ══════════════════════════════════════════
  // SEED AI AGENTS — Complete Config Metadata
  // ══════════════════════════════════════════

  const aiAgentsData = [
    {
      id: "ai-message-guard", slug: "message-guard", name: "IA MessageGuard", domain: "messaging", type: "moderation",
      icon: "🛡️", version: "1.0.0", status: "ACTIVE",
      description: "IA de contrôle conversationnel anti-contournement. Analyse chaque message avant envoi pour bloquer le partage de coordonnées, les tentatives de sortie de plateforme, la fragmentation d'informations interdites et les obfuscations intelligentes.",
      action: "Analyse et filtre les messages en temps réel",
      level: "LEVEL_1" as const, enabled: true,
      config: {
        severity: 3, version: "1.0.0",
        mission: "Protéger l'écosystème Kin-Sell en empêchant les utilisateurs de partager des coordonnées personnelles (téléphone, WhatsApp, email) dans la messagerie, afin de garantir que toutes les transactions passent par la plateforme.",
        doesNot: "Ne bloque pas les messages légitimes. Ne surveille pas les conversations hors plateforme.",
        zones: ["messagerie"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["action-automatique", "notification"],
        interventionType: "hidden",
        requiredPlan: "FREE",
        premiumOptions: [],
        dataUsed: { read: ["messages", "profils-utilisateurs"], generated: ["verdicts", "scores-risque"], suggested: [], actionable: ["blocage-message", "avertissement"] },
        outputs: ["blocage-message", "avertissement-utilisateur", "log-violation", "détection-anomalies"],
        subFunctions: ["Détection coordonnées", "Anti-fragmentation", "Anti-obfuscation", "Score de risque"],
      },
    },
    {
      id: "ai-price-advisor", slug: "price-advisor", name: "IA PriceAdvisor", domain: "pricing", type: "pricing",
      icon: "💰", version: "1.0.0", status: "ACTIVE",
      description: "IA de conseil en tarification. Analyse les prix du marché local (même catégorie, même ville) pour suggérer une fourchette de prix optimale aux vendeurs.",
      action: "Analyse les annonces similaires et retourne médiane, min, max et suggestion de prix",
      level: "LEVEL_1" as const, enabled: true,
      config: {
        version: "1.0.0", outlierMethod: "IQR",
        mission: "Aider les vendeurs à fixer un prix compétitif en analysant les annonces similaires dans la même catégorie et la même ville. Retourne une fourchette de prix (min, médiane, max) et une suggestion optimale.",
        doesNot: "Ne fixe pas automatiquement les prix. Ne modifie pas les annonces existantes sans action du vendeur.",
        zones: ["fiches-produits", "dashboard-business", "annonces"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["widget", "suggestion-inline", "carte-analytics"],
        interventionType: "visible",
        requiredPlan: "FREE",
        premiumOptions: ["Analyse détaillée par ville (BOOST)", "Historique des prix (PRO)"],
        dataUsed: { read: ["annonces", "catégories", "localisation", "prix-marché"], generated: ["fourchette-prix", "suggestion-optimale"], suggested: ["prix-recommandé"], actionable: ["ajustement-prix"] },
        outputs: ["suggestion-prix", "fourchette-marché", "analyse-concurrence"],
        subFunctions: ["Analyse médiane locale", "Détection outliers IQR", "Comparaison catégorie", "Suggestion intelligente"],
      },
    },
    {
      id: "ai-listing-quality", slug: "listing-quality", name: "IA ListingQuality", domain: "listings", type: "quality",
      icon: "📊", version: "1.0.0", status: "ACTIVE",
      description: "IA de scoring qualité des annonces. Évalue la complétude d'une annonce (titre, description, images, prix, localisation) et retourne un score 0-100 avec grade A-F et conseils d'amélioration.",
      action: "Score de qualité + liste de suggestions d'amélioration pour une annonce",
      level: "LEVEL_1" as const, enabled: true,
      config: {
        version: "1.0.0", maxScore: 100,
        mission: "Évaluer la qualité de chaque annonce publiée et guider les vendeurs pour améliorer leur visibilité. Score 0-100, grade A-F, avec des conseils personnalisés.",
        doesNot: "Ne supprime pas les annonces. Ne modifie pas le contenu automatiquement.",
        zones: ["fiches-produits", "dashboard-business", "dashboard-user"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["widget", "suggestion-inline", "panneau-latéral"],
        interventionType: "visible",
        requiredPlan: "FREE",
        premiumOptions: ["Score détaillé par critère (BOOST)", "Benchmark vs concurrents (PRO)"],
        dataUsed: { read: ["annonces", "images", "descriptions", "localisation"], generated: ["score-qualité", "grade", "suggestions"], suggested: ["améliorations"], actionable: ["optimisation-annonce"] },
        outputs: ["score-qualité", "grade-A-F", "conseils-amélioration", "benchmark"],
        subFunctions: ["Scoring titre", "Scoring description", "Scoring images", "Scoring prix", "Scoring localisation"],
      },
    },
    {
      id: "ai-content-guard", slug: "content-guard", name: "IA ContentGuard", domain: "content", type: "moderation",
      icon: "🔒", version: "1.0.0", status: "ACTIVE",
      description: "IA de modération des publications SoKin. Analyse chaque post avant publication pour détecter spam, langage abusif, partage de coordonnées, et flooding de hashtags. Retourne ALLOW / WARN / BLOCK.",
      action: "Modération en temps réel des posts SoKin avant publication",
      level: "LEVEL_1" as const, enabled: true,
      config: {
        version: "1.0.0", blockThreshold: 50, warnThreshold: 20,
        mission: "Modérer automatiquement les publications du réseau social SoKin. Détecter le spam, le langage abusif, le partage de coordonnées et le flooding. Protéger la communauté.",
        doesNot: "Ne censure pas les opinions. Ne bloque pas les contenus commerciaux légitimes.",
        zones: ["sokin"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["action-automatique"],
        interventionType: "hidden",
        requiredPlan: "FREE",
        premiumOptions: [],
        dataUsed: { read: ["posts-sokin", "profils-utilisateurs", "hashtags"], generated: ["verdicts", "scores-risque"], suggested: [], actionable: ["blocage-post", "avertissement"] },
        outputs: ["modération-post", "avertissement", "blocage", "log-violation"],
        subFunctions: ["Détection spam", "Anti-abus", "Détection coordonnées", "Anti-flooding hashtags"],
      },
    },
    {
      id: "ai-negotiation", slug: "negotiation", name: "IA Marchand", domain: "negotiations", type: "negotiation",
      icon: "🤝", version: "1.0.0", status: "ACTIVE",
      description: "IA de conseil en négociation. Fournit des conseils acheteur (prix suggéré, taux de succès, message) et vendeur (recommandation accept/refuser/contrer, impact marge, profil acheteur). Supporte l'auto-négociation selon des règles définies.",
      action: "Conseil temps réel acheteur + vendeur sur chaque négociation",
      level: "LEVEL_2" as const, enabled: true,
      config: {
        version: "1.0.0", engines: ["pricing", "strategy", "intent", "margin"],
        mission: "Assister acheteurs et vendeurs pendant les négociations en temps réel. Côté acheteur : suggérer un prix, prédire le taux de succès, proposer un message. Côté vendeur : recommander d'accepter/refuser/contrer, analyser l'impact marge, profiler l'acheteur.",
        doesNot: "N'agit pas si l'utilisateur n'a pas accès au forfait requis. Ne conclut pas de vente automatiquement sans auto-négociation activée.",
        zones: ["négociations", "messagerie", "commandes"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["panneau-latéral", "suggestion-inline", "bouton"],
        interventionType: "visible",
        requiredPlan: "BOOST",
        premiumOptions: ["Auto-négociation (PRO VENDEUR)", "Analyse profil acheteur avancée (BUSINESS)"],
        dataUsed: { read: ["négociations", "annonces", "profils-utilisateurs", "ventes-passées", "comportements-commerciaux"], generated: ["conseils-négociation", "taux-succès", "impact-marge"], suggested: ["prix-suggéré", "message-type", "stratégie"], actionable: ["auto-négociation", "contre-offre-automatique"] },
        outputs: ["conseil-acheteur", "conseil-vendeur", "auto-négociation", "prédiction-succès", "aide-à-la-vente"],
        subFunctions: ["Conseil acheteur", "Conseil vendeur", "Analyse de marge", "Profil acheteur", "Auto-négociation"],
      },
    },
    {
      id: "ai-order", slug: "order", name: "IA Commande", domain: "orders", type: "ordering",
      icon: "📦", version: "1.0.0", status: "ACTIVE",
      description: "IA de vente autonome. Optimise le checkout (bundle, discount, urgence), détecte l'abandon panier, valide automatiquement les commandes à faible risque.",
      action: "Optimisation checkout + relance panier + auto-validation",
      level: "LEVEL_2" as const, enabled: true,
      config: {
        version: "1.0.0", engines: ["checkout", "abandonment", "autovalidation"],
        mission: "Maximiser la conversion des commandes. Optimiser le checkout (bundles, discounts, urgence), détecter et relancer les paniers abandonnés, valider automatiquement les commandes à faible risque de fraude.",
        doesNot: "Ne force jamais un achat. Ne valide pas les commandes à risque élevé sans vérification manuelle.",
        zones: ["commandes", "panier", "dashboard-business"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["suggestion-inline", "notification", "action-automatique"],
        interventionType: "hybrid",
        requiredPlan: "BOOST",
        premiumOptions: ["Auto-validation intelligente (PRO VENDEUR)", "Relance panier automatique (BUSINESS)"],
        dataUsed: { read: ["commandes", "paniers", "profils-utilisateurs", "historique-achats"], generated: ["suggestions-bundle", "alertes-abandon"], suggested: ["discount-optimal", "urgence-factice"], actionable: ["relance-panier", "auto-validation-commande"] },
        outputs: ["optimisation-checkout", "relance-panier", "auto-validation", "amélioration-conversion", "aide-à-la-vente"],
        subFunctions: ["Optimisation checkout", "Détection abandon panier", "Auto-validation", "Suggestions bundle"],
      },
    },
    {
      id: "ai-ads", slug: "ads", name: "IA Ads", domain: "advertising", type: "advertising",
      icon: "📢", version: "1.0.0", status: "ACTIVE",
      description: "IA de publicité intelligente. Conseille sur l'audience, le budget, la durée, les pages de diffusion et le timing optimal. Analyse les performances (CTR, ROI) et recommande boost/pause/arrêt.",
      action: "Ciblage pub + analyse performance + optimisation budget",
      level: "LEVEL_2" as const, enabled: true,
      config: {
        version: "1.0.0", engines: ["targeting", "performance", "placement", "budget"],
        mission: "Aider les annonceurs à créer des campagnes publicitaires efficaces. Conseiller sur l'audience cible, le budget optimal, la durée, les pages de diffusion et le timing. Analyser CTR et ROI pour recommander boost, pause ou arrêt.",
        doesNot: "Ne dépense pas de budget sans validation. Ne crée pas de campagne automatiquement.",
        zones: ["publicités", "dashboard-business", "analytics"],
        targets: ["BUSINESS"],
        uiEntryPoints: ["panneau-latéral", "carte-analytics", "suggestion-inline"],
        interventionType: "visible",
        requiredPlan: "STARTER",
        premiumOptions: ["Ciblage avancé (BUSINESS)", "Auto-optimisation budget (SCALE)"],
        dataUsed: { read: ["campagnes-pub", "performances-annonces", "audience", "produits-publiés"], generated: ["recommandations-ciblage", "analyse-ROI", "prédictions-CTR"], suggested: ["budget-optimal", "timing-idéal", "audience-cible"], actionable: ["boost-campagne", "pause-campagne", "ajustement-budget"] },
        outputs: ["conseil-ciblage", "analyse-performance", "recommandations", "optimisation-budget"],
        subFunctions: ["Ciblage audience", "Analyse CTR/ROI", "Optimisation placement", "Gestion budget"],
      },
    },
    {
      id: "ai-analytics", slug: "analytics", name: "IA Analytique", domain: "analytics", type: "analytics",
      icon: "📈", version: "1.0.0", status: "ACTIVE",
      description: "IA d'analyse business. Palier 1 (Medium): insights de base, position marché, tendances, meilleures heures. Palier 2 (Premium): funnel complet, segmentation audience, vélocité, prédictions, déclencheurs automatiques inter-IA.",
      action: "Analyse activité + insights marché + prédictions (Premium)",
      level: "LEVEL_3" as const, enabled: true,
      config: {
        version: "1.0.0", palier1: "MEDIUM", palier2: "PREMIUM", engines: ["predictive", "behavior", "velocity", "opportunity"],
        mission: "Fournir des analyses business approfondies. Palier 1 : insights de base, position marché, tendances, meilleures heures de vente. Palier 2 : funnel complet, segmentation audience, vélocité de vente, prédictions, déclencheurs automatiques inter-IA.",
        doesNot: "Ne prend pas de décisions commerciales automatiquement. Les prédictions sont indicatives.",
        zones: ["analytics", "dashboard-business", "dashboard-user", "home"],
        targets: ["USER", "BUSINESS"],
        uiEntryPoints: ["carte-analytics", "panneau-latéral", "widget", "notification"],
        interventionType: "visible",
        requiredPlan: "AUTO",
        premiumOptions: ["Insights avancés (AUTO)", "Prédictions + triggers inter-IA (PRO VENDEUR)", "Segmentation audience (BUSINESS)", "Vélocité + funnel (SCALE)"],
        dataUsed: { read: ["ventes-passées", "commandes", "annonces", "performances-annonces", "engagement-sokin", "statistiques-boutique", "localisation", "devise", "catégories"], generated: ["insights", "trends", "prédictions", "segmentation"], suggested: ["meilleures-heures", "opportunités-marché"], actionable: ["déclenchement-workflow", "alerte-performance"] },
        outputs: ["analyses", "prédictions", "insights-marché", "recommandations", "détection-anomalies", "déclenchement-workflow"],
        subFunctions: ["Insights de base", "Position marché", "Tendances", "Meilleures heures", "Funnel complet", "Segmentation audience", "Vélocité", "Prédictions", "Déclencheurs inter-IA"],
      },
    },
    {
      id: "ai-orchestrator", slug: "orchestrator", name: "IA Orchestrateur", domain: "system", type: "orchestration",
      icon: "🧠", version: "1.0.0", status: "ACTIVE",
      description: "IA centrale de coordination. Diagnostique l'écosystème vendeur, détecte les problèmes clés (vues sans ventes, négos bloquées, paniers abandonnés) et retourne un plan d'action priorisé en appelant les agents spécialisés.",
      action: "Diagnostic complet + plan d'action coordonné entre tous les agents IA",
      level: "LEVEL_3" as const, enabled: true,
      config: {
        version: "1.0.0", agents: ["ai-negotiation", "ai-order", "ai-ads", "ai-analytics", "ai-listing-quality"],
        mission: "Coordonner tous les agents IA Kin-Sell. Diagnostiquer l'écosystème d'un vendeur, détecter les problèmes clés (vues sans ventes, négociations bloquées, paniers abandonnés, qualité faible) et retourner un plan d'action priorisé.",
        doesNot: "N'exécute pas d'actions directement. Délègue aux agents spécialisés. Ne fonctionne pas sans au moins 2 agents actifs.",
        zones: ["dashboard-business", "dashboard-user", "analytics", "commandes", "négociations"],
        targets: ["BUSINESS"],
        uiEntryPoints: ["panneau-latéral", "notification", "bouton"],
        interventionType: "visible",
        requiredPlan: "PRO VENDEUR",
        premiumOptions: ["Plan d'action automatique (SCALE)"],
        dataUsed: { read: ["toutes-les-données-agents", "profils-utilisateurs", "performances-globales"], generated: ["diagnostic-complet", "plan-action-priorisé"], suggested: ["actions-prioritaires"], actionable: ["déclenchement-agents-spécialisés"] },
        outputs: ["diagnostic-écosystème", "plan-action", "coordination-agents", "amélioration-conversion", "aide-à-la-gestion"],
        subFunctions: ["Diagnostic global", "Détection problèmes", "Plan d'action", "Coordination inter-IA", "Priorisation actions"],
      },
    },
  ];

  for (const a of aiAgentsData) {
    await prisma.aiAgent.upsert({
      where: { id: a.id },
      update: { slug: a.slug, type: a.type, icon: a.icon, version: a.version, status: a.status, config: a.config, description: a.description, action: a.action },
      create: {
        id: a.id, slug: a.slug, name: a.name, domain: a.domain, type: a.type, icon: a.icon, version: a.version, status: a.status,
        description: a.description, action: a.action, level: a.level, enabled: a.enabled, config: a.config,
      },
    });
  }

  // ── Seed MessageGuard Config defaults ──
  const guardDefaults: Array<{ key: string; value: any }> = [
    { key: "message_guard_enabled", value: true },
    { key: "message_guard_severity", value: 3 },
  ];
  for (const cfg of guardDefaults) {
    await prisma.messageGuardConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: { key: cfg.key, value: cfg.value, updatedBy: user.id },
    });
  }

  // ── Seed CurrencyRate — taux de change initiaux (base USD) ──
  const rates: Array<{ from: string; to: string; rate: number }> = [
    { from: "USD", to: "CDF", rate: 2850 },
    { from: "USD", to: "EUR", rate: 0.92 },
    { from: "USD", to: "XAF", rate: 605 },
    { from: "USD", to: "AOA", rate: 905 },
    { from: "USD", to: "XOF", rate: 605 },
    { from: "USD", to: "GNF", rate: 8600 },
    { from: "USD", to: "MAD", rate: 9.9 },
  ];
  for (const r of rates) {
    await prisma.currencyRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: r.from, toCurrency: r.to } },
      update: { rate: r.rate },
      create: { fromCurrency: r.from, toCurrency: r.to, rate: r.rate, isManual: false },
    });
  }

  console.log("Super-admin seed execute avec succes");
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
