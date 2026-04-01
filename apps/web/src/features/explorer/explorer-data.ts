/* Données de configuration Explorer — catégories statiques uniquement.
   Les boutiques, profils et articles sont chargés depuis l'API. */

export type ExplorerCategory = {
  id: string;
  label: string;
  icon: string;
  color: string;
  itemCountLabel: string;
};

export type ExplorerShop = {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  image: string;
  badge: string;
  href: string;
  city: string;
  status: 'EN_LIGNE' | 'HORS_LIGNE';
  coverImage: string;
};

export type ExplorerProfile = {
  id: string;
  name: string;
  kinId: string;
  rating: number;
  reviews: number;
  badge: string;
  href: string;
  city: string;
  domain: string;
  avatarImage: string;
};

export type ExplorerArticleMedia = {
  kind: 'image' | 'video';
  previewLabel: string;
};

export type ExplorerArticlePreview = {
  id: string;
  title: string;
  priceLabel: string;
  priceUsdCents: number;
  kind: 'product' | 'service';
  category?: string;
  publisherName: string;
  publisherType: 'personne' | 'boutique';
  publisherLink: string;
  targetPath: string;
  coverImage: string;
  promoLabel?: string;
  media: ExplorerArticleMedia[];
  ownerId?: string;
  isNegotiable?: boolean;
  latitude?: number;
  longitude?: number;
};

// Statistiques réelles — calculées depuis l'API (valeurs initiales à 0)
export const EXPLORER_STATS = {
  categories: 0,
  profiles: 0,
  shops: 0,
};

export const PRODUCT_CATEGORIES: ExplorerCategory[] = [
  { id: 'food', label: 'Nourriture', icon: '🍔', color: '#ff6b6b', itemCountLabel: '' },
  { id: 'phone', label: 'Téléphone', icon: '📱', color: '#6f58ff', itemCountLabel: '' },
  { id: 'it', label: 'Accessoires informatiques', icon: '💻', color: '#4ecdc4', itemCountLabel: '' },
  { id: 'games', label: 'Jeux vidéo', icon: '🎮', color: '#ffe66d', itemCountLabel: '' },
  { id: 'pharmacy', label: 'Pharmacie', icon: '💊', color: '#95e1d3', itemCountLabel: '' },
  { id: 'clothes', label: 'Vêtements', icon: '👕', color: '#f38181', itemCountLabel: '' },
  { id: 'pets', label: 'Animalerie', icon: '🐾', color: '#aa96da', itemCountLabel: '' },
  { id: 'furniture', label: 'Maison & mobilier', icon: '🛋️', color: '#fcbad3', itemCountLabel: '' },
  { id: 'appliances', label: 'Électroménager', icon: '⚙️', color: '#c7ceea', itemCountLabel: '' },
  { id: 'electronics', label: 'Électronique', icon: '🔌', color: '#b5eae0', itemCountLabel: '' },
  { id: 'beauty', label: 'Beauté & cosmétiques', icon: '💄', color: '#ffddc1', itemCountLabel: '' },
  { id: 'baby', label: 'Bébé & enfants', icon: '👶', color: '#ff9999', itemCountLabel: '' },
  { id: 'sports', label: 'Sport & fitness', icon: '⚽', color: '#a8d8ea', itemCountLabel: '' },
  { id: 'books', label: 'Livres & éducation', icon: '📚', color: '#aa96da', itemCountLabel: '' },
  { id: 'diy', label: 'Bricolage', icon: '🔨', color: '#fcb4d5', itemCountLabel: '' },
  { id: 'gifts', label: 'Cadeaux', icon: '🎁', color: '#fff5ba', itemCountLabel: '' },
  { id: 'office', label: 'Fournitures de bureau', icon: '📎', color: '#c7f0d8', itemCountLabel: '' },
  { id: 'auto', label: 'Auto & moto', icon: '🏍️', color: '#fec8d8', itemCountLabel: '' },
  { id: 'health', label: 'Santé & bien-être', icon: '🏥', color: '#fddb92', itemCountLabel: '' },
  { id: 'carental', label: 'Location de voiture', icon: '🚗', color: '#a1c4fd', itemCountLabel: '' },
  { id: 'realestate', label: 'Immobilier', icon: '🏠', color: '#c471ed', itemCountLabel: '' },
  { id: 'misc', label: 'Divers', icon: '📦', color: '#ffecd2', itemCountLabel: '' },
];

export const SERVICE_CATEGORIES: ExplorerCategory[] = [
  { id: 'teacher', label: 'Professeur', icon: '👨‍🏫', color: '#667eea', itemCountLabel: '' },
  { id: 'daycare', label: 'Nounou', icon: '👶', color: '#764ba2', itemCountLabel: '' },
  { id: 'cleaner', label: 'Femme de ménage', icon: '🧹', color: '#f093fb', itemCountLabel: '' },
  { id: 'maid', label: 'Bonne à tout faire', icon: '👩‍🍳', color: '#4facfe', itemCountLabel: '' },
  { id: 'security', label: 'Gardien / garde du corps', icon: '👮', color: '#00f2fe', itemCountLabel: '' },
  { id: 'nurse', label: 'Infirmière / aide-soignant', icon: '⚕️', color: '#43e97b', itemCountLabel: '' },
  { id: 'driver', label: 'Chauffeur', icon: '🚕', color: '#fa709a', itemCountLabel: '' },
  { id: 'cook', label: 'Cuisinière', icon: '👨‍🍳', color: '#fee140', itemCountLabel: '' },
  { id: 'developer', label: 'Développeur / IT', icon: '👨‍💻', color: '#30b0fe', itemCountLabel: '' },
  { id: 'designer', label: 'Designer / graphiste', icon: '🎨', color: '#a8edea', itemCountLabel: '' },
  { id: 'photographer', label: 'Photographe / vidéaste', icon: '📷', color: '#fed6e3', itemCountLabel: '' },
  { id: 'plumber', label: 'Plombier', icon: '🔧', color: '#74b9ff', itemCountLabel: '' },
  { id: 'electrician', label: 'Électricien', icon: '⚡', color: '#fdcb6e', itemCountLabel: '' },
  { id: 'mason', label: 'Maçon', icon: '🏗️', color: '#a29bfe', itemCountLabel: '' },
  { id: 'repair', label: 'Réparateur téléphone / PC', icon: '🔧', color: '#fab1a0', itemCountLabel: '' },
  { id: 'consultant', label: 'Consultant', icon: '👔', color: '#48dbfb', itemCountLabel: '' },
  { id: 'marketing', label: 'Marketing / publicité', icon: '📊', color: '#ff6b9d', itemCountLabel: '' },
  { id: 'coach', label: 'Coach sportif', icon: '💪', color: '#1dd1a1', itemCountLabel: '' },
  { id: 'beauty', label: 'Coiffure / beauté', icon: '💇', color: '#ff9ff3', itemCountLabel: '' },
  { id: 'tailor', label: 'Couture', icon: '✂️', color: '#54a0ff', itemCountLabel: '' },
  { id: 'events', label: 'Animation / événementiel', icon: '🎉', color: '#48dbfb', itemCountLabel: '' },
  { id: 'accounting', label: 'Comptabilité', icon: '💹', color: '#1dd1a1', itemCountLabel: '' },
  { id: 'admin', label: 'Assistance administrative', icon: '📋', color: '#ffa502', itemCountLabel: '' },
  { id: 'delivery', label: 'Livraison / transport', icon: '🚚', color: '#ff6348', itemCountLabel: '' },
  { id: 'gardening', label: 'Jardinage', icon: '🌱', color: '#2ed573', itemCountLabel: '' },
  { id: 'decoration', label: 'Décoration intérieure', icon: '🏠', color: '#ff9ff3', itemCountLabel: '' },
];

// Tableaux vides — seront remplis par les vrais utilisateurs et boutiques via l'API
export const FEATURED_SHOPS: ExplorerShop[] = [];

export const FEATURED_PROFILES: ExplorerProfile[] = [];

export const ARTICLE_PREVIEWS: ExplorerArticlePreview[] = [];
