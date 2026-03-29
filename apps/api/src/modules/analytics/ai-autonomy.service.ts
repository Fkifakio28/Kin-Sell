/**
 * IA AUTONOMIE — AI Autonomy Scheduler
 *
 * Moteur central qui coordonne l'exécution périodique de toutes les tâches
 * autonomes des agents IA de Kin-Sell.
 *
 * Cycles :
 * - Toutes les 15 min : Auto-négociation, Récupération paniers
 * - Toutes les 30 min : Auto-optimisation publicitaire
 * - Toutes les heures : Auto-validation commandes
 * - Chaque nuit (3h)  : Snapshots mémoire hebdomadaires
 *
 * Chaque tâche vérifie si l'agent est activé avant d'exécuter.
 * Tous les résultats sont logués dans AiAutonomyLog.
 *
 * Contrôle Super Admin :
 * - Chaque agent peut être activé/désactivé via AiAgent.enabled
 * - Les paramètres de chaque agent sont dans AiAgent.config (JSON)
 * - Le scheduler global peut être stoppé via AiAgent "IA_SCHEDULER"
 */

import { prisma } from "../../shared/db/prisma.js";
import { runBatchAutoNegotiation } from "../negotiations/negotiation-ai.service.js";
import { runBatchCartRecovery, runBatchOrderAutoValidation } from "../orders/order-ai.service.js";
import { runAutoAdOptimization } from "../ads/ad-advisor.service.js";
import { batchCreateWeeklySnapshots } from "../analytics/ai-memory.service.js";

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let schedulerRunning = false;
let _intervals: ReturnType<typeof setInterval>[] = [];

// ─────────────────────────────────────────────
// Guard: check if scheduler is globally enabled
// ─────────────────────────────────────────────

async function isSchedulerEnabled(): Promise<boolean> {
  const agent = await prisma.aiAgent.findFirst({
    where: { name: "IA_SCHEDULER" },
  });
  // Si l'agent scheduler n'existe pas, on le suppose activé par défaut
  return agent?.enabled !== false;
}

// ─────────────────────────────────────────────
// Task Wrappers with logging
// ─────────────────────────────────────────────

async function safeRun(taskName: string, fn: () => Promise<unknown>): Promise<void> {
  if (!(await isSchedulerEnabled())) return;
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    console.log(`[IA-Autonomie] ✅ ${taskName} — ${durationMs}ms —`, JSON.stringify(result));
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error(`[IA-Autonomie] ❌ ${taskName} — ${durationMs}ms — Erreur:`, (err as Error).message);
  }
}

// ─────────────────────────────────────────────
// Scheduled Tasks
// ─────────────────────────────────────────────

/**
 * Cycle rapide (15 min) : Négociations auto + Paniers
 */
async function runFastCycle(): Promise<void> {
  await safeRun("IA_MARCHAND auto-négociation", runBatchAutoNegotiation);
  await safeRun("IA_COMMANDE récupération paniers", runBatchCartRecovery);
}

/**
 * Cycle moyen (30 min) : Optimisation publicitaire
 */
async function runMediumCycle(): Promise<void> {
  await safeRun("IA_ADS auto-optimisation", runAutoAdOptimization);
}

/**
 * Cycle lent (1h) : Validation commandes
 */
async function runSlowCycle(): Promise<void> {
  await safeRun("IA_COMMANDE auto-validation", runBatchOrderAutoValidation);
}

/**
 * Cycle nocturne (24h) : Snapshots mémoire
 */
async function runNightlyCycle(): Promise<void> {
  await safeRun("IA_ANALYTIQUE mémoire hebdo", batchCreateWeeklySnapshots);
}

// ─────────────────────────────────────────────
// Scheduler Lifecycle
// ─────────────────────────────────────────────

/**
 * Démarre le scheduler d'autonomie IA.
 * Appelé au démarrage de l'API dans index.ts.
 */
export function startAiAutonomyScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;

  console.log("[IA-Autonomie] 🤖 Scheduler démarré — cycles: 15min / 30min / 1h / 24h");

  // Premier cycle immédiat (décalé de 30s pour laisser l'API démarrer)
  setTimeout(() => {
    void runFastCycle();
  }, 30_000);

  setTimeout(() => {
    void runMediumCycle();
  }, 60_000);

  // Cycles réguliers
  _intervals.push(
    setInterval(() => { void runFastCycle(); }, 15 * 60 * 1000),        // 15 min
    setInterval(() => { void runMediumCycle(); }, 30 * 60 * 1000),      // 30 min
    setInterval(() => { void runSlowCycle(); }, 60 * 60 * 1000),        // 1h
    setInterval(() => { void runNightlyCycle(); }, 24 * 60 * 60 * 1000), // 24h
  );

  // Schedule nightly at ~3h du matin (ajusté au prochain 3h)
  scheduleNightly();
}

function scheduleNightly(): void {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am.getTime() <= now.getTime()) {
    next3am.setDate(next3am.getDate() + 1);
  }
  const delay = next3am.getTime() - now.getTime();
  setTimeout(() => {
    void runNightlyCycle();
    // Puis toutes les 24h
    _intervals.push(setInterval(() => { void runNightlyCycle(); }, 24 * 60 * 60 * 1000));
  }, delay);
}

/**
 * Stoppe le scheduler (pour les tests ou le shutdown).
 */
export function stopAiAutonomyScheduler(): void {
  for (const interval of _intervals) {
    clearInterval(interval);
  }
  _intervals = [];
  schedulerRunning = false;
  console.log("[IA-Autonomie] ⏹️ Scheduler arrêté");
}

/**
 * Exécution manuelle forcée (Super Admin).
 * Permet de déclencher un cycle spécifique à la demande.
 */
export async function triggerManualCycle(
  cycle: "fast" | "medium" | "slow" | "nightly" | "all",
): Promise<{ cycle: string; executedAt: string }> {
  switch (cycle) {
    case "fast":
      await runFastCycle();
      break;
    case "medium":
      await runMediumCycle();
      break;
    case "slow":
      await runSlowCycle();
      break;
    case "nightly":
      await runNightlyCycle();
      break;
    case "all":
      await runFastCycle();
      await runMediumCycle();
      await runSlowCycle();
      await runNightlyCycle();
      break;
  }
  return { cycle, executedAt: new Date().toISOString() };
}

/**
 * Retourne l'état du scheduler pour le dashboard admin.
 */
export function getSchedulerStatus(): {
  running: boolean;
  intervalsCount: number;
} {
  return {
    running: schedulerRunning,
    intervalsCount: _intervals.length,
  };
}
