/**
 * ContentGuard — IA de modération de contenu (SoKin + Listings)
 *
 * Utilise le pipeline complet de MessageGuard (normalize → pattern → obfuscation → intent → risk)
 * pour détecter les partages de coordonnées, redirections hors plateforme, etc.
 *
 * Ajoute des vérifications spécifiques au contexte :
 * - SoKin : langage abusif, spam, hashtag flooding, caps lock
 * - Listings : mêmes vérifications sans hashtags
 *
 * Retourne une décision : ALLOW | WARN | BLOCK
 */

import { prisma } from "../../shared/db/prisma.js";
import { normalize } from "../message-guard/normalizer.js";
import { detectPatterns } from "../message-guard/pattern-engine.js";
import { detectObfuscation } from "../message-guard/obfuscation-engine.js";
import { detectIntent } from "../message-guard/intent-engine.js";
import { assessRisk } from "../message-guard/risk-engine.js";

export type ContentVerdict = "ALLOW" | "WARN" | "BLOCK";

export interface ContentGuardResult {
  verdict: ContentVerdict;
  score: number;           // 0-100, plus c'est haut, plus c'est suspect
  triggers: string[];      // Règles déclenchées
  warningMessage: string | null;
}

// Mots abusifs courants (liste extensible)
const ABUSIVE_WORDS = [
  "connard", "salope", "pute", "merde", "fdp", "enculé", "bâtard",
  "fils de pute", "va te faire", "nique ta",
  // Lingala insults
  "ya basi", "mobembo", "boyi ya mabe",
];

const SPAM_PHRASES = [
  "gagner de l'argent facilement",
  "investissement garanti",
  "cliquez ici maintenant",
  "offre limitée dépêchez",
  "100% de profit",
  "double your money",
  "earn money fast",
  "free followers",
  "bit.ly", "tinyurl", "t.co/",
];

function countChars(text: string, char: string): number {
  return text.split("").filter((c) => c === char).length;
}

/**
 * Analyse de contenu générique (Listings, SoKin, etc.)
 * Utilise le pipeline MessageGuard complet (sans sequence engine).
 */
export async function analyzeContent(
  userId: string,
  text: string,
  context: "listing" | "sokin" = "listing",
): Promise<ContentGuardResult> {
  const triggers: string[] = [];
  let bonusScore = 0;

  if (!text || text.trim().length < 2) {
    return { verdict: "ALLOW", score: 0, triggers: [], warningMessage: null };
  }

  // ── Admin bypass ──
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true, role: true },
  });
  if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
    return { verdict: "ALLOW", score: 0, triggers: [], warningMessage: null };
  }

  // ═══ Pipeline MessageGuard ═══
  const rawText = text;
  const normalizedText = normalize(rawText);

  const patterns = detectPatterns(normalizedText, rawText);
  const obfuscations = detectObfuscation(normalizedText, rawText);
  const intents = detectIntent(normalizedText);

  // Récidives récentes
  const recentViolations = await prisma.messageGuardLog.count({
    where: {
      userId,
      verdict: { in: ["WARNED", "BLOCKED"] },
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const assessment = assessRisk(
    patterns,
    obfuscations,
    intents,
    [],  // pas de sequence engine pour le contenu statique
    {
      isTransactional: context === "listing",
      userTrustScore: user?.trustScore ?? 50,
      recentViolations,
    },
  );

  // Collecter les triggers depuis les détections MessageGuard
  for (const d of assessment.detections) {
    triggers.push(d.type.toLowerCase());
  }

  // ═══ Vérifications additionnelles (texte) ═══
  const basicNorm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Langage abusif
  for (const word of ABUSIVE_WORDS) {
    if (basicNorm.includes(word.toLowerCase())) {
      triggers.push("abusive_language");
      bonusScore += 25;
      break;
    }
  }

  // Spam / phrases promotionnelles
  for (const phrase of SPAM_PHRASES) {
    if (basicNorm.includes(phrase.toLowerCase())) {
      triggers.push("spam_phrase");
      bonusScore += 20;
      break;
    }
  }

  // CAPS LOCK excessif
  const uppercaseRatio = (text.match(/[A-Z]/g) ?? []).length / Math.max(text.length, 1);
  if (text.length > 20 && uppercaseRatio > 0.6) {
    triggers.push("excessive_caps");
    bonusScore += 10;
  }

  // Ponctuation excessive
  const exclamations = countChars(text, "!");
  const questions = countChars(text, "?");
  if (exclamations + questions > 10) {
    triggers.push("punctuation_spam");
    bonusScore += 10;
  }

  // Récidiviste
  if (recentViolations >= 3) {
    triggers.push("repeat_offender");
    bonusScore += 20;
  }

  // Score final = pipeline MessageGuard + bonus
  const finalScore = Math.min(100, assessment.score + bonusScore);

  let verdict: ContentVerdict;
  let warningMessage: string | null = null;

  if (finalScore >= 50) {
    verdict = "BLOCK";
    warningMessage = assessment.warningMessage
      ?? "Ce contenu a été bloqué car il contient des informations non autorisées (coordonnées, spam ou langage abusif).";
  } else if (finalScore >= 25) {
    verdict = "WARN";
    warningMessage = assessment.warningMessage
      ?? "Attention : votre contenu contient du contenu potentiellement problématique.";
  } else {
    verdict = "ALLOW";
  }

  // Log async
  prisma.messageGuardLog.create({
    data: {
      userId,
      conversationId: `content-guard:${context}`,
      messageContent: rawText.substring(0, 500),
      verdict: verdict === "ALLOW" ? "ALLOWED" : verdict === "WARN" ? "WARNED" : "BLOCKED",
      riskScore: finalScore,
      categories: assessment.categories,
      detections: assessment.detections as any,
      engineResults: {
        patternCount: patterns.length,
        obfuscationCount: obfuscations.length,
        intentCount: intents.length,
        bonusScore,
        context,
      } as any,
      warningShown: warningMessage,
    },
  }).catch(() => {});

  return { verdict, score: finalScore, triggers, warningMessage };
}

/**
 * Analyse un texte de post SoKin (wrapper spécialisé).
 * @param text — Contenu du post
 * @param hashtags — Hashtags attachés au post
 * @param userId — Auteur (pour vérifier les récidives)
 */
export async function analyzePost(
  text: string,
  hashtags: string[] = [],
  userId: string
): Promise<ContentGuardResult> {
  const result = await analyzeContent(userId, text, "sokin");

  // Vérifications spécifiques SoKin (hashtags, contenu vide)
  let extraScore = 0;

  if (hashtags.length > 15) {
    result.triggers.push("hashtag_flood");
    extraScore += 15;
  }

  const strippedText = text.replace(/\s+/g, "").replace(/[\p{Emoji}]/gu, "");
  if (strippedText.length < 3) {
    result.triggers.push("empty_content");
    extraScore += 5;
  }

  if (extraScore > 0) {
    result.score = Math.min(100, result.score + extraScore);
    // Recalculer le verdict
    if (result.score >= 50) {
      result.verdict = "BLOCK";
      result.warningMessage = result.warningMessage ?? "Ce post a été bloqué car il contient du contenu non autorisé.";
    } else if (result.score >= 25) {
      result.verdict = "WARN";
      result.warningMessage = result.warningMessage ?? "Attention : votre post contient du contenu potentiellement problématique.";
    }
  }

  return result;
}
