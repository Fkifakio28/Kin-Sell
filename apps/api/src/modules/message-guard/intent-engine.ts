/**
 * Message Guard — Intent Engine
 *
 * Détecte les intentions interdites même sans coordonnées explicites :
 * - Intention de sortir de la plateforme
 * - Intention de négocier hors Kin-Sell
 * - Intention de commander/payer hors plateforme
 * - Invitation à communiquer à l'extérieur
 */

export interface IntentDetection {
  type: "EXIT_PLATFORM" | "OFF_PLATFORM_TRADE" | "OFF_PLATFORM_PAYMENT" | "EXTERNAL_COMMUNICATION";
  matched: string;
  confidence: number;
}

/* ── Groupes de patterns d'intention ── */

const EXIT_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  // Sortir de la plateforme
  { pattern: /(?:viens?|passons?|continuons?|allons?|rejoins?)\s*(?:sur|en|a|au|chez|vers)\s*(?!kin)/i, confidence: 0.7 },
  { pattern: /(?:hors|en\s*dehors|dehors|sans\s+passer\s+par)\s*(?:de\s*)?(?:kin|la\s*plateforme|l['']?appli|le\s*site)/i, confidence: 0.9 },
  { pattern: /(?:en\s*priv[eé]|en\s*pv|en\s*dm|en\s*mp)\b/i, confidence: 0.5 },
  { pattern: /(?:ecri|envoi|appel|contact|joint)\w*[-\s]*(?:moi|nous)\s*(?:sur|par|via|en|directement)/i, confidence: 0.7 },
  { pattern: /(?:donne|envoie|partage|passe)\w*[-\s]*(?:moi|ton|votre)\s*(?:num[eé]ro|tel|mail|email|contact|adress|lien|compte)/i, confidence: 0.85 },
  { pattern: /(?:on\s+fait|fais|faisons)\s+[çc]a\s+(?:ailleurs|dehors|hors|en\s+dehors|autrement|sans)/i, confidence: 0.85 },
  { pattern: /(?:je\s+te|je\s+vous)\s*(?:donne|envoie|passe|file)\s*(?:mon|le|un)\s*(?:num|tel|mail|contact|lien)/i, confidence: 0.9 },
  { pattern: /(?:ajoute|ajout)\w*[-\s]*(?:moi|nous)\s*(?:sur)?/i, confidence: 0.5 },
];

const OFF_TRADE_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  // Négocier hors plateforme
  { pattern: /(?:n[eé]goci|marchande|discute|arrange)\w*\s*(?:ailleurs|dehors|hors|directement|entre\s*nous)/i, confidence: 0.85 },
  { pattern: /(?:on\s+s['']?arrange|on\s+n[eé]gocie|on\s+discute)\s*(?:entre\s*nous|directement|sans|hors)/i, confidence: 0.85 },
  { pattern: /(?:commande|ach[eè]te|vend|livre)\w*\s*(?:directement|hors|dehors|sans\s+passer)/i, confidence: 0.8 },
  { pattern: /(?:sans\s+(?:passer|utiliser|kin))\s+(?:par|la\s+plateforme|le\s+syst[eè]me|l['']?appli)/i, confidence: 0.9 },
];

const OFF_PAYMENT_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  // Payer hors plateforme
  { pattern: /(?:paie|paye|payer|envoie|transfert|virement)\w*\s*(?:moi|directement|sur|par|en|via)\s*(?:orange|mpesa|airtel|mobile\s*money|bank|cash|espece)/i, confidence: 0.85 },
  { pattern: /(?:orange\s*money|m[-\s]*pesa|airtel\s*money|vodacom|mobile\s*money)\s*(?:direct|hors|sans)/i, confidence: 0.8 },
  { pattern: /(?:cash|espece|liquide)\s*(?:direct|en\s*main|à\s*la\s*livraison\s*hors)/i, confidence: 0.6 },
  { pattern: /(?:paie|virement)\w*\s*(?:dehors|hors|sans\s+passer|direct)/i, confidence: 0.8 },
];

const EXTERNAL_COMM_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  // Communication externe
  { pattern: /(?:viens?|ecri|envoi|appel|rejoin|ajout)\w*\s*(?:moi|nous)\s*(?:sur|par|via)\s*(?:whats|wa|telegram|tg|fb|facebook|insta|snap|discord|signal|viber|imo|skype|mail|email)/i, confidence: 0.95 },
  { pattern: /(?:mon|le|voici|voila)\s*(?:whats|wa|telegram|tg|fb|facebook|insta|snap|discord)\b/i, confidence: 0.85 },
  { pattern: /(?:plus\s*facile|mieux|pratique|rapide)\s*(?:sur|par|via)\s*(?:whats|wa|telegram|fb|phone|tel)/i, confidence: 0.75 },
  { pattern: /(?:je\s+(?:suis|sui)\s+(?:sur|aussi\s+sur))\s*(?:whats|wa|telegram|tg|fb|insta|snap)/i, confidence: 0.7 },
];

/**
 * Analyse le texte normalisé pour détecter des intentions interdites.
 */
export function detectIntent(normalizedText: string): IntentDetection[] {
  const results: IntentDetection[] = [];

  for (const { pattern, confidence } of EXIT_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      results.push({ type: "EXIT_PLATFORM", matched: match[0], confidence });
      break; // un seul match suffit par catégorie
    }
  }

  for (const { pattern, confidence } of OFF_TRADE_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      results.push({ type: "OFF_PLATFORM_TRADE", matched: match[0], confidence });
      break;
    }
  }

  for (const { pattern, confidence } of OFF_PAYMENT_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      results.push({ type: "OFF_PLATFORM_PAYMENT", matched: match[0], confidence });
      break;
    }
  }

  for (const { pattern, confidence } of EXTERNAL_COMM_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      results.push({ type: "EXTERNAL_COMMUNICATION", matched: match[0], confidence });
      break;
    }
  }

  return results;
}
