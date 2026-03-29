/**
 * Message Guard — Risk Engine (Score de Risque)
 *
 * Agrège les résultats de tous les moteurs et calcule un score de risque.
 * Détermine le verdict : ALLOWED, WARNED, BLOCKED.
 * Gère la réaction appropriée.
 */

import type { MessageGuardCategory, MessageGuardVerdict } from "@prisma/client";
import type { PatternDetection } from "./pattern-engine.js";
import type { ObfuscationDetection } from "./obfuscation-engine.js";
import type { IntentDetection } from "./intent-engine.js";
import type { SequenceDetection } from "./sequence-engine.js";

export interface RiskAssessment {
  score: number;             // 0-100
  verdict: MessageGuardVerdict;
  categories: MessageGuardCategory[];
  detections: Detection[];
  warningMessage: string | null;
}

export interface Detection {
  engine: "pattern" | "obfuscation" | "intent" | "sequence";
  type: string;
  matched: string;
  confidence: number;
  points: number;
}

/* ── Poids par type de détection ── */
const WEIGHTS: Record<string, number> = {
  // Pattern Engine
  PHONE: 40,
  EMAIL: 35,
  URL: 30,
  SOCIAL_HANDLE: 15,
  // Obfuscation Engine
  OBFUSCATED_PHONE: 45,
  OBFUSCATED_EMAIL: 40,
  OBFUSCATED_PLATFORM: 35,
  OBFUSCATED_CONTACT: 30,
  // Intent Engine
  EXIT_PLATFORM: 30,
  OFF_PLATFORM_TRADE: 40,
  OFF_PLATFORM_PAYMENT: 45,
  EXTERNAL_COMMUNICATION: 35,
  // Sequence Engine
  FRAGMENTED_PHONE: 50,
  FRAGMENTED_EMAIL: 45,
  FRAGMENTED_CONTACT: 40,
};

/* ── Seuils de décision ── */
const WARN_THRESHOLD = 25;
const BLOCK_THRESHOLD = 50;

/* ── Mapping type → catégorie ── */
function mapCategory(type: string): MessageGuardCategory {
  switch (type) {
    case "PHONE":
    case "OBFUSCATED_PHONE":
      return "PHONE_NUMBER";
    case "EMAIL":
    case "OBFUSCATED_EMAIL":
      return "EMAIL";
    case "URL":
      return "EXTERNAL_LINK";
    case "SOCIAL_HANDLE":
    case "OBFUSCATED_PLATFORM":
      return "SOCIAL_HANDLE";
    case "EXIT_PLATFORM":
    case "EXTERNAL_COMMUNICATION":
      return "PLATFORM_EXIT_INTENT";
    case "OFF_PLATFORM_TRADE":
      return "OFF_PLATFORM_TRADE";
    case "OFF_PLATFORM_PAYMENT":
      return "OFF_PLATFORM_PAYMENT";
    case "FRAGMENTED_PHONE":
    case "FRAGMENTED_EMAIL":
    case "FRAGMENTED_CONTACT":
      return "FRAGMENTED_INFO";
    case "OBFUSCATED_CONTACT":
      return "OBFUSCATED_CONTACT";
    default:
      return "OTHER";
  }
}

/* ── Warning messages par catégorie principale ── */
const WARNING_MESSAGES: Partial<Record<MessageGuardCategory, string>> = {
  PHONE_NUMBER: "🔒 Pour votre sécurité, le partage de numéros de téléphone n'est pas autorisé sur Kin-Sell.",
  EMAIL: "🔒 Pour votre sécurité, le partage d'adresses email n'est pas autorisé sur Kin-Sell.",
  EXTERNAL_LINK: "🔒 Les liens externes ne sont pas autorisés dans les messages Kin-Sell.",
  SOCIAL_HANDLE: "🔒 Le partage de comptes de réseaux sociaux n'est pas autorisé sur Kin-Sell.",
  PLATFORM_EXIT_INTENT: "🔒 Pour votre protection, gardez vos échanges et transactions sur Kin-Sell.",
  OFF_PLATFORM_TRADE: "🔒 Les négociations et commandes doivent se faire via le système Kin-Sell.",
  OFF_PLATFORM_PAYMENT: "🔒 Les paiements doivent passer par le système sécurisé Kin-Sell.",
  FRAGMENTED_INFO: "🔒 Tentative de partage d'informations de contact détectée.",
  OBFUSCATED_CONTACT: "🔒 Tentative de partage d'informations de contact détectée.",
};

/**
 * Évalue le risque global à partir de toutes les détections.
 */
export function assessRisk(
  patterns: PatternDetection[],
  obfuscations: ObfuscationDetection[],
  intents: IntentDetection[],
  sequences: SequenceDetection[],
  context: {
    isTransactional: boolean;   // conversation liée à un article/commande
    userTrustScore: number;     // score de confiance utilisateur
    recentViolations: number;   // violations récentes (24h)
  },
): RiskAssessment {
  const detections: Detection[] = [];

  // Ajouter les détections de chaque moteur
  for (const p of patterns) {
    const basePoints = WEIGHTS[p.type] ?? 20;
    detections.push({
      engine: "pattern",
      type: p.type,
      matched: p.matched,
      confidence: p.confidence,
      points: Math.round(basePoints * p.confidence),
    });
  }

  for (const o of obfuscations) {
    const basePoints = WEIGHTS[o.type] ?? 25;
    detections.push({
      engine: "obfuscation",
      type: o.type,
      matched: o.decoded || o.matched,
      confidence: o.confidence,
      points: Math.round(basePoints * o.confidence),
    });
  }

  for (const i of intents) {
    const basePoints = WEIGHTS[i.type] ?? 20;
    detections.push({
      engine: "intent",
      type: i.type,
      matched: i.matched,
      confidence: i.confidence,
      points: Math.round(basePoints * i.confidence),
    });
  }

  for (const s of sequences) {
    const basePoints = WEIGHTS[s.type] ?? 30;
    detections.push({
      engine: "sequence",
      type: s.type,
      matched: s.combined,
      confidence: s.confidence,
      points: Math.round(basePoints * s.confidence),
    });
  }

  // Score brut = somme des points
  let rawScore = detections.reduce((sum, d) => sum + d.points, 0);

  // Modificateurs contextuels
  if (context.isTransactional) {
    rawScore = Math.round(rawScore * 1.3); // +30% si contexte transactionnel
  }
  if (context.recentViolations > 0) {
    rawScore = Math.round(rawScore * (1 + context.recentViolations * 0.2)); // +20% par violation récente
  }
  if (context.userTrustScore < 30) {
    rawScore = Math.round(rawScore * 1.2); // +20% si compte à risque
  }

  const score = Math.min(100, rawScore);

  // Catégories uniques
  const categories = [...new Set(detections.map(d => mapCategory(d.type)))];

  // Verdict
  let verdict: MessageGuardVerdict;
  if (score >= BLOCK_THRESHOLD) {
    verdict = "BLOCKED";
  } else if (score >= WARN_THRESHOLD) {
    verdict = "WARNED";
  } else {
    verdict = "ALLOWED";
  }

  // Message d'avertissement
  let warningMessage: string | null = null;
  if (verdict !== "ALLOWED" && categories.length > 0) {
    warningMessage = WARNING_MESSAGES[categories[0]] ??
      "🔒 Contenu suspect détecté. Gardez vos échanges sur Kin-Sell.";
  }

  return { score, verdict, categories, detections, warningMessage };
}
