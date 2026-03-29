/**
 * IA MÉMOIRE LONGUE — AI Memory Persistence System
 *
 * Stocke des snapshots périodiques des métriques clés pour chaque vendeur.
 * Permet à l'IA Analytique de :
 * - Comparer les performances actuelles vs historiques
 * - Détecter des anomalies (chutes/hausses soudaines)
 * - Générer des tendances hebdo/mensuel
 * - Prédire les performances futures
 *
 * Types de snapshots :
 *   WEEKLY  — Résumé hebdomadaire automatique
 *   MONTHLY — Résumé mensuel automatique
 *   ANOMALY — Détection d'anomalie stockée
 *   TREND   — Tendance remarquable détectée
 */

import { prisma } from "../../shared/db/prisma.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface WeeklyMetrics {
  activeListings: number;
  totalNegotiations: number;
  acceptedNegotiations: number;
  ordersCompleted: number;
  revenueCents: number;
  avgPriceCents: number;
  cartAbandonment: number;
  trustScore: number;
  negoConversionRate: number;
  topCategory: string | null;
  topCity: string | null;
}

export interface AnomalyReport {
  metric: string;
  currentValue: number;
  historicalAvg: number;
  deviationPercent: number;
  direction: "UP" | "DOWN";
  severity: "LOW" | "MEDIUM" | "HIGH";
  insight: string;
}

export interface TrendAnalysis {
  metric: string;
  direction: "GROWING" | "STABLE" | "DECLINING";
  weekOverWeek: number;    // % change
  monthOverMonth: number;  // % change
  insight: string;
}

export interface MemoryEnhancedReport {
  currentMetrics: WeeklyMetrics;
  anomalies: AnomalyReport[];
  trends: TrendAnalysis[];
  predictions: string[];
  historicalComparison: {
    vsLastWeek: Record<string, { current: number; previous: number; changePercent: number }>;
    vsLastMonth: Record<string, { current: number; previous: number; changePercent: number }>;
  };
  memoryDepth: number; // nombre de semaines de données historiques
}

// ─────────────────────────────────────────────
// Snapshot Storage
// ─────────────────────────────────────────────

export async function storeSnapshot(
  userId: string,
  agentName: string,
  snapshotType: string,
  data: Record<string, unknown>,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  await prisma.aiMemorySnapshot.create({
    data: { userId, agentName, snapshotType, data: data as any, periodStart, periodEnd },
  });
}

export async function getSnapshots(
  userId: string,
  agentName: string,
  snapshotType?: string,
  limit = 52,
) {
  return prisma.aiMemorySnapshot.findMany({
    where: {
      userId,
      agentName,
      ...(snapshotType ? { snapshotType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLatestSnapshot(userId: string, agentName: string, snapshotType: string) {
  return prisma.aiMemorySnapshot.findFirst({
    where: { userId, agentName, snapshotType },
    orderBy: { createdAt: "desc" },
  });
}

// ─────────────────────────────────────────────
// Weekly Metrics Computation
// ─────────────────────────────────────────────

export async function computeCurrentMetrics(userId: string): Promise<WeeklyMetrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    activeListings,
    negotiations,
    acceptedNegotiations,
    orders,
    myListings,
    cartData,
    user,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    prisma.negotiation.count({ where: { sellerUserId: userId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.negotiation.count({ where: { sellerUserId: userId, status: "ACCEPTED", createdAt: { gte: sevenDaysAgo } } }),
    prisma.order.findMany({
      where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: sevenDaysAgo } },
      select: { totalUsdCents: true, items: { select: { category: true, city: true } } },
    }),
    prisma.listing.findMany({
      where: { ownerUserId: userId, status: "ACTIVE" },
      select: { priceUsdCents: true, category: true, city: true },
    }),
    prisma.cart.findMany({
      where: {
        items: { some: { listing: { ownerUserId: userId } } },
        createdAt: { gte: sevenDaysAgo },
      },
      select: { status: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { trustScore: true } }),
  ]);

  const revenueCents = orders.reduce((s, o) => s + o.totalUsdCents, 0);
  const avgPriceCents = myListings.length > 0
    ? Math.round(myListings.reduce((s, l) => s + l.priceUsdCents, 0) / myListings.length)
    : 0;
  const totalCarts = cartData.length;
  const abandonedCarts = cartData.filter((c) => c.status === "OPEN").length;
  const cartAbandonment = totalCarts > 0 ? Math.round((abandonedCarts / totalCarts) * 100) : 0;
  const negoConversionRate = negotiations > 0 ? Math.round((acceptedNegotiations / negotiations) * 100) : 0;

  // Top category & city
  const catCounts: Record<string, number> = {};
  const cityCounts: Record<string, number> = {};
  for (const l of myListings) {
    catCounts[l.category] = (catCounts[l.category] ?? 0) + 1;
    cityCounts[l.city] = (cityCounts[l.city] ?? 0) + 1;
  }
  const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    activeListings,
    totalNegotiations: negotiations,
    acceptedNegotiations,
    ordersCompleted: orders.length,
    revenueCents,
    avgPriceCents,
    cartAbandonment,
    trustScore: user?.trustScore ?? 50,
    negoConversionRate,
    topCategory,
    topCity,
  };
}

/**
 * Crée un snapshot hebdomadaire pour un utilisateur.
 * Appelé automatiquement par le scheduler.
 */
export async function createWeeklySnapshot(userId: string): Promise<void> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Éviter les doublons (pas de snapshot si déjà un dans les 5 derniers jours)
  const recent = await prisma.aiMemorySnapshot.findFirst({
    where: {
      userId,
      agentName: "IA_ANALYTIQUE",
      snapshotType: "WEEKLY",
      createdAt: { gte: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
    },
  });
  if (recent) return;

  const metrics = await computeCurrentMetrics(userId);
  await storeSnapshot(userId, "IA_ANALYTIQUE", "WEEKLY", metrics as unknown as Record<string, unknown>, weekAgo, now);
}

// ─────────────────────────────────────────────
// Anomaly Detection
// ─────────────────────────────────────────────

export async function detectAnomalies(userId: string): Promise<AnomalyReport[]> {
  const currentMetrics = await computeCurrentMetrics(userId);
  const historicalSnapshots = await getSnapshots(userId, "IA_ANALYTIQUE", "WEEKLY", 12);

  if (historicalSnapshots.length < 3) return []; // Pas assez de données

  const anomalies: AnomalyReport[] = [];
  const metricsToCheck: Array<{ key: keyof WeeklyMetrics; label: string; direction: "higher_bad" | "lower_bad" | "both" }> = [
    { key: "ordersCompleted", label: "Commandes", direction: "lower_bad" },
    { key: "revenueCents", label: "Revenus", direction: "lower_bad" },
    { key: "negoConversionRate", label: "Taux conversion négo", direction: "lower_bad" },
    { key: "cartAbandonment", label: "Abandon panier", direction: "higher_bad" },
    { key: "activeListings", label: "Annonces actives", direction: "lower_bad" },
    { key: "trustScore", label: "Score confiance", direction: "lower_bad" },
  ];

  for (const { key, label, direction } of metricsToCheck) {
    const currentVal = currentMetrics[key];
    if (typeof currentVal !== "number") continue;

    const historicalValues = historicalSnapshots
      .map((s) => (s.data as Record<string, unknown>)[key])
      .filter((v) => typeof v === "number") as number[];

    if (historicalValues.length < 3) continue;

    const avg = historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length;
    if (avg === 0) continue;

    const deviationPercent = Math.round(((currentVal - avg) / avg) * 100);
    const absDeviation = Math.abs(deviationPercent);

    if (absDeviation < 25) continue; // Pas d'anomalie significative

    const isUp = deviationPercent > 0;
    const isBad = (direction === "higher_bad" && isUp) || (direction === "lower_bad" && !isUp);

    const severity: AnomalyReport["severity"] =
      absDeviation >= 60 ? "HIGH" : absDeviation >= 40 ? "MEDIUM" : "LOW";

    let insight: string;
    if (isBad) {
      insight = `⚠️ ${label} : ${isUp ? "hausse" : "baisse"} anormale de ${absDeviation}% vs moyenne historique. Action recommandée.`;
    } else {
      insight = `✅ ${label} : ${isUp ? "hausse" : "baisse"} positive de ${absDeviation}% vs moyenne historique. Continuez !`;
    }

    anomalies.push({
      metric: key,
      currentValue: currentVal,
      historicalAvg: Math.round(avg),
      deviationPercent,
      direction: isUp ? "UP" : "DOWN",
      severity: isBad ? severity : "LOW",
      insight,
    });
  }

  // Stocker les anomalies significatives
  const significantAnomalies = anomalies.filter((a) => a.severity !== "LOW");
  if (significantAnomalies.length > 0) {
    const now = new Date();
    await storeSnapshot(
      userId,
      "IA_ANALYTIQUE",
      "ANOMALY",
      { anomalies: significantAnomalies } as unknown as Record<string, unknown>,
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      now,
    );
  }

  return anomalies;
}

// ─────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────

export async function analyzeTrends(userId: string): Promise<TrendAnalysis[]> {
  const weeklySnapshots = await getSnapshots(userId, "IA_ANALYTIQUE", "WEEKLY", 8);
  if (weeklySnapshots.length < 2) return [];

  const trends: TrendAnalysis[] = [];
  const metricsToTrack: Array<{ key: string; label: string }> = [
    { key: "ordersCompleted", label: "Commandes" },
    { key: "revenueCents", label: "Revenus" },
    { key: "negoConversionRate", label: "Taux conversion" },
    { key: "activeListings", label: "Annonces actives" },
  ];

  // Sort oldest first for trend analysis
  const sorted = [...weeklySnapshots].reverse();

  for (const { key, label } of metricsToTrack) {
    const values = sorted.map((s) => (s.data as Record<string, unknown>)[key]).filter((v) => typeof v === "number") as number[];
    if (values.length < 2) continue;

    const latest = values[values.length - 1];
    const previous = values[values.length - 2];
    const weekOverWeek = previous > 0 ? Math.round(((latest - previous) / previous) * 100) : 0;

    // Month over month (4 semaines)
    const monthAgoVal = values.length >= 5 ? values[values.length - 5] : values[0];
    const monthOverMonth = monthAgoVal > 0 ? Math.round(((latest - monthAgoVal) / monthAgoVal) * 100) : 0;

    let direction: TrendAnalysis["direction"];
    if (weekOverWeek > 10 && monthOverMonth > 5) direction = "GROWING";
    else if (weekOverWeek < -10 && monthOverMonth < -5) direction = "DECLINING";
    else direction = "STABLE";

    let insight: string;
    if (direction === "GROWING") {
      insight = `📈 ${label} en croissance (+${weekOverWeek}% semaine, +${monthOverMonth}% mois). Continuez sur cette lancée.`;
    } else if (direction === "DECLINING") {
      insight = `📉 ${label} en déclin (${weekOverWeek}% semaine, ${monthOverMonth}% mois). Intervention IA recommandée.`;
    } else {
      insight = `➡️ ${label} stable (${weekOverWeek >= 0 ? "+" : ""}${weekOverWeek}% semaine).`;
    }

    trends.push({ metric: key, direction, weekOverWeek, monthOverMonth, insight });
  }

  return trends;
}

// ─────────────────────────────────────────────
// Memory-Enhanced Report (combines everything)
// ─────────────────────────────────────────────

export async function getMemoryEnhancedReport(userId: string): Promise<MemoryEnhancedReport> {
  const [currentMetrics, anomalies, trends, weeklySnapshots] = await Promise.all([
    computeCurrentMetrics(userId),
    detectAnomalies(userId),
    analyzeTrends(userId),
    getSnapshots(userId, "IA_ANALYTIQUE", "WEEKLY", 8),
  ]);

  // Historical comparison
  const lastWeek = weeklySnapshots[0]?.data as Record<string, unknown> | undefined;
  const lastMonth = weeklySnapshots[3]?.data as Record<string, unknown> | undefined;

  function buildComparison(
    previous: Record<string, unknown> | undefined,
  ): Record<string, { current: number; previous: number; changePercent: number }> {
    if (!previous) return {};
    const result: Record<string, { current: number; previous: number; changePercent: number }> = {};
    const keys = ["ordersCompleted", "revenueCents", "negoConversionRate", "activeListings", "cartAbandonment"];
    for (const key of keys) {
      const curr = (currentMetrics as unknown as Record<string, unknown>)[key];
      const prev = previous[key];
      if (typeof curr === "number" && typeof prev === "number") {
        result[key] = {
          current: curr,
          previous: prev,
          changePercent: prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0,
        };
      }
    }
    return result;
  }

  // Predictions based on trends
  const predictions: string[] = [];
  for (const trend of trends) {
    if (trend.direction === "DECLINING" && trend.metric === "ordersCompleted") {
      predictions.push("📊 Si la tendance continue, vos commandes pourraient baisser de 30-50% le mois prochain. Activez l'IA Marchand + Ads.");
    }
    if (trend.direction === "DECLINING" && trend.metric === "revenueCents") {
      predictions.push("💰 Revenus en déclin — l'IA recommande de diversifier vos catégories ou d'ajuster vos prix.");
    }
    if (trend.direction === "GROWING" && trend.metric === "ordersCompleted") {
      predictions.push("🚀 Vos commandes accélèrent — c'est le moment d'augmenter votre inventaire.");
    }
    if (trend.direction === "GROWING" && trend.metric === "revenueCents") {
      predictions.push("💎 Revenus en hausse — envisagez une campagne publicitaire pour capitaliser sur la dynamique.");
    }
  }

  for (const anomaly of anomalies) {
    if (anomaly.severity === "HIGH" && anomaly.direction === "DOWN") {
      predictions.push(`🔴 Alerte : ${anomaly.metric} en chute critique. L'IA orchestre un plan de récupération.`);
    }
  }

  if (predictions.length === 0) {
    predictions.push("📊 Votre activité est stable. L'IA surveille vos métriques en continu.");
  }

  return {
    currentMetrics,
    anomalies,
    trends,
    predictions,
    historicalComparison: {
      vsLastWeek: buildComparison(lastWeek),
      vsLastMonth: buildComparison(lastMonth),
    },
    memoryDepth: weeklySnapshots.length,
  };
}

/**
 * Batch : crée des snapshots hebdomadaires pour tous les vendeurs actifs.
 * Appelé par le scheduler autonome.
 */
export async function batchCreateWeeklySnapshots(): Promise<number> {
  const activeSellers = await prisma.user.findMany({
    where: {
      role: { in: ["USER", "BUSINESS"] },
      accountStatus: "ACTIVE",
      listings: { some: { status: "ACTIVE" } },
    },
    select: { id: true },
    take: 500,
  });

  let created = 0;
  for (const seller of activeSellers) {
    try {
      await createWeeklySnapshot(seller.id);
      created++;
    } catch {
      // Continue silently
    }
  }
  return created;
}
