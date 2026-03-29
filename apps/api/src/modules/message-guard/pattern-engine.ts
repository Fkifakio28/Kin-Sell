/**
 * Message Guard — Pattern Engine
 *
 * Détecte les informations de contact directement reconnaissables :
 * - Numéros de téléphone (formats internationaux, locaux RDC/Afrique)
 * - Emails
 * - URLs / liens
 * - Handles réseaux sociaux
 */

import { extractDigitSequence } from "./normalizer.js";

export interface PatternDetection {
  type: "PHONE" | "EMAIL" | "URL" | "SOCIAL_HANDLE";
  matched: string;
  confidence: number; // 0-1
}

/* ── Regex patterns ── */

// Téléphones: +243..., 0..., formats variés avec séparateurs
const PHONE_PATTERNS = [
  // Format international: +243, +33, +212, etc.
  /(?:\+|00)\s*\d{1,3}[\s.\-\/]*(?:\d[\s.\-\/]*){6,12}/,
  // Format local congolais: 09xx, 08xx, 07xx
  /\b0[789]\s*[\s.\-\/]*(?:\d[\s.\-\/]*){7,9}\b/,
  // Format local 06, 05, etc.
  /\b0[1-9]\s*[\s.\-\/]*(?:\d[\s.\-\/]*){7,9}\b/,
  // Suite de 8+ chiffres (potentiellement un numéro)
  /(?<!\d)\d{8,15}(?!\d)/,
];

// Email classique
const EMAIL_PATTERN = /[a-z0-9._%+\-]+\s*@\s*[a-z0-9.\-]+\s*\.\s*[a-z]{2,}/i;

// URL (http, https, www, domaines connus)
const URL_PATTERNS = [
  /https?:\/\/[^\s]+/i,
  /www\.[^\s]+/i,
  /wa\.me\/[^\s]*/i,
  /t\.me\/[^\s]*/i,
  /bit\.ly\/[^\s]*/i,
  /[a-z0-9\-]+\.(?:com|net|org|io|me|co|fr|cd|cg|africa)\b/i,
];

// Handles sociaux: @username, ou format "username sur <platform>"
const HANDLE_PATTERNS = [
  /@[a-z0-9_]{2,30}\b/i,
];

/**
 * Analyse le texte normalisé pour détecter des patterns directs.
 */
export function detectPatterns(normalizedText: string, rawText: string): PatternDetection[] {
  const results: PatternDetection[] = [];

  // ─── Téléphone ───
  for (const pattern of PHONE_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      const digits = extractDigitSequence(match[0]);
      // Au moins 8 chiffres pour être un vrai numéro
      if (digits.length >= 8) {
        results.push({
          type: "PHONE",
          matched: match[0].trim(),
          confidence: digits.length >= 10 ? 0.95 : 0.7,
        });
      }
    }
  }

  // Vérification supplémentaire: séquence de chiffres dans le texte normalisé
  const allDigits = extractDigitSequence(normalizedText);
  if (allDigits.length >= 8 && !results.some(r => r.type === "PHONE")) {
    // Beaucoup de chiffres dans le message → probable numéro
    const ratio = allDigits.length / normalizedText.replace(/\s/g, "").length;
    if (ratio > 0.4) {
      results.push({
        type: "PHONE",
        matched: allDigits,
        confidence: ratio > 0.6 ? 0.9 : 0.6,
      });
    }
  }

  // ─── Email ───
  const emailMatch = normalizedText.match(EMAIL_PATTERN) || rawText.match(EMAIL_PATTERN);
  if (emailMatch) {
    results.push({
      type: "EMAIL",
      matched: emailMatch[0].trim(),
      confidence: 0.95,
    });
  }

  // ─── URL ───
  for (const pattern of URL_PATTERNS) {
    const match = rawText.match(pattern) || normalizedText.match(pattern);
    if (match) {
      // Exclure les URLs Kin-Sell internes
      const url = match[0].toLowerCase();
      if (!url.includes("kin-sell") && !url.includes("kinsell") && !url.includes("localhost")) {
        results.push({
          type: "URL",
          matched: match[0].trim(),
          confidence: 0.9,
        });
        break; // un seul suffit
      }
    }
  }

  // ─── Handles sociaux ───
  for (const pattern of HANDLE_PATTERNS) {
    const match = rawText.match(pattern);
    if (match) {
      results.push({
        type: "SOCIAL_HANDLE",
        matched: match[0].trim(),
        confidence: 0.6, // ambigu hors contexte
      });
    }
  }

  return results;
}
