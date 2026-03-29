/**
 * Message Guard — Service Principal
 *
 * Orchestre l'analyse complète d'un message avant envoi.
 * Pipeline : Normalize → Pattern → Obfuscation → Intent → Sequence → Risk → Verdict
 *
 * Intègre :
 * - Journalisation dans MessageGuardLog
 * - Stockage de fragments pour Sequence Engine
 * - Impact sur le Trust Score en cas de violation
 * - Création de FraudSignal en cas de récidive
 */

import { prisma } from "../../shared/db/prisma.js";
import type { MessageGuardVerdict } from "@prisma/client";
import { normalize } from "./normalizer.js";
import { detectPatterns } from "./pattern-engine.js";
import { detectObfuscation } from "./obfuscation-engine.js";
import { detectIntent } from "./intent-engine.js";
import { storeFragment, detectSequence } from "./sequence-engine.js";
import { assessRisk, type RiskAssessment } from "./risk-engine.js";

export interface GuardResult {
  allowed: boolean;
  verdict: MessageGuardVerdict;
  warningMessage: string | null;
  riskScore: number;
}

/* ── Config keys ── */
const CONFIG_ENABLED = "message_guard_enabled";
const CONFIG_SEVERITY = "message_guard_severity";

/* ── Trust score deltas ── */
const TRUST_DELTA_WARN = -2;
const TRUST_DELTA_BLOCK = -5;
const TRUST_DELTA_BLOCK_REPEAT = -10;

/**
 * Vérifie si l'IA MessageGuard est activée.
 */
async function isEnabled(): Promise<boolean> {
  const config = await prisma.messageGuardConfig.findUnique({ where: { key: CONFIG_ENABLED } });
  if (!config) return true; // activée par défaut
  return config.value === true || config.value === "true";
}

/**
 * Récupère le niveau de sévérité (1-5, défaut 3).
 */
async function getSeverity(): Promise<number> {
  const config = await prisma.messageGuardConfig.findUnique({ where: { key: CONFIG_SEVERITY } });
  if (!config) return 3;
  const val = typeof config.value === "number" ? config.value : parseInt(String(config.value), 10);
  return isNaN(val) ? 3 : Math.max(1, Math.min(5, val));
}

/**
 * Compte les violations récentes (24h) d'un utilisateur.
 */
async function getRecentViolations(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.messageGuardLog.count({
    where: {
      userId,
      verdict: { in: ["WARNED", "BLOCKED"] },
      createdAt: { gt: since },
    },
  });
}

/**
 * Point d'entrée : analyse un message avant envoi.
 */
export async function analyzeMessage(
  userId: string,
  conversationId: string,
  content: string,
  context?: {
    isTransactional?: boolean;
  },
): Promise<GuardResult> {
  // Vérifier si l'IA est activée
  const enabled = await isEnabled();
  if (!enabled) {
    return { allowed: true, verdict: "ALLOWED", warningMessage: null, riskScore: 0 };
  }

  // Skip messages vides ou très courts
  if (!content || content.trim().length < 3) {
    return { allowed: true, verdict: "ALLOWED", warningMessage: null, riskScore: 0 };
  }

  const rawText = content;
  const normalizedText = normalize(rawText);

  // Récupérer le trust score de l'utilisateur
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true, role: true },
  });

  // Les admins/super-admins ne sont pas soumis au filtrage
  if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
    return { allowed: true, verdict: "ALLOWED", warningMessage: null, riskScore: 0 };
  }

  const userTrustScore = user?.trustScore ?? 50;
  const recentViolations = await getRecentViolations(userId);
  const severity = await getSeverity();

  // ═══ Exécution des moteurs ═══

  // 1. Pattern Engine
  const patterns = detectPatterns(normalizedText, rawText);

  // 2. Obfuscation Engine
  const obfuscations = detectObfuscation(normalizedText, rawText);

  // 3. Intent Engine
  const intents = detectIntent(normalizedText);

  // 4. Sequence Engine
  const sequences = await detectSequence(userId, conversationId, normalizedText, rawText);

  // 5. Risk Engine — agrégation et verdict
  const assessment: RiskAssessment = assessRisk(
    patterns,
    obfuscations,
    intents,
    sequences,
    {
      isTransactional: context?.isTransactional ?? false,
      userTrustScore,
      recentViolations,
    },
  );

  // Ajustement par sévérité admin
  // Sévérité 1 = très permissif, 5 = très strict
  const severityMultiplier = 0.6 + (severity * 0.15); // 0.75 → 1.35
  const adjustedScore = Math.min(100, Math.round(assessment.score * severityMultiplier));

  // Re-calculer le verdict avec le score ajusté
  let verdict = assessment.verdict;
  if (adjustedScore < 25) verdict = "ALLOWED";
  else if (adjustedScore < 50) verdict = "WARNED";
  else verdict = "BLOCKED";

  // Stocker le fragment pour l'analyse séquentielle (sauf si bloqué à 100%)
  if (verdict !== "BLOCKED") {
    storeFragment(userId, conversationId, rawText, normalizedText).catch(() => {});
  }

  // ═══ Journalisation ═══
  const logData = {
    userId,
    conversationId,
    messageContent: rawText.substring(0, 500), // tronquer pour la DB
    verdict,
    riskScore: adjustedScore,
    categories: assessment.categories,
    detections: assessment.detections as any,
    engineResults: {
      patternCount: patterns.length,
      obfuscationCount: obfuscations.length,
      intentCount: intents.length,
      sequenceCount: sequences.length,
      rawScore: assessment.score,
      severity,
      adjustedScore,
    } as any,
    warningShown: assessment.warningMessage,
  };

  // Log async (ne bloque pas l'envoi)
  prisma.messageGuardLog.create({ data: logData }).catch(() => {});

  // ═══ Impact Trust Score ═══
  if (verdict === "WARNED") {
    applyTrustDelta(userId, TRUST_DELTA_WARN, "Message averti par MessageGuard", assessment.categories[0] ?? "OTHER");
  } else if (verdict === "BLOCKED") {
    const delta = recentViolations > 2 ? TRUST_DELTA_BLOCK_REPEAT : TRUST_DELTA_BLOCK;
    applyTrustDelta(userId, delta, "Message bloqué par MessageGuard", assessment.categories[0] ?? "OTHER");

    // Créer un FraudSignal si récidiviste
    if (recentViolations >= 3) {
      prisma.fraudSignal.create({
        data: {
          userId,
          signalType: "message_guard_repeat_violation",
          severity: Math.min(10, 3 + recentViolations),
          description: `Récidive: ${recentViolations + 1} violations en 24h. Catégories: ${assessment.categories.join(", ")}`,
          metadata: { riskScore: adjustedScore, categories: assessment.categories } as any,
        },
      }).catch(() => {});
    }

    // Restriction automatique si trop de violations
    if (recentViolations >= 5) {
      prisma.userRestriction.create({
        data: {
          userId,
          restrictionType: "MESSAGE_LIMIT",
          reason: `MessageGuard: ${recentViolations + 1} violations en 24h — restriction messagerie temporaire`,
          sanctionLevel: "RESTRICTION",
          isActive: true,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 heure
        },
      }).catch(() => {});
    }
  }

  return {
    allowed: verdict !== "BLOCKED",
    verdict,
    warningMessage: verdict !== "ALLOWED" ? assessment.warningMessage : null,
    riskScore: adjustedScore,
  };
}

/**
 * Applique un delta au trust score (fire & forget).
 */
function applyTrustDelta(userId: string, delta: number, reason: string, category: string): void {
  // Import dynamique pour éviter la dépendance circulaire
  import("../security/trust-score.service.js").then(({ applyDelta }) => {
    applyDelta(userId, delta, reason, "message_guard", { category }).catch(() => {});
  }).catch(() => {});
}

/* ══════════════════════════════════════════════
 * ADMIN — Fonctions de gestion
 * ══════════════════════════════════════════════ */

/**
 * Récupère le dashboard de l'IA MessageGuard.
 */
export async function getGuardDashboard() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    enabled,
    severity,
    total24h,
    warned24h,
    blocked24h,
    total7d,
    warned7d,
    blocked7d,
    topViolators,
    recentLogs,
  ] = await Promise.all([
    isEnabled(),
    getSeverity(),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last24h } } }),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last24h }, verdict: "WARNED" } }),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last24h }, verdict: "BLOCKED" } }),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last7d } } }),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last7d }, verdict: "WARNED" } }),
    prisma.messageGuardLog.count({ where: { createdAt: { gt: last7d }, verdict: "BLOCKED" } }),
    prisma.messageGuardLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gt: last7d }, verdict: { in: ["WARNED", "BLOCKED"] } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.messageGuardLog.findMany({
      where: { verdict: { in: ["WARNED", "BLOCKED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, profile: { select: { displayName: true, username: true } } } },
      },
    }),
  ]);

  // Enrichir les top violateurs avec les noms
  const violatorIds = topViolators.map(v => v.userId);
  const violatorUsers = await prisma.user.findMany({
    where: { id: { in: violatorIds } },
    select: { id: true, profile: { select: { displayName: true, username: true } } },
  });
  const violatorMap = new Map(violatorUsers.map(u => [u.id, u]));

  return {
    enabled,
    severity,
    stats: {
      last24h: { total: total24h, warned: warned24h, blocked: blocked24h },
      last7d: { total: total7d, warned: warned7d, blocked: blocked7d },
    },
    topViolators: topViolators.map(v => ({
      userId: v.userId,
      count: v._count.id,
      displayName: violatorMap.get(v.userId)?.profile?.displayName ?? "Inconnu",
      username: violatorMap.get(v.userId)?.profile?.username ?? null,
    })),
    recentLogs: recentLogs.map(l => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.profile?.displayName ?? "Inconnu",
      username: l.user.profile?.username ?? null,
      conversationId: l.conversationId,
      verdict: l.verdict,
      riskScore: l.riskScore,
      categories: l.categories,
      warningShown: l.warningShown,
      messagePreview: l.messageContent?.substring(0, 100) ?? null,
      createdAt: l.createdAt,
    })),
  };
}

/**
 * Récupère les logs paginés.
 */
export async function getGuardLogs(params: {
  page?: number;
  limit?: number;
  verdict?: string;
  userId?: string;
  category?: string;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (params.verdict && params.verdict !== "all") {
    where.verdict = params.verdict;
  }
  if (params.userId) {
    where.userId = params.userId;
  }
  if (params.category && params.category !== "all") {
    where.categories = { has: params.category };
  }

  const [logs, total] = await Promise.all([
    prisma.messageGuardLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, profile: { select: { displayName: true, username: true } } } },
      },
    }),
    prisma.messageGuardLog.count({ where }),
  ]);

  return {
    logs: logs.map(l => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.profile?.displayName ?? "Inconnu",
      username: l.user.profile?.username ?? null,
      conversationId: l.conversationId,
      verdict: l.verdict,
      riskScore: l.riskScore,
      categories: l.categories,
      detections: l.detections,
      engineResults: l.engineResults,
      warningShown: l.warningShown,
      messageContent: l.messageContent,
      createdAt: l.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Met à jour la configuration de l'IA.
 */
export async function updateGuardConfig(key: string, value: any, updatedBy: string) {
  return prisma.messageGuardConfig.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}

/**
 * Récupère toute la configuration.
 */
export async function getGuardConfig() {
  const configs = await prisma.messageGuardConfig.findMany();
  const map: Record<string, any> = {};
  for (const c of configs) {
    map[c.key] = c.value;
  }
  return {
    enabled: map[CONFIG_ENABLED] ?? true,
    severity: map[CONFIG_SEVERITY] ?? 3,
    ...map,
  };
}
