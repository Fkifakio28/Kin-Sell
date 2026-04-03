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

  // ── Seed AI Agent: MessageGuard ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-message-guard" },
    update: {},
    create: {
      id: "ai-message-guard",
      name: "IA MessageGuard",
      domain: "messaging",
      description: "IA de contrôle conversationnel anti-contournement. Analyse chaque message avant envoi pour bloquer le partage de coordonnées, les tentatives de sortie de plateforme, la fragmentation d'informations interdites et les obfuscations intelligentes.",
      action: "Analyse et filtre les messages en temps réel",
      level: "LEVEL_1",
      enabled: true,
      config: { severity: 3, version: "1.0.0" },
    },
  });

  // ── Seed AI Agent: PriceAdvisor ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-price-advisor" },
    update: {},
    create: {
      id: "ai-price-advisor",
      name: "IA PriceAdvisor",
      domain: "pricing",
      description: "IA de conseil en tarification. Analyse les prix du marché local (même catégorie, même ville) pour suggérer une fourchette de prix optimale aux vendeurs.",
      action: "Analyse les annonces similaires et retourne médiane, min, max et suggestion de prix",
      level: "LEVEL_1",
      enabled: true,
      config: { version: "1.0.0", outlierMethod: "IQR" },
    },
  });

  // ── Seed AI Agent: ListingQuality ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-listing-quality" },
    update: {},
    create: {
      id: "ai-listing-quality",
      name: "IA ListingQuality",
      domain: "listings",
      description: "IA de scoring qualité des annonces. Évalue la complétude d'une annonce (titre, description, images, prix, localisation) et retourne un score 0-100 avec grade A-F et conseils d'amélioration.",
      action: "Score de qualité + liste de suggestions d'amélioration pour une annonce",
      level: "LEVEL_1",
      enabled: true,
      config: { version: "1.0.0", maxScore: 100 },
    },
  });

  // ── Seed AI Agent: ContentGuard (SoKin) ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-content-guard" },
    update: {},
    create: {
      id: "ai-content-guard",
      name: "IA ContentGuard",
      domain: "content",
      description: "IA de modération des publications SoKin. Analyse chaque post avant publication pour détecter spam, langage abusif, partage de coordonnées, et flooding de hashtags. Retourne ALLOW / WARN / BLOCK.",
      action: "Modération en temps réel des posts SoKin avant publication",
      level: "LEVEL_1",
      enabled: true,
      config: { version: "1.0.0", blockThreshold: 50, warnThreshold: 20 },
    },
  });

  // ── Seed AI Agent: NegotiationAI (IA Marchand) ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-negotiation" },
    update: {},
    create: {
      id: "ai-negotiation",
      name: "IA Marchand",
      domain: "negotiations",
      description: "IA de conseil en négociation. Fournit des conseils acheteur (prix suggéré, taux de succès, message) et vendeur (recommandation accept/refuser/contrer, impact marge, profil acheteur). Supporte l'auto-négociation selon des règles définies.",
      action: "Conseil temps réel acheteur + vendeur sur chaque négociation",
      level: "LEVEL_2",
      enabled: true,
      config: { version: "1.0.0", engines: ["pricing", "strategy", "intent", "margin"] },
    },
  });

  // ── Seed AI Agent: OrderAI (IA Commande) ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-order" },
    update: {},
    create: {
      id: "ai-order",
      name: "IA Commande",
      domain: "orders",
      description: "IA de vente autonome. Optimise le checkout (bundle, discount, urgence), détecte l'abandon panier, valide automatiquement les commandes à faible risque.",
      action: "Optimisation checkout + relance panier + auto-validation",
      level: "LEVEL_2",
      enabled: true,
      config: { version: "1.0.0", engines: ["checkout", "abandonment", "autovalidation"] },
    },
  });

  // ── Seed AI Agent: AdAI (IA Ads) ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-ads" },
    update: {},
    create: {
      id: "ai-ads",
      name: "IA Ads",
      domain: "advertising",
      description: "IA de publicité intelligente. Conseille sur l'audience, le budget, la durée, les pages de diffusion et le timing optimal. Analyse les performances (CTR, ROI) et recommande boost/pause/arrêt.",
      action: "Ciblage pub + analyse performance + optimisation budget",
      level: "LEVEL_2",
      enabled: true,
      config: { version: "1.0.0", engines: ["targeting", "performance", "placement", "budget"] },
    },
  });

  // ── Seed AI Agent: AnalyticsAI (IA Analytique) ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-analytics" },
    update: {},
    create: {
      id: "ai-analytics",
      name: "IA Analytique",
      domain: "analytics",
      description: "IA d'analyse business. Palier 1 (Medium): insights de base, position marché, tendances, meilleures heures. Palier 2 (Premium): funnel complet, segmentation audience, vélocité, prédictions, déclencheurs automatiques inter-IA.",
      action: "Analyse activité + insights marché + prédictions (Premium)",
      level: "LEVEL_3",
      enabled: true,
      config: { version: "1.0.0", palier1: "MEDIUM", palier2: "PREMIUM", engines: ["predictive", "behavior", "velocity", "opportunity"] },
    },
  });

  // ── Seed AI Agent: Orchestrateur ──
  await prisma.aiAgent.upsert({
    where: { id: "ai-orchestrator" },
    update: {},
    create: {
      id: "ai-orchestrator",
      name: "IA Orchestrateur",
      domain: "system",
      description: "IA centrale de coordination. Diagnostique l'écosystème vendeur, détecte les problèmes clés (vues sans ventes, négos bloquées, paniers abandonnés) et retourne un plan d'action priorisé en appelant les agents spécialisés.",
      action: "Diagnostic complet + plan d'action coordonné entre tous les agents IA",
      level: "LEVEL_3",
      enabled: true,
      config: { version: "1.0.0", agents: ["ai-negotiation", "ai-order", "ai-ads", "ai-analytics", "ai-listing-quality"] },
    },
  });

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
