/**
 * AI Admin Service — Super Admin Control Panel
 *
 * Fonctions de gestion centralisée de tous les agents IA.
 * Permet au Super Admin de :
 * - Voir le dashboard IA complet
 * - Activer/désactiver chaque agent
 * - Configurer les paramètres de chaque agent
 * - Voir les logs d'autonomie
 * - Déclencher des cycles manuels
 * - Voir les statistiques agrégées
 */

import { prisma } from "../../shared/db/prisma.js";
import { getSchedulerStatus, triggerManualCycle } from "./ai-autonomy.service.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AiDashboard {
  scheduler: { running: boolean; intervalsCount: number };
  agents: Array<{
    id: string;
    name: string;
    domain: string;
    description: string | null;
    enabled: boolean;
    level: string;
    config: Record<string, unknown>;
  }>;
  stats: {
    last24h: { total: number; successful: number; failed: number };
    last7d: { total: number; successful: number; failed: number };
    byAgent: Array<{ agentName: string; count: number; successRate: number }>;
  };
  memoryStats: {
    totalSnapshots: number;
    usersWithMemory: number;
    oldestSnapshot: string | null;
  };
  recentActions: Array<{
    id: string;
    agentName: string;
    actionType: string;
    decision: string;
    reasoning: string | null;
    success: boolean;
    createdAt: Date;
  }>;
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

export async function getAiDashboard(): Promise<AiDashboard> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    agents,
    totalLogs24h,
    successLogs24h,
    totalLogs7d,
    successLogs7d,
    byAgentRaw,
    totalSnapshots,
    usersWithMemory,
    oldestSnapshot,
    recentActions,
  ] = await Promise.all([
    prisma.aiAgent.findMany({ orderBy: { name: "asc" } }),
    prisma.aiAutonomyLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.aiAutonomyLog.count({ where: { createdAt: { gte: last24h }, success: true } }),
    prisma.aiAutonomyLog.count({ where: { createdAt: { gte: last7d } } }),
    prisma.aiAutonomyLog.count({ where: { createdAt: { gte: last7d }, success: true } }),
    prisma.aiAutonomyLog.groupBy({
      by: ["agentName"],
      where: { createdAt: { gte: last7d } },
      _count: { id: true },
    }),
    prisma.aiMemorySnapshot.count(),
    prisma.aiMemorySnapshot.groupBy({ by: ["userId"], _count: { id: true } }),
    prisma.aiMemorySnapshot.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.aiAutonomyLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        agentName: true,
        actionType: true,
        decision: true,
        reasoning: true,
        success: true,
        createdAt: true,
      },
    }),
  ]);

  // Compute success rates by agent
  const byAgentWithSuccess = await Promise.all(
    byAgentRaw.map(async (entry) => {
      const successCount = await prisma.aiAutonomyLog.count({
        where: { agentName: entry.agentName, createdAt: { gte: last7d }, success: true },
      });
      return {
        agentName: entry.agentName,
        count: entry._count.id,
        successRate: entry._count.id > 0 ? Math.round((successCount / entry._count.id) * 100) : 0,
      };
    }),
  );

  return {
    scheduler: getSchedulerStatus(),
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      domain: a.domain,
      description: a.description,
      enabled: a.enabled,
      level: a.level,
      config: (a.config ?? {}) as Record<string, unknown>,
    })),
    stats: {
      last24h: {
        total: totalLogs24h,
        successful: successLogs24h,
        failed: totalLogs24h - successLogs24h,
      },
      last7d: {
        total: totalLogs7d,
        successful: successLogs7d,
        failed: totalLogs7d - successLogs7d,
      },
      byAgent: byAgentWithSuccess,
    },
    memoryStats: {
      totalSnapshots,
      usersWithMemory: usersWithMemory.length,
      oldestSnapshot: oldestSnapshot?.createdAt?.toISOString() ?? null,
    },
    recentActions,
  };
}

// ─────────────────────────────────────────────
// Agent Management
// ─────────────────────────────────────────────

export async function toggleAgent(agentName: string, enabled: boolean) {
  const agent = await prisma.aiAgent.findFirst({ where: { name: agentName } });
  if (!agent) {
    // Créer l'agent s'il n'existe pas
    return prisma.aiAgent.create({
      data: { name: agentName, slug: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), domain: "auto", enabled, description: `Agent ${agentName}` },
    });
  }
  return prisma.aiAgent.update({
    where: { id: agent.id },
    data: { enabled },
  });
}

export async function updateAgentConfig(agentName: string, config: Record<string, unknown>) {
  const agent = await prisma.aiAgent.findFirst({ where: { name: agentName } });
  if (!agent) {
    return prisma.aiAgent.create({
      data: { name: agentName, slug: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), domain: "auto", config: config as any, description: `Agent ${agentName}` },
    });
  }
  // Merge existing config with new values
  const existingConfig = (agent.config ?? {}) as Record<string, unknown>;
  const mergedConfig = { ...existingConfig, ...config };
  return prisma.aiAgent.update({
    where: { id: agent.id },
    data: { config: mergedConfig as any },
  });
}

export async function getAgentConfig(agentName: string) {
  const agent = await prisma.aiAgent.findFirst({ where: { name: agentName } });
  if (!agent) return null;
  return {
    id: agent.id,
    name: agent.name,
    domain: agent.domain,
    description: agent.description,
    enabled: agent.enabled,
    level: agent.level,
    config: (agent.config ?? {}) as Record<string, unknown>,
  };
}

// ─────────────────────────────────────────────
// Autonomy Logs
// ─────────────────────────────────────────────

export async function getAutonomyLogs(params: {
  page?: number;
  limit?: number;
  agentName?: string;
  actionType?: string;
  success?: boolean;
  targetUserId?: string;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 30, 100);

  const where: Record<string, unknown> = {};
  if (params.agentName) where.agentName = params.agentName;
  if (params.actionType) where.actionType = params.actionType;
  if (params.success !== undefined) where.success = params.success;
  if (params.targetUserId) where.targetUserId = params.targetUserId;

  const [logs, total] = await Promise.all([
    prisma.aiAutonomyLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiAutonomyLog.count({ where }),
  ]);

  return { logs, total, page, totalPages: Math.ceil(total / limit) };
}

// ─────────────────────────────────────────────
// Memory Management
// ─────────────────────────────────────────────

export async function getMemorySnapshots(params: {
  page?: number;
  limit?: number;
  userId?: string;
  agentName?: string;
  snapshotType?: string;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 30, 100);

  const where: Record<string, unknown> = {};
  if (params.userId) where.userId = params.userId;
  if (params.agentName) where.agentName = params.agentName;
  if (params.snapshotType) where.snapshotType = params.snapshotType;

  const [snapshots, total] = await Promise.all([
    prisma.aiMemorySnapshot.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiMemorySnapshot.count({ where }),
  ]);

  return { snapshots, total, page, totalPages: Math.ceil(total / limit) };
}

/**
 * Purger la mémoire IA d'un utilisateur spécifique (SUPER_ADMIN).
 */
export async function purgeUserMemory(userId: string): Promise<number> {
  const deleted = await prisma.aiMemorySnapshot.deleteMany({ where: { userId } });
  return deleted.count;
}

/**
 * Purger les logs d'autonomie anciens (> 90 jours).
 */
export async function purgeOldLogs(): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.aiAutonomyLog.deleteMany({
    where: { createdAt: { lt: ninetyDaysAgo } },
  });
  return deleted.count;
}

// ─────────────────────────────────────────────
// Manual Trigger
// ─────────────────────────────────────────────

export { triggerManualCycle };

// ─────────────────────────────────────────────
// Seed Default Agents
// ─────────────────────────────────────────────

/**
 * Initialise les agents IA par défaut s'ils n'existent pas.
 * Appelé au démarrage de l'API.
 */
export async function seedDefaultAgents(): Promise<void> {
  const defaults = [
    {
      name: "IA_SCHEDULER",
      domain: "system",
      description: "Contrôleur global du scheduler d'autonomie IA",
      config: {},
    },
    {
      name: "IA_ANALYTIQUE",
      domain: "analytics",
      description: "Mémoire longue, détection d'anomalies, tendances, prédictions",
      config: { weeklySnapshotsEnabled: true },
    },
    {
      name: "IA_MARCHAND",
      domain: "negotiation",
      description: "Auto-négociation intelligente, conseils vendeur/acheteur, intelligence marché",
      config: {
        autoNegotiationEnabled: true,
        minFloorPercent: 70,
        maxAutoDiscountPercent: 20,
        preferredCounterPercent: 90,
        prioritizeSpeed: false,
      },
    },
    {
      name: "IA_COMMANDE",
      domain: "orders",
      description: "Récupération paniers, auto-validation commandes, optimisation checkout",
      config: {
        autoRecoveryEnabled: true,
        autoValidationEnabled: true,
      },
    },
    {
      name: "IA_ADS",
      domain: "advertising",
      description: "Auto-optimisation campagnes, ciblage intelligent, suggestions de campagnes",
      config: { autoOptimizationEnabled: true },
    },
    {
      name: "IA_LISTING_QUALITY",
      domain: "listings",
      description: "Évaluation qualité des annonces, score A-F, suggestions d'amélioration",
      config: {},
    },
    {
      name: "IA_PRICE_ADVISOR",
      domain: "listings",
      description: "Conseil tarification basé sur le marché local",
      config: {},
    },
    {
      name: "IA_MESSAGE_GUARD",
      domain: "security",
      description: "Contrôle des messages — détection contacts, fraude, obfuscation",
      config: {},
    },
    {
      name: "IA_CONTENT_GUARD",
      domain: "security",
      description: "Modération des posts SoKin — spam, abus, contacts",
      config: {},
    },
  ];

  for (const agent of defaults) {
    const existing = await prisma.aiAgent.findFirst({ where: { name: agent.name } });
    if (!existing) {
      await prisma.aiAgent.create({ data: { ...agent, slug: agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), config: agent.config } });
    }
  }
}
