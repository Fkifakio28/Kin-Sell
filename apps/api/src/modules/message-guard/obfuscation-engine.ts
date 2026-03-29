/**
 * Message Guard — Obfuscation Engine
 *
 * Détecte les informations déguisées / obfusquées :
 * - Chiffres écrits en lettres reconstituant un numéro
 * - Email découpé en mots ("nom arobase gmail point com")
 * - Orthographe volontairement cassée
 * - Lettres séparées par espaces/ponctuation
 */

import { normalize, extractDigitSequence, findEmailDomainMentions, findPlatformMentions } from "./normalizer.js";

export interface ObfuscationDetection {
  type: "OBFUSCATED_PHONE" | "OBFUSCATED_EMAIL" | "OBFUSCATED_PLATFORM" | "OBFUSCATED_CONTACT";
  matched: string;
  decoded: string;
  confidence: number;
}

/**
 * Détecte les numéros de téléphone écrits en lettres ou cassés.
 * Ex: "zero six soixante cinque" → "060065" → numéro
 */
function detectObfuscatedPhone(normalizedText: string, rawText: string): ObfuscationDetection[] {
  const results: ObfuscationDetection[] = [];

  // Après normalisation, les mots-nombres sont convertis en chiffres.
  // Chercher les séquences de chiffres résultantes.
  const digits = extractDigitSequence(normalizedText);
  const rawDigits = extractDigitSequence(rawText);

  // Si la normalisation a produit plus de chiffres que le texte brut,
  // c'est qu'il y avait des mots-nombres → obfuscation
  if (digits.length > rawDigits.length && digits.length >= 6) {
    const extraDigits = digits.length - rawDigits.length;
    if (extraDigits >= 3) {
      results.push({
        type: "OBFUSCATED_PHONE",
        matched: rawText,
        decoded: digits,
        confidence: digits.length >= 8 ? 0.9 : 0.6,
      });
    }
  }

  // Patterns de description ("mon numéro c'est", "appelle moi au", "contacte")
  const phoneIntroPatterns = [
    /(?:mon|le|un)\s*(?:num[eé]ro|tel|t[eé]l[eé]phone|fone)/i,
    /(?:appel|contact|join|ecri|envoi)\w*\s*(?:moi|nous|le|au)/i,
    /(?:numero|tel)\s*(?:c'?est|:)/i,
  ];

  for (const pattern of phoneIntroPatterns) {
    if (pattern.test(normalizedText) && digits.length >= 4) {
      const existing = results.find(r => r.type === "OBFUSCATED_PHONE");
      if (!existing) {
        results.push({
          type: "OBFUSCATED_PHONE",
          matched: rawText,
          decoded: digits,
          confidence: 0.7,
        });
      } else {
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      }
    }
  }

  return results;
}

/**
 * Détecte les emails écrits en mots.
 * Ex: "fulgence arobase gmail point com" → email détecté
 */
function detectObfuscatedEmail(normalizedText: string, rawText: string): ObfuscationDetection[] {
  const results: ObfuscationDetection[] = [];

  // Après normalisation, "arobase" → "@" et "point" → "."
  // Chercher le pattern résultant
  const emailLike = normalizedText.match(/[a-z0-9._]+\s*@\s*[a-z0-9._]+\s*\.\s*[a-z]{2,}/i);
  if (emailLike) {
    // Vérifier que le texte brut ne contenait PAS déjà @ et .
    // (sinon c'est un email direct, pas obfusqué)
    if (!rawText.includes("@")) {
      results.push({
        type: "OBFUSCATED_EMAIL",
        matched: rawText,
        decoded: emailLike[0].replace(/\s/g, ""),
        confidence: 0.85,
      });
    }
  }

  // Détection par mention de domaine email connu
  const domains = findEmailDomainMentions(normalizedText);
  if (domains.length > 0) {
    // Si le message mentionne un domaine email ET contient des termes de contact
    const hasContactContext = /(?:mail|email|adress|ecri|envoi|mon\s)/i.test(normalizedText);
    if (hasContactContext) {
      results.push({
        type: "OBFUSCATED_EMAIL",
        matched: rawText,
        decoded: `[mention: ${domains.join(", ")}]`,
        confidence: 0.75,
      });
    }
  }

  return results;
}

/**
 * Détecte les mentions de plateformes externes déguisées.
 * Ex: "watsap", "télégram", "insta", "viens en pv sur fb"
 */
function detectObfuscatedPlatform(normalizedText: string, rawText: string): ObfuscationDetection[] {
  const results: ObfuscationDetection[] = [];
  const platforms = findPlatformMentions(normalizedText);

  for (const platform of platforms) {
    results.push({
      type: "OBFUSCATED_PLATFORM",
      matched: rawText,
      decoded: platform,
      confidence: 0.8,
    });
  }

  // Patterns "sur" + plateforme
  const surPattern = /(?:sur|via|par|avec|en)\s+(?:le|la|mon|pv|dm|mp)\s*/i;
  if (surPattern.test(normalizedText) && platforms.length > 0) {
    for (const r of results) {
      r.confidence = Math.min(1, r.confidence + 0.1);
    }
  }

  return results;
}

/**
 * Point d'entrée — détecte toutes les formes d'obfuscation.
 */
export function detectObfuscation(normalizedText: string, rawText: string): ObfuscationDetection[] {
  return [
    ...detectObfuscatedPhone(normalizedText, rawText),
    ...detectObfuscatedEmail(normalizedText, rawText),
    ...detectObfuscatedPlatform(normalizedText, rawText),
  ];
}
