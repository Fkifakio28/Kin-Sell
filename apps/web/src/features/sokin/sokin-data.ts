export type SoKinVisibility = "PUBLIC" | "CONTACTS_ONLY";
export type SoKinMediaKind = "image" | "gif" | "video";
export type SoKinLinkedKind = "product" | "service" | "profile" | "shop";

export type SoKinAuthor = {
  name: string;
  handle: string;
  kinId: string;
  avatarUrl: string;
  city: string;
  isPrivate: boolean;
};

export type SoKinMedia = {
  kind: SoKinMediaKind;
  src: string;
  label: string;
};

export type SoKinComment = {
  id: string;
  author: string;
  kinId: string;
  text: string;
  likes: number;
  replies?: SoKinComment[];
};

export type SoKinLinkedCard = {
  kind: SoKinLinkedKind;
  title: string;
  subtitle: string;
  priceLabel?: string;
  actionLabel: "Voir" | "Contacter";
  href: string;
};

export type SoKinPost = {
  id: string;
  author: SoKinAuthor;
  timestampLabel: string;
  text: string;
  visibility: SoKinVisibility;
  media: SoKinMedia[];
  linkedCard?: SoKinLinkedCard;
  likes: number;
  reactionCounts: Partial<Record<SoKinReactionType, number>>;
  myReaction: SoKinReactionType | null;
  comments: number;
  shares: number;
  sponsored?: boolean;
  thread: SoKinComment[];
};

export type SoKinReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export type SoKinTrend = {
  label: string;
  volume: string;
};

export type SoKinSuggestion = {
  name: string;
  type: "Profil" | "Entreprise";
  metric: string;
  href: string;
};

export type SoKinAdSlot = {
  title: string;
  description: string;
  href: string;
};

// Données vides — seront remplies par les vrais utilisateurs via l'API
export const SOKIN_POSTS: SoKinPost[] = [];

export const SOKIN_TRENDS: SoKinTrend[] = [];

export const SOKIN_TRENDING_CATEGORIES: SoKinTrend[] = [];

export const SOKIN_VIRAL_POSTS: SoKinTrend[] = [];

export const SOKIN_SUGGESTIONS: SoKinSuggestion[] = [];

export const SOKIN_ANALYTICS_FALLBACK = {
  notifications: 0,
  unreadMessages: 0,
  postsToday: 0,
  activeUsers: 0,
  trends: [] as SoKinTrend[],
  trendingCategories: [] as SoKinTrend[],
  viralPosts: [] as SoKinTrend[],
  suggestions: [] as SoKinSuggestion[],
};

export const SOKIN_AD_SLOTS: {
  top: SoKinAdSlot;
  side: SoKinAdSlot;
  bottom: SoKinAdSlot;
} = {
  top: {
    title: "Boost visibilité boutique",
    description: "Propulsez vos annonces So-Kin vers plus de clients qualifiés.",
    href: "/explorer",
  },
  side: {
    title: "Offre entreprise",
    description: "Passez en Premium pour sponsoriser vos publications So-Kin.",
    href: "/sokin",
  },
  bottom: {
    title: "Publiez dans Explorer",
    description: "Transformez vos posts performants en annonces Explorer en 1 clic.",
    href: "/explorer",
  },
};
