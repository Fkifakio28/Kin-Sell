/**
 * ══════════════════════════════════════════════════════════════════
 * REGISTRE CENTRAL DES CATÉGORIES — Source Unique Kin-Sell
 * ══════════════════════════════════════════════════════════════════
 *
 * Chaque catégorie est définie UNE SEULE FOIS avec :
 *   id, slug, label, icon, color, type, i18nKey, legacyAliases
 *
 * Consommateurs :
 *   - Formulaire publication (UserDashboard, BusinessDashboard)
 *   - HomePage (navigation par icônes)
 *   - Explorer mobile + desktop (filtres, URL slugs)
 *   - Locked categories (admin)
 *   - Backend comparison (via legacyAliases)
 */

/* ── Types ── */
export type CategoryType = 'product' | 'service';

export interface CategoryEntry {
  /** Identifiant technique unique (ex: "phone", "driver") */
  id: string;
  /** Slug URL pour l'explorer (ex: "telephones", "chauffeurs") */
  slug: string;
  /** Label d'affichage principal (FR) */
  label: string;
  /** Emoji icône */
  icon: string;
  /** Couleur accent pour l'explorer */
  color: string;
  /** Produit ou service */
  type: CategoryType;
  /** Clé i18n pour la HomePage (home.cat.* / home.svc.*) */
  i18nKey: string;
  /** Anciennes valeurs stockées en DB qui correspondent à cette catégorie */
  legacyAliases: string[];
}

/* ══════════════════════════════════════════════════════════
   PRODUITS — 22 catégories
   ══════════════════════════════════════════════════════════ */
export const PRODUCT_REGISTRY: CategoryEntry[] = [
  { id: 'food',        slug: 'nourriture',     label: 'Alimentation & Boissons',     icon: '🍔',  color: '#ff6b6b', type: 'product', i18nKey: 'home.cat.food',       legacyAliases: ['Alimentation & Boissons', 'Alimentation', 'Restauration'] },
  { id: 'phone',       slug: 'telephones',     label: 'Téléphones & Accessoires',    icon: '📱',  color: '#6f58ff', type: 'product', i18nKey: 'home.cat.phones',     legacyAliases: ['Téléphones & Accessoires'] },
  { id: 'it',          slug: 'high-tech',      label: 'Informatique & Bureautique',  icon: '💻',  color: '#4ecdc4', type: 'product', i18nKey: 'home.cat.computers',  legacyAliases: ['Informatique & Bureautique', 'Informatique & Tech'] },
  { id: 'games',       slug: 'jeux',           label: 'Jeux vidéo & Consoles',       icon: '🎮',  color: '#ffe66d', type: 'product', i18nKey: 'home.cat.gaming',     legacyAliases: ['Jeux vidéo & Consoles'] },
  { id: 'pharmacy',    slug: 'pharmacie',      label: 'Pharmacie',                   icon: '💊',  color: '#95e1d3', type: 'product', i18nKey: 'home.cat.pharmacy',   legacyAliases: ['Pharmacie'] },
  { id: 'clothes',     slug: 'mode',           label: 'Vêtements & Mode',            icon: '👕',  color: '#f38181', type: 'product', i18nKey: 'home.cat.fashion',    legacyAliases: ['Vêtements & Mode', 'Vêtements', 'Chaussures & Sacs'] },
  { id: 'pets',        slug: 'animalerie',     label: 'Animalerie',                  icon: '🐾',  color: '#aa96da', type: 'product', i18nKey: 'home.cat.pets',       legacyAliases: ['Animalerie'] },
  { id: 'furniture',   slug: 'maison',         label: 'Maison & Mobilier',           icon: '🛋️', color: '#fcbad3', type: 'product', i18nKey: 'home.cat.home',       legacyAliases: ['Maison & Mobilier', 'Maison & Décoration'] },
  { id: 'appliances',  slug: 'electromenager', label: 'Électroménager',              icon: '⚙️',  color: '#c7ceea', type: 'product', i18nKey: 'home.cat.appliances', legacyAliases: ['Électroménager'] },
  { id: 'electronics', slug: 'electronique',   label: 'Électronique & TV',           icon: '🔌',  color: '#b5eae0', type: 'product', i18nKey: 'home.cat.electronics', legacyAliases: ['Électronique & TV', 'Électronique'] },
  { id: 'beauty',      slug: 'beaute',         label: 'Beauté & Cosmétiques',        icon: '💄',  color: '#ffddc1', type: 'product', i18nKey: 'home.cat.beauty',     legacyAliases: ['Beauté & Cosmétiques', 'Beauté & Soins'] },
  { id: 'baby',        slug: 'bebe',           label: 'Bébé & Enfant',              icon: '👶',  color: '#ff9999', type: 'product', i18nKey: 'home.cat.baby',       legacyAliases: ['Bébé & Enfant'] },
  { id: 'sports',      slug: 'sports',         label: 'Sports & Loisirs',            icon: '⚽',  color: '#a8d8ea', type: 'product', i18nKey: 'home.cat.sports',     legacyAliases: ['Sports & Loisirs'] },
  { id: 'books',       slug: 'livres',         label: 'Livres & Papeterie',          icon: '📚',  color: '#aa96da', type: 'product', i18nKey: 'home.cat.books',      legacyAliases: ['Livres & Papeterie', 'Éducation & Formation'] },
  { id: 'diy',         slug: 'bricolage',      label: 'Bricolage',                   icon: '🔨',  color: '#fcb4d5', type: 'product', i18nKey: 'home.cat.diy',        legacyAliases: ['Bricolage', 'Agriculture & Jardin'] },
  { id: 'gifts',       slug: 'cadeaux',        label: 'Cadeaux',                     icon: '🎁',  color: '#fff5ba', type: 'product', i18nKey: 'home.cat.gifts',      legacyAliases: ['Cadeaux'] },
  { id: 'office',      slug: 'bureau',         label: 'Fournitures de bureau',       icon: '📎',  color: '#c7f0d8', type: 'product', i18nKey: 'home.cat.office',     legacyAliases: ['Fournitures de bureau'] },
  { id: 'auto',        slug: 'voitures',       label: 'Auto & Moto',                icon: '🏍️', color: '#fec8d8', type: 'product', i18nKey: 'home.cat.autoMoto',   legacyAliases: ['Auto & Moto'] },
  { id: 'health',      slug: 'sante',          label: 'Santé & Bien-être',           icon: '🏥',  color: '#fddb92', type: 'product', i18nKey: 'home.cat.health',     legacyAliases: ['Santé & Bien-être', 'Santé'] },
  { id: 'carental',    slug: 'location',       label: 'Location de voiture',         icon: '🚗',  color: '#a1c4fd', type: 'product', i18nKey: 'home.cat.carRental',  legacyAliases: ['Location de voiture'] },
  { id: 'realestate',  slug: 'immobilier',     label: 'Immobilier',                  icon: '🏠',  color: '#c471ed', type: 'product', i18nKey: 'home.cat.realEstate', legacyAliases: ['Immobilier'] },
  { id: 'misc',        slug: 'divers',         label: 'Divers',                      icon: '📦',  color: '#ffecd2', type: 'product', i18nKey: 'home.cat.misc',       legacyAliases: ['Divers', 'Autre produit', 'Bijoux & Montres'] },
];

/* ══════════════════════════════════════════════════════════
   SERVICES — 26 catégories
   ══════════════════════════════════════════════════════════ */
export const SERVICE_REGISTRY: CategoryEntry[] = [
  { id: 'driver',       slug: 'chauffeurs',    label: 'Chauffeur',                     icon: '🚕',  color: '#fa709a', type: 'service', i18nKey: 'home.svc.drivers',      legacyAliases: ['Chauffeur', 'Transport & Livraison', 'Transport'] },
  { id: 'daycare',      slug: 'nounous',       label: 'Nounou',                        icon: '👶',  color: '#764ba2', type: 'service', i18nKey: 'home.svc.nannies',      legacyAliases: ['Nounou'] },
  { id: 'teacher',      slug: 'professeurs',   label: 'Professeur',                    icon: '👨‍🏫', color: '#667eea', type: 'service', i18nKey: 'home.svc.teachers',     legacyAliases: ['Professeur', 'Éducation & Cours particuliers'] },
  { id: 'nurse',        slug: 'infirmieres',   label: 'Infirmière / aide-soignant',    icon: '⚕️',  color: '#43e97b', type: 'service', i18nKey: 'home.svc.nurses',       legacyAliases: ['Infirmière / aide-soignant', 'Santé & Soins'] },
  { id: 'cleaner',      slug: 'menage',        label: 'Femme de ménage',               icon: '🧹',  color: '#f093fb', type: 'service', i18nKey: 'home.svc.cleaning',     legacyAliases: ['Femme de ménage', 'Ménage & Nettoyage'] },
  { id: 'cook',         slug: 'cuisine',       label: 'Cuisinière',                    icon: '👨‍🍳', color: '#fee140', type: 'service', i18nKey: 'home.svc.cooking',      legacyAliases: ['Cuisinière', 'Restauration & Traiteur'] },
  { id: 'security',     slug: 'gardiennage',   label: 'Gardien / garde du corps',      icon: '👮',  color: '#00f2fe', type: 'service', i18nKey: 'home.svc.security',     legacyAliases: ['Gardien / garde du corps'] },
  { id: 'maid',         slug: 'bonne',         label: 'Bonne à tout faire',            icon: '👩‍🍳', color: '#4facfe', type: 'service', i18nKey: 'home.svc.housekeeper',  legacyAliases: ['Bonne à tout faire'] },
  { id: 'developer',    slug: 'developpeur',   label: 'Développeur / IT',              icon: '👨‍💻', color: '#30b0fe', type: 'service', i18nKey: 'home.svc.developer',    legacyAliases: ['Développeur / IT', 'Informatique & Tech'] },
  { id: 'designer',     slug: 'designer',      label: 'Designer / graphiste',          icon: '🎨',  color: '#a8edea', type: 'service', i18nKey: 'home.svc.designer',     legacyAliases: ['Designer / graphiste', 'Design & Graphisme'] },
  { id: 'photographer', slug: 'photographe',   label: 'Photographe / vidéaste',        icon: '📷',  color: '#fed6e3', type: 'service', i18nKey: 'home.svc.photographer', legacyAliases: ['Photographe / vidéaste', 'Photographie & Vidéo'] },
  { id: 'plumber',      slug: 'plombier',      label: 'Plombier',                      icon: '🔧',  color: '#74b9ff', type: 'service', i18nKey: 'home.svc.plumber',      legacyAliases: ['Plombier'] },
  { id: 'electrician',  slug: 'electricien',    label: 'Électricien',                   icon: '⚡',  color: '#fdcb6e', type: 'service', i18nKey: 'home.svc.electrician',  legacyAliases: ['Électricien'] },
  { id: 'mason',        slug: 'macon',         label: 'Maçon',                         icon: '🏗️', color: '#a29bfe', type: 'service', i18nKey: 'home.svc.mason',        legacyAliases: ['Maçon', 'Construction & BTP'] },
  { id: 'repair',       slug: 'reparateur',    label: 'Réparateur téléphone / PC',     icon: '🔧',  color: '#fab1a0', type: 'service', i18nKey: 'home.svc.repairer',     legacyAliases: ['Réparateur téléphone / PC', 'Réparation & Dépannage'] },
  { id: 'consultant',   slug: 'consultant',    label: 'Consultant',                    icon: '👔',  color: '#48dbfb', type: 'service', i18nKey: 'home.svc.consultant',   legacyAliases: ['Consultant', 'Conseil & Consulting', 'Services professionnels'] },
  { id: 'marketing',    slug: 'marketing',     label: 'Marketing / publicité',         icon: '📊',  color: '#ff6b9d', type: 'service', i18nKey: 'home.svc.marketing',    legacyAliases: ['Marketing / publicité'] },
  { id: 'coach',        slug: 'coach',         label: 'Coach sportif',                 icon: '💪',  color: '#1dd1a1', type: 'service', i18nKey: 'home.svc.sportCoach',   legacyAliases: ['Coach sportif'] },
  { id: 'svc-beauty',   slug: 'coiffure',      label: 'Coiffure / beauté',             icon: '💇',  color: '#ff9ff3', type: 'service', i18nKey: 'home.svc.hairdressing', legacyAliases: ['Coiffure / beauté', 'Coiffure & Esthétique'] },
  { id: 'tailor',       slug: 'couture',       label: 'Couture',                       icon: '✂️',  color: '#54a0ff', type: 'service', i18nKey: 'home.svc.sewing',       legacyAliases: ['Couture', 'Couture & Retouche'] },
  { id: 'events',       slug: 'evenementiel',  label: 'Animation / événementiel',      icon: '🎉',  color: '#48dbfb', type: 'service', i18nKey: 'home.svc.events',       legacyAliases: ['Animation / événementiel', 'Événementiel'] },
  { id: 'accounting',   slug: 'comptabilite',  label: 'Comptabilité',                  icon: '💹',  color: '#1dd1a1', type: 'service', i18nKey: 'home.svc.accounting',   legacyAliases: ['Comptabilité'] },
  { id: 'admin',        slug: 'admin',         label: 'Assistance administrative',     icon: '📋',  color: '#ffa502', type: 'service', i18nKey: 'home.svc.admin',        legacyAliases: ['Assistance administrative'] },
  { id: 'delivery',     slug: 'livraison',     label: 'Livraison / transport',         icon: '🚚',  color: '#ff6348', type: 'service', i18nKey: 'home.svc.delivery',     legacyAliases: ['Livraison / transport'] },
  { id: 'gardening',    slug: 'jardinage',     label: 'Jardinage',                     icon: '🌱',  color: '#2ed573', type: 'service', i18nKey: 'home.svc.gardening',    legacyAliases: ['Jardinage'] },
  { id: 'decoration',   slug: 'decoration',    label: 'Décoration intérieure',         icon: '🏠',  color: '#ff9ff3', type: 'service', i18nKey: 'home.svc.decoration',   legacyAliases: ['Décoration intérieure'] },
];

/* ══════════════════════════════════════════════════════════
   REGISTRE COMPLET + HELPERS
   ══════════════════════════════════════════════════════════ */

/** Toutes les catégories (produits + services) */
export const CATEGORY_REGISTRY: CategoryEntry[] = [...PRODUCT_REGISTRY, ...SERVICE_REGISTRY];

/* ── Index maps (calculés une seule fois) ── */

/** Lookup rapide par id */
const _byId = new Map<string, CategoryEntry>();
/** Lookup par slug URL */
const _bySlug = new Map<string, CategoryEntry>();
/** Lookup par alias legacy (lowercase) → catégorie */
const _byLegacy = new Map<string, CategoryEntry>();

for (const cat of CATEGORY_REGISTRY) {
  _byId.set(cat.id, cat);
  _bySlug.set(cat.slug, cat);
  for (const alias of cat.legacyAliases) {
    _byLegacy.set(alias.toLowerCase(), cat);
  }
  // Also index by label and id as legacy
  _byLegacy.set(cat.label.toLowerCase(), cat);
  _byLegacy.set(cat.id.toLowerCase(), cat);
}

/* ── Helpers d'accès ── */

/** Trouver une catégorie par son id technique */
export const getCategoryById = (id: string): CategoryEntry | undefined => _byId.get(id);

/** Trouver une catégorie par son slug URL */
export const getCategoryBySlug = (slug: string): CategoryEntry | undefined => _bySlug.get(slug);

/**
 * Normaliser une catégorie legacy (string DB) vers l'id technique.
 * Accepte : label exact, ancien label, id, ou slug.
 * Retourne l'id technique ou la valeur originale si non trouvée.
 */
export function normalizeCategoryToId(raw: string | undefined | null): string {
  if (!raw) return 'misc';
  const entry = _byLegacy.get(raw.toLowerCase()) ?? _bySlug.get(raw.toLowerCase());
  return entry?.id ?? 'misc';
}

/** Normaliser vers l'objet CategoryEntry complet */
export function resolveCategory(raw: string | undefined | null): CategoryEntry {
  if (!raw) return _byId.get('misc')!;
  const entry = _byLegacy.get(raw.toLowerCase()) ?? _bySlug.get(raw.toLowerCase()) ?? _byId.get(raw);
  return entry ?? _byId.get('misc')!;
}

/** Slug URL → { type, id } pour l'explorer (remplace CATEGORY_URL_MAP) */
export function slugToCategoryInfo(slug: string): { type: CategoryType; id: string } | undefined {
  const entry = _bySlug.get(slug);
  return entry ? { type: entry.type, id: entry.id } : undefined;
}

/* ── Exports dérivés (rétro-compatibilité) ── */

/** Labels pour les formulaires de publication — produits */
export const LISTING_PRODUCT_CATEGORIES = PRODUCT_REGISTRY.map((c) => c.label) as readonly string[];

/** Labels pour les formulaires de publication — services */
export const LISTING_SERVICE_CATEGORIES = SERVICE_REGISTRY.map((c) => c.label) as readonly string[];

/** Format HomePage : { nameKey, code, href } */
export type HomeCategoryItem = { nameKey: string; code: string; href: string };

export const HOME_PRODUCT_CATEGORIES: HomeCategoryItem[] = PRODUCT_REGISTRY.map((c) => ({
  nameKey: c.i18nKey,
  code: c.icon,
  href: `/explorer?type=produits&category=${c.slug}`,
}));

export const HOME_SERVICE_CATEGORIES: HomeCategoryItem[] = SERVICE_REGISTRY.map((c) => ({
  nameKey: c.i18nKey,
  code: c.icon,
  href: `/explorer?type=services&category=${c.slug}`,
}));

/** Format Explorer data : { id, label, icon, color } */
export type ExplorerCategory = { id: string; label: string; icon: string; color: string };

export const EXPLORER_PRODUCT_CATEGORIES: ExplorerCategory[] = PRODUCT_REGISTRY.map((c) => ({
  id: c.id, label: c.label, icon: c.icon, color: c.color,
}));

export const EXPLORER_SERVICE_CATEGORIES: ExplorerCategory[] = SERVICE_REGISTRY.map((c) => ({
  id: c.id, label: c.label, icon: c.icon, color: c.color,
}));
