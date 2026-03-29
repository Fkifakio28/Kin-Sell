/**
 * Message Guard — Normalizer (Preprocessing Layer)
 *
 * Normalise le texte brut avant analyse :
 * - minuscules + suppression accents
 * - conversion mots-nombres → chiffres
 * - conversion termes techniques (arobase → @, point → .)
 * - réduction séparateurs et espaces
 * - détection écriture phonétique / SMS
 */

/* ── Mots → Chiffres (FR + lingala courant) ── */
const WORD_TO_DIGIT: Record<string, string> = {
  "zero": "0", "zéro": "0", "zêro": "0", "zro": "0",
  "un": "1", "une": "1",
  "deux": "2", "deu": "2", "de": "2",
  "trois": "3", "troi": "3",
  "quatre": "4", "quat": "4", "kat": "4", "katr": "4",
  "cinq": "5", "cinque": "5", "sink": "5", "sinq": "5",
  "six": "6", "sis": "6", "siz": "6",
  "sept": "7", "sèt": "7", "set": "7",
  "huit": "8", "ui": "8", "uit": "8", "wit": "8",
  "neuf": "9", "nef": "9",
  "dix": "10", "dis": "10",
  "onze": "11",
  "douze": "12", "douz": "12",
  "treize": "13",
  "quatorze": "14",
  "quinze": "15", "kinz": "15",
  "seize": "16",
  "vingt": "20", "vin": "20",
  "trente": "30",
  "quarante": "40", "karant": "40",
  "cinquante": "50", "sinkant": "50",
  "soixante": "60", "swasant": "60",
  "soixante-dix": "70",
  "quatre-vingt": "80", "quatre-vingts": "80",
  "quatre-vingt-dix": "90",
  "cent": "100",
  "deux-cent": "200", "deux-cents": "200",
  "plus": "+",
};

/* ── Termes → Symboles ── */
const TERM_TO_SYMBOL: Record<string, string> = {
  "arobase": "@", "arrobase": "@", "arobas": "@", "arrobas": "@",
  "at": "@", "chez": "@",
  "point": ".", "poin": ".", "poi": ".",
  "tiret": "-", "trait": "-",
  "slash": "/", "slach": "/",
  "underscore": "_",
  "espace": " ",
};

/* ── Noms de domaines courants ── */
const DOMAIN_ALIASES: Record<string, string> = {
  "gmail": "gmail.com", "jimail": "gmail.com", "g mail": "gmail.com", "gmai": "gmail.com",
  "yahoo": "yahoo.com", "yaho": "yahoo.com",
  "hotmail": "hotmail.com", "otmail": "hotmail.com",
  "outlook": "outlook.com",
  "protonmail": "protonmail.com", "proton": "protonmail.com",
};

/* ── Noms de plateformes externes ── */
export const PLATFORM_ALIASES: Record<string, string> = {
  "whatsapp": "whatsapp", "wa": "whatsapp", "watsap": "whatsapp", "watsapp": "whatsapp",
  "whats app": "whatsapp", "wattsapp": "whatsapp", "wats app": "whatsapp",
  "telegram": "telegram", "télégramme": "telegram", "telégram": "telegram", "tg": "telegram",
  "télégram": "telegram", "telegr": "telegram",
  "facebook": "facebook", "fb": "facebook", "face": "facebook",
  "instagram": "instagram", "insta": "instagram", "ig": "instagram",
  "snapchat": "snapchat", "snap": "snapchat",
  "discord": "discord", "discor": "discord",
  "tiktok": "tiktok", "tik tok": "tiktok", "tt": "tiktok",
  "twitter": "twitter", "x": "twitter",
  "signal": "signal",
  "viber": "viber",
  "imo": "imo",
  "wechat": "wechat",
  "skype": "skype",
};

/**
 * Supprime les accents et passe en minuscules.
 */
function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Réduit les espaces multiples, caractères séparateurs ASCII-art, etc.
 */
function reduceNoise(text: string): string {
  // Supprimer les séparateurs visuels: *, ·, |, etc.
  let cleaned = text.replace(/[\*\·\|\\~\^`]/g, " ");
  // Supprimer les espaces entre chaque lettre (ex: "g m a i l")
  // Heuristique: groupes de 1 lettre séparés par espaces → fusionner
  cleaned = cleaned.replace(/\b([a-z0-9])\s+(?=[a-z0-9]\b)/gi, (_, c) => c);
  // Réduire espaces multiples
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

/**
 * Convertit les mots-nombres en chiffres.
 */
function wordsToDigits(text: string): string {
  // Multi-word composites first
  const composites = Object.entries(WORD_TO_DIGIT)
    .filter(([k]) => k.includes("-"))
    .sort((a, b) => b[0].length - a[0].length);

  let result = text;
  for (const [word, digit] of composites) {
    const regex = new RegExp(`\\b${word.replace(/-/g, "[\\s-]")}\\b`, "gi");
    result = result.replace(regex, digit);
  }

  // Single words
  const words = result.split(/(\s+)/);
  return words.map(w => {
    const key = removeAccents(w.trim());
    return WORD_TO_DIGIT[key] ?? w;
  }).join("");
}

/**
 * Convertit les termes techniques en symboles.
 */
function termsToSymbols(text: string): string {
  let result = text;
  // Sort by longest first to avoid partial matches
  const sorted = Object.entries(TERM_TO_SYMBOL).sort((a, b) => b[0].length - a[0].length);
  for (const [term, symbol] of sorted) {
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    result = result.replace(regex, symbol);
  }
  return result;
}

/**
 * Pipeline de normalisation complète.
 */
export function normalize(rawText: string): string {
  let text = rawText.trim();
  if (!text) return "";

  // 1. Minuscules + accents
  text = removeAccents(text);

  // 2. Réduire bruit (caractères spéciaux, espaces)
  text = reduceNoise(text);

  // 3. Mots-nombres → chiffres
  text = wordsToDigits(text);

  // 4. Termes → symboles
  text = termsToSymbols(text);

  // 5. Nettoyage final
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extraire une version "chiffres purs" du texte
 * pour la détection de numéros téléphoniques.
 */
export function extractDigitSequence(text: string): string {
  return text.replace(/[^0-9+]/g, "");
}

/**
 * Vérifie si un texte contient un alias de plateforme externe.
 */
export function findPlatformMentions(normalizedText: string): string[] {
  const found: string[] = [];
  const sorted = Object.entries(PLATFORM_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, platform] of sorted) {
    const regex = new RegExp(`\\b${alias}\\b`, "i");
    if (regex.test(normalizedText) && !found.includes(platform)) {
      found.push(platform);
    }
  }
  return found;
}

/**
 * Vérifie si un texte contient un alias de domaine email.
 */
export function findEmailDomainMentions(normalizedText: string): string[] {
  const found: string[] = [];
  for (const [alias, domain] of Object.entries(DOMAIN_ALIASES)) {
    if (normalizedText.includes(alias) && !found.includes(domain)) {
      found.push(domain);
    }
  }
  return found;
}
