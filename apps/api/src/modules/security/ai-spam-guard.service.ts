/**
 * AI Spam Guard — Kin-Sell
 *
 * Couche de protection comportementale qui prend le relais APRÈS le captcha.
 * Elle agrège plusieurs signaux faibles en un score de risque composite pour
 * distinguer un humain légitime d'un bot/spammer qui a franchi le captcha.
 *
 * Signaux :
 *  1. Velocity (req/min) par user ET par IP sur la catégorie
 *  2. Multi-account (plusieurs comptes créés depuis la même IP en 24h)
 *  3. Trust score du user (si user connu)
 *  4. Fraud signals récents
 *  5. Nouveau device pour action sensible (si user déjà connu)
 *
 * Verdicts :
 *  - ALLOW         : score < 30 → passe silencieusement
 *  - CHALLENGE     : 30-59      → 423 Locked + flag `requireCaptcha` pour step-up
 *  - SOFT_BLOCK    : 60-79      → délai 1.5s puis allow + SecurityEvent loggé
 *  - HARD_BLOCK    : ≥ 80       → 429 + FraudSignal + SecurityEvent CRITICAL
 */

import { getRedis } from "../../shared/db/redis.js";
import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { logSecurityEvent, createFraudSignal, checkMultiAccount } from "./security.service.js";

/** Les flux sensibles protégés. */
export type SpamGuardCategory =
  | "AUTH"      // register, login
  | "PUBLISH"   // listing create, sokin post
  | "MESSAGE"   // send message, start conversation
  | "TRADE";    // cart add, negotiation start, checkout

export type SpamVerdict = "ALLOW" | "CHALLENGE" | "SOFT_BLOCK" | "HARD_BLOCK";

export interface SpamGuardInput {
  category: SpamGuardCategory;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface SpamGuardResult {
  verdict: SpamVerdict;
  score: number; // 0–100
  reasons: string[];
}

// Fenêtres de comptage (secondes) et limites normales par catégorie.
// Ces seuils sont volontairement larges pour ne pas impacter les humains.
const VELOCITY_CONFIG: Record<SpamGuardCategory, { windowSec: number; normalMax: number }> = {
  AUTH: { windowSec: 60, normalMax: 5 },      // 5 tentatives/min déjà anormal
  PUBLISH: { windowSec: 300, normalMax: 6 },  // 6 publications/5min = suspect
  MESSAGE: { windowSec: 60, normalMax: 20 },  // 20 messages/min
  TRADE: { windowSec: 60, normalMax: 15 }     // 15 actions panier/nego par minute
};

// Mémoire fallback si Redis indisponible
const memoryCounters = new Map<string, { count: number; resetAt: number }>();

async function incrementCounter(key: string, windowSec: number): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const pipeline = redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSec);
      const res = await pipeline.exec();
      const count = Array.isArray(res) && res[0] ? Number(res[0][1]) : 0;
      return Number.isFinite(count) ? count : 0;
    } catch (err) {
      logger.warn({ err }, "[SpamGuard] Redis counter failed, fallback mémoire");
    }
  }
  // Fallback mémoire
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (existing && existing.resetAt > now) {
    existing.count += 1;
    return existing.count;
  }
  memoryCounters.set(key, { count: 1, resetAt: now + windowSec * 1000 });
  return 1;
}

/** Nettoyage périodique de la mémoire fallback (évite leak). */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryCounters.entries()) {
    if (v.resetAt <= now) memoryCounters.delete(k);
  }
}, 60_000).unref?.();

/**
 * Évalue la requête et retourne un verdict.
 * Cette fonction ne bloque pas ; c'est le middleware qui applique le verdict.
 */
export async function evaluateSpamRisk(input: SpamGuardInput): Promise<SpamGuardResult> {
  const { category, userId, ipAddress, deviceId } = input;
  const reasons: string[] = [];
  let score = 0;

  const cfg = VELOCITY_CONFIG[category];

  // 1) Velocity par user (si connu)
  if (userId) {
    const key = `sg:vel:${category}:u:${userId}`;
    const n = await incrementCounter(key, cfg.windowSec);
    if (n > cfg.normalMax) {
      const overflow = n - cfg.normalMax;
      const delta = Math.min(50, overflow * 8); // +8 points par hit au-dessus du seuil, cap 50
      score += delta;
      reasons.push(`velocity_user=${n}/${cfg.normalMax} (+${delta})`);
    }
  }

  // 2) Velocity par IP (couvre les cas "pas encore de user" ou les bots multi-comptes)
  if (ipAddress) {
    const key = `sg:vel:${category}:ip:${ipAddress}`;
    const n = await incrementCounter(key, cfg.windowSec);
    // IP partagée (NAT entreprise) → seuil IP doublé
    const ipMax = cfg.normalMax * 3;
    if (n > ipMax) {
      const overflow = n - ipMax;
      const delta = Math.min(40, overflow * 4);
      score += delta;
      reasons.push(`velocity_ip=${n}/${ipMax} (+${delta})`);
    }
  }

  // 3) Multi-account depuis cette IP (seulement pour AUTH — très fort signal pour register)
  if (ipAddress && category === "AUTH") {
    const multi = await checkMultiAccount(ipAddress).catch(() => ({ suspicious: false, accountCount: 0 }));
    if (multi.suspicious) {
      const delta = Math.min(30, multi.accountCount * 5);
      score += delta;
      reasons.push(`multi_account=${multi.accountCount} (+${delta})`);
    }
  }

  // 4) Trust score user (si user connu)
  if (userId) {
    const user = await prisma.user
      .findUnique({ where: { id: userId }, select: { trustScore: true } })
      .catch(() => null);
    if (user) {
      const ts = user.trustScore;
      if (ts < 30) {
        score += 25;
        reasons.push(`low_trust=${ts} (+25)`);
      } else if (ts < 60) {
        score += 10;
        reasons.push(`mid_trust=${ts} (+10)`);
      } else if (ts >= 85) {
        // Bonus pour users de confiance : réduit le score
        score -= 10;
        reasons.push(`high_trust=${ts} (-10)`);
      }
    }
  }

  // 5) Fraud signals récents (24h)
  if (userId) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSignals = await prisma.fraudSignal
      .count({ where: { userId, createdAt: { gte: cutoff } } })
      .catch(() => 0);
    if (recentSignals > 0) {
      const delta = Math.min(25, recentSignals * 10);
      score += delta;
      reasons.push(`recent_fraud_signals=${recentSignals} (+${delta})`);
    }
  }

  // 6) Nouveau device pour action sensible (uniquement user connu)
  if (userId && deviceId && category !== "AUTH") {
    const seen = await prisma.userSession
      .findFirst({ where: { userId, deviceId }, select: { id: true } })
      .catch(() => null);
    if (!seen) {
      score += 10;
      reasons.push("new_device_on_sensitive_action (+10)");
    }
  }

  // Normalise
  score = Math.max(0, Math.min(100, score));

  let verdict: SpamVerdict = "ALLOW";
  if (score >= 80) verdict = "HARD_BLOCK";
  else if (score >= 60) verdict = "SOFT_BLOCK";
  else if (score >= 30) verdict = "CHALLENGE";

  return { verdict, score, reasons };
}

/**
 * Enregistre la décision dans le journal sécurité (SecurityEvent) et crée
 * un FraudSignal en cas de HARD_BLOCK.
 */
export async function recordSpamVerdict(
  input: SpamGuardInput,
  result: SpamGuardResult
): Promise<void> {
  if (result.verdict === "ALLOW") return;

  const severity = result.verdict === "HARD_BLOCK" ? 3 : result.verdict === "SOFT_BLOCK" ? 2 : 1;

  await logSecurityEvent({
    userId: input.userId,
    eventType: `SPAM_GUARD_${result.verdict}`,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    deviceId: input.deviceId,
    riskLevel: severity,
    metadata: {
      category: input.category,
      score: result.score,
      reasons: result.reasons
    }
  }).catch((err) => logger.warn({ err }, "[SpamGuard] logSecurityEvent failed"));

  if (result.verdict === "HARD_BLOCK" && input.userId) {
    await createFraudSignal({
      userId: input.userId,
      signalType: "SPAM_GUARD_HARD_BLOCK",
      severity,
      description: `IA anti-spam ${input.category} score=${result.score}`,
      metadata: { reasons: result.reasons, ipAddress: input.ipAddress }
    }).catch((err) => logger.warn({ err }, "[SpamGuard] createFraudSignal failed"));
  }
}
