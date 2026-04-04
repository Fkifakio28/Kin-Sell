/**
 * Catégories produits & services — source unique.
 * Utilisées dans HomePage, UserDashboard, BusinessDashboard.
 */

/* ── Catégories pour formulaire listing (chaînes simples) ── */
export const LISTING_PRODUCT_CATEGORIES = [
  'Téléphones & Accessoires', 'Informatique & Bureautique', 'Électronique & TV',
  'Vêtements & Mode', 'Chaussures & Sacs', 'Beauté & Cosmétiques',
  'Alimentation & Boissons', 'Maison & Mobilier', 'Électroménager',
  'Jeux vidéo & Consoles', 'Auto & Moto', 'Bébé & Enfant',
  'Sports & Loisirs', 'Livres & Papeterie', 'Bijoux & Montres',
  'Santé & Bien-être', 'Agriculture & Jardin', 'Autre produit',
] as const;

export const LISTING_SERVICE_CATEGORIES = [
  'Coiffure & Esthétique', 'Transport & Livraison', 'Réparation & Dépannage',
  'Santé & Soins', 'Éducation & Cours particuliers', 'Informatique & Tech',
  'Construction & BTP', 'Restauration & Traiteur', 'Couture & Retouche',
  'Photographie & Vidéo', 'Ménage & Nettoyage', 'Mécanique & Auto',
  'Conseil & Consulting', 'Design & Graphisme', 'Événementiel',
  'Autre service',
] as const;

/* ── Catégories pour navigation homepage (avec icônes & liens) ── */
export type HomeCategoryItem = {
  nameKey: string;
  code: string;
  href: string;
};

export const HOME_PRODUCT_CATEGORIES: HomeCategoryItem[] = [
  { nameKey: "home.cat.food", code: "🍔", href: "/explorer?type=produits&category=nourriture" },
  { nameKey: "home.cat.phones", code: "📱", href: "/explorer?type=produits&category=telephones" },
  { nameKey: "home.cat.computers", code: "💻", href: "/explorer?type=produits&category=high-tech" },
  { nameKey: "home.cat.gaming", code: "🎮", href: "/explorer?type=produits&category=jeux" },
  { nameKey: "home.cat.pharmacy", code: "💊", href: "/explorer?type=produits&category=pharmacie" },
  { nameKey: "home.cat.fashion", code: "👕", href: "/explorer?type=produits&category=mode" },
  { nameKey: "home.cat.pets", code: "🐾", href: "/explorer?type=produits&category=animalerie" },
  { nameKey: "home.cat.home", code: "🛋️", href: "/explorer?type=produits&category=maison" },
  { nameKey: "home.cat.appliances", code: "⚙️", href: "/explorer?type=produits&category=electromenager" },
  { nameKey: "home.cat.electronics", code: "🔌", href: "/explorer?type=produits&category=high-tech" },
  { nameKey: "home.cat.beauty", code: "💄", href: "/explorer?type=produits&category=beaute" },
  { nameKey: "home.cat.baby", code: "👶", href: "/explorer?type=produits&category=bebe" },
  { nameKey: "home.cat.sports", code: "⚽", href: "/explorer?type=produits&category=sports" },
  { nameKey: "home.cat.books", code: "📚", href: "/explorer?type=produits&category=livres" },
  { nameKey: "home.cat.diy", code: "🔨", href: "/explorer?type=produits&category=bricolage" },
  { nameKey: "home.cat.gifts", code: "🎁", href: "/explorer?type=produits&category=cadeaux" },
  { nameKey: "home.cat.office", code: "📎", href: "/explorer?type=produits&category=bureau" },
  { nameKey: "home.cat.autoMoto", code: "🏍️", href: "/explorer?type=produits&category=voitures" },
  { nameKey: "home.cat.health", code: "🏥", href: "/explorer?type=produits&category=sante" },
  { nameKey: "home.cat.carRental", code: "🚗", href: "/explorer?type=produits&category=location" },
  { nameKey: "home.cat.realEstate", code: "🏠", href: "/explorer?type=produits&category=immobilier" },
  { nameKey: "home.cat.misc", code: "📦", href: "/explorer?type=produits&category=divers" },
];

export const HOME_SERVICE_CATEGORIES: HomeCategoryItem[] = [
  { nameKey: "home.svc.drivers", code: "🚕", href: "/explorer?type=services&category=chauffeurs" },
  { nameKey: "home.svc.nannies", code: "👶", href: "/explorer?type=services&category=nounous" },
  { nameKey: "home.svc.teachers", code: "👨‍🏫", href: "/explorer?type=services&category=professeurs" },
  { nameKey: "home.svc.nurses", code: "⚕️", href: "/explorer?type=services&category=infirmieres" },
  { nameKey: "home.svc.cleaning", code: "🧹", href: "/explorer?type=services&category=menage" },
  { nameKey: "home.svc.cooking", code: "👨‍🍳", href: "/explorer?type=services&category=cuisine" },
  { nameKey: "home.svc.security", code: "👮", href: "/explorer?type=services&category=gardiennage" },
  { nameKey: "home.svc.housekeeper", code: "👩‍🍳", href: "/explorer?type=services&category=bonne" },
  { nameKey: "home.svc.developer", code: "👨‍💻", href: "/explorer?type=services&category=developpeur" },
  { nameKey: "home.svc.designer", code: "🎨", href: "/explorer?type=services&category=designer" },
  { nameKey: "home.svc.photographer", code: "📷", href: "/explorer?type=services&category=photographe" },
  { nameKey: "home.svc.plumber", code: "🔧", href: "/explorer?type=services&category=plombier" },
  { nameKey: "home.svc.electrician", code: "⚡", href: "/explorer?type=services&category=electricien" },
  { nameKey: "home.svc.mason", code: "🏗️", href: "/explorer?type=services&category=macon" },
  { nameKey: "home.svc.repairer", code: "🔧", href: "/explorer?type=services&category=reparateur" },
  { nameKey: "home.svc.consultant", code: "👔", href: "/explorer?type=services&category=consultant" },
  { nameKey: "home.svc.marketing", code: "📊", href: "/explorer?type=services&category=marketing" },
  { nameKey: "home.svc.sportCoach", code: "💪", href: "/explorer?type=services&category=coach" },
  { nameKey: "home.svc.hairdressing", code: "💇", href: "/explorer?type=services&category=coiffure" },
  { nameKey: "home.svc.sewing", code: "✂️", href: "/explorer?type=services&category=couture" },
  { nameKey: "home.svc.events", code: "🎉", href: "/explorer?type=services&category=evenementiel" },
  { nameKey: "home.svc.accounting", code: "💹", href: "/explorer?type=services&category=comptabilite" },
  { nameKey: "home.svc.admin", code: "📋", href: "/explorer?type=services&category=admin" },
  { nameKey: "home.svc.delivery", code: "🚚", href: "/explorer?type=services&category=livraison" },
  { nameKey: "home.svc.gardening", code: "🌱", href: "/explorer?type=services&category=jardinage" },
  { nameKey: "home.svc.decoration", code: "🏠", href: "/explorer?type=services&category=decoration" },
];
