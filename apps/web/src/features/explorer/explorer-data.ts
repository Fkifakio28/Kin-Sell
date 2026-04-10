/* Données de configuration Explorer — catégories depuis le registre central.
   Les boutiques, profils et articles sont chargés depuis l'API. */

import {
  EXPLORER_PRODUCT_CATEGORIES,
  EXPLORER_SERVICE_CATEGORIES,
} from '../../shared/constants/category-registry';

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
  originalPriceLabel?: string;
  media: ExplorerArticleMedia[];
  ownerId?: string;
  isNegotiable?: boolean;
  isBoosted?: boolean;
  latitude?: number;
  longitude?: number;
};

// Statistiques réelles — calculées depuis l'API (valeurs initiales à 0)
export const EXPLORER_STATS = {
  categories: 0,
  profiles: 0,
  shops: 0,
};

// Catégories dérivées du registre central (ajout itemCountLabel pour compatibilité)
export const PRODUCT_CATEGORIES: ExplorerCategory[] = EXPLORER_PRODUCT_CATEGORIES.map((c) => ({
  ...c,
  itemCountLabel: '',
}));

export const SERVICE_CATEGORIES: ExplorerCategory[] = EXPLORER_SERVICE_CATEGORIES.map((c) => ({
  ...c,
  itemCountLabel: '',
}));

// Tableaux vides — seront remplis par les vrais utilisateurs et boutiques via l'API
export const FEATURED_SHOPS: ExplorerShop[] = [];

export const FEATURED_PROFILES: ExplorerProfile[] = [];

export const ARTICLE_PREVIEWS: ExplorerArticlePreview[] = [];
