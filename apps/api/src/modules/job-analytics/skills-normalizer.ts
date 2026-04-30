/**
 * Skills Normalizer — K5
 *
 * Normalise les compétences techniques/soft pour permettre un matching fiable
 * entre :
 *  - les compétences déclarées par l'utilisateur (experiences.skills)
 *  - les topSkills extraits du marché (JobMarketSnapshot.topSkills)
 *
 * Sans normalisation, "Node.js" ≠ "nodejs" ≠ "node" bien que désignant la même
 * chose, ce qui fausse R1 SKILL_GAP et R7 CERTIFICATION_BOOST.
 *
 * Stratégie :
 *  1) Normalisation textuelle (lowercase, trim, retrait d'accents, ponctuation)
 *  2) Table d'alias → canonicalise les variantes courantes
 *  3) Matching souple par similarité (Jaccard sur tokens) pour les cas non
 *     couverts par la table d'alias (fautes de frappe, traductions légères)
 */

// Alias → forme canonique. Ajouter en minuscules et sans accent.
const ALIASES: Record<string, string> = {
  // Langages & runtimes
  "node.js": "nodejs",
  "node js": "nodejs",
  "node": "nodejs",
  "nodejs": "nodejs",
  "js": "javascript",
  "javascript": "javascript",
  "typescript": "typescript",
  "ts": "typescript",
  "py": "python",
  "python3": "python",
  "python 3": "python",
  "python": "python",
  "c++": "cpp",
  "cpp": "cpp",
  "c#": "csharp",
  "csharp": "csharp",
  "c sharp": "csharp",
  "golang": "go",
  "go": "go",
  "rustlang": "rust",
  "rust": "rust",
  "ruby on rails": "rails",
  "rails": "rails",
  "ror": "rails",

  // Frameworks web
  "react.js": "react",
  "reactjs": "react",
  "react": "react",
  "next.js": "nextjs",
  "nextjs": "nextjs",
  "next": "nextjs",
  "vue.js": "vue",
  "vuejs": "vue",
  "vue": "vue",
  "nuxt.js": "nuxt",
  "nuxt": "nuxt",
  "angular.js": "angular",
  "angularjs": "angular",
  "angular": "angular",
  "svelte": "svelte",
  "sveltekit": "svelte",
  "express.js": "express",
  "expressjs": "express",
  "express": "express",
  "nest.js": "nestjs",
  "nestjs": "nestjs",

  // Bases de données
  "postgresql": "postgres",
  "postgres": "postgres",
  "psql": "postgres",
  "mysql": "mysql",
  "mariadb": "mysql",
  "mongodb": "mongo",
  "mongo": "mongo",
  "redis": "redis",
  "elasticsearch": "elastic",
  "elastic": "elastic",

  // Cloud & DevOps
  "amazon web services": "aws",
  "aws": "aws",
  "google cloud platform": "gcp",
  "google cloud": "gcp",
  "gcp": "gcp",
  "microsoft azure": "azure",
  "azure": "azure",
  "kubernetes": "k8s",
  "k8s": "k8s",
  "docker": "docker",
  "terraform": "terraform",
  "iac": "terraform",
  "ci/cd": "cicd",
  "cicd": "cicd",
  "ci cd": "cicd",
  "github actions": "cicd",
  "gitlab ci": "cicd",
  "jenkins": "cicd",

  // Mobile
  "react native": "react-native",
  "reactnative": "react-native",
  "rn": "react-native",
  "flutter": "flutter",
  "dart": "flutter",
  "swift": "swift",
  "swiftui": "swift",
  "kotlin": "kotlin",
  "android": "android",
  "ios": "ios",

  // Data / IA
  "machine learning": "ml",
  "ml": "ml",
  "deep learning": "deeplearning",
  "tensorflow": "tensorflow",
  "tf": "tensorflow",
  "pytorch": "pytorch",
  "torch": "pytorch",
  "pandas": "pandas",
  "numpy": "numpy",
  "scikit-learn": "sklearn",
  "sklearn": "sklearn",
  "power bi": "powerbi",
  "powerbi": "powerbi",
  "tableau": "tableau",
  "excel": "excel",
  "ms excel": "excel",
  "microsoft excel": "excel",

  // Design
  "adobe photoshop": "photoshop",
  "photoshop": "photoshop",
  "ps": "photoshop",
  "adobe illustrator": "illustrator",
  "illustrator": "illustrator",
  "ai": "illustrator",
  "figma": "figma",
  "sketch": "sketch",
  "xd": "xd",
  "adobe xd": "xd",
  "ux": "ux-design",
  "ux design": "ux-design",
  "ui": "ui-design",
  "ui design": "ui-design",
  "ui/ux": "uxui",
  "uxui": "uxui",
  "ux/ui": "uxui",

  // Marketing & Business
  "seo": "seo",
  "sea": "sea",
  "sem": "sem",
  "google ads": "googleads",
  "adwords": "googleads",
  "facebook ads": "metaads",
  "meta ads": "metaads",
  "community management": "community-management",
  "cm": "community-management",

  // Langues
  "francais": "french",
  "français": "french",
  "french": "french",
  "anglais": "english",
  "english": "english",
  "lingala": "lingala",
  "swahili": "swahili",
  "kikongo": "kikongo",
  "tshiluba": "tshiluba",

  // Soft skills
  "team work": "teamwork",
  "travail en equipe": "teamwork",
  "travail en équipe": "teamwork",
  "teamwork": "teamwork",
  "leadership": "leadership",
  "gestion de projet": "project-management",
  "project management": "project-management",
  "pm": "project-management",
  "communication": "communication",
};

const STRIP_ACCENT: Record<string, string> = {
  à: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  î: "i", ï: "i",
  ô: "o", ö: "o",
  ù: "u", û: "u", ü: "u",
  ç: "c",
};

function stripAccents(input: string): string {
  let out = "";
  for (const ch of input) {
    out += STRIP_ACCENT[ch] ?? ch;
  }
  return out;
}

/**
 * Normalise une compétence en forme canonique :
 * lowercase, sans accents, sans ponctuation superflue, alias appliqué.
 */
export function normalizeSkill(input: string): string {
  if (!input) return "";
  const base = stripAccents(input.toLowerCase().trim());
  // Nettoyage : on garde lettres, chiffres, +, #, ., /, espaces
  const cleaned = base.replace(/[^a-z0-9+#./\- ]/g, "").replace(/\s+/g, " ").trim();

  // 1) Match exact dans la table
  if (ALIASES[cleaned]) return ALIASES[cleaned];

  // 2) Retrait ponctuation pour retry
  const stripped = cleaned.replace(/[.\-/]/g, "").replace(/\s+/g, " ").trim();
  if (ALIASES[stripped]) return ALIASES[stripped];

  // 3) Pas d'alias connu → on renvoie la forme nettoyée (lowercase stable)
  return cleaned;
}

/**
 * Tokenise pour la similarité Jaccard : split sur séparateurs courants,
 * ignore les tokens trop courts (< 2 car.).
 */
export function tokenizeSkill(input: string): Set<string> {
  const normalized = normalizeSkill(input);
  const tokens = normalized
    .split(/[\s.\-/+#]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * Similarité Jaccard entre deux sets de tokens : |A ∩ B| / |A ∪ B|.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Détermine si deux compétences désignent la même chose.
 *
 * Règle :
 *  - formes canoniques identiques → match
 *  - sinon Jaccard(tokens) ≥ 0.5 → match (tolère fautes / variantes)
 */
export function skillsMatch(a: string, b: string): boolean {
  const na = normalizeSkill(a);
  const nb = normalizeSkill(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokenizeSkill(a);
  const tb = tokenizeSkill(b);
  return jaccard(ta, tb) >= 0.5;
}

/**
 * Retourne les skills de `marketSkills` qui ne sont matchés par AUCUN
 * skill de `userSkills`. Utilisé par R1 SKILL_GAP.
 */
export function findMissingSkills(userSkills: string[], marketSkills: string[]): string[] {
  // Pré-calcule les formes canoniques + tokens de l'utilisateur
  const userCanon = new Set<string>();
  const userTokens: Set<string>[] = [];
  for (const s of userSkills) {
    const n = normalizeSkill(s);
    if (n) userCanon.add(n);
    userTokens.push(tokenizeSkill(s));
  }

  const missing: string[] = [];
  for (const market of marketSkills) {
    const nm = normalizeSkill(market);
    if (!nm) continue;
    if (userCanon.has(nm)) continue;
    // Fallback Jaccard
    const tm = tokenizeSkill(market);
    const matched = userTokens.some((tu) => jaccard(tu, tm) >= 0.5);
    if (!matched) missing.push(market);
  }
  return missing;
}

/**
 * Détermine si l'utilisateur possède une compétence (avec normalisation).
 */
export function userHasSkill(userSkills: string[], target: string): boolean {
  for (const s of userSkills) {
    if (skillsMatch(s, target)) return true;
  }
  return false;
}
