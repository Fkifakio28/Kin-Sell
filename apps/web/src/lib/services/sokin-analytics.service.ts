import { request, mutate } from "../api-core";

// ── Types — Basic Insights (Palier 1, tous utilisateurs) ──

export type SoKinBasicInsights = {
  tier: "MEDIUM";
  activitySummary: {
    listings: number;
    activeListings: number;
    negotiations: number;
    acceptedNegotiations: number;
    orders: number;
    revenueCents: number;
  };
  marketPosition: {
    avgPriceCents: number;
    medianCents: number;
    position: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET";
    message: string;
  };
  trendingCategories: { category: string; count: number }[];
  bestPublicationHour: number;
  recommendations: string[];
};

// ── Types — Deep Insights (Palier 2, Premium) ──

export type SoKinDeepInsights = {
  tier: "PREMIUM";
  funnel: {
    views: number;
    contacts: number;
    negotiations: number;
    conversions: number;
    conversionRate: number;
  };
  audience: {
    topCities: { city: string; count: number }[];
    peakHours: number[];
  };
  velocity: {
    avgDaysToSell: number;
    trend: "IMPROVING" | "STABLE" | "DECLINING";
  };
  predictions: string[];
};

// ── Types — Trending ──

export type TrendingTopic = {
  tag: string;
  count: number;
  label: string;
  trend: "up" | "stable" | "new";
};

export type TrendingHashtag = {
  hashtag: string;
  count: number;
};

export type SuggestedProfile = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  postCount: number;
};

export type PostInsight = {
  postId: string;
  views: number;
  engagementRate: number;
  potentialScore: number; // 0-100
  boostSuggested: boolean;
  tip: string | null;
};

// ── API — Analytics ──

export const sokinAnalytics = {
  /** Insights de base (tous utilisateurs connectés) */
  basicInsights: () =>
    request<SoKinBasicInsights>("/analytics/ai/basic"),

  /** Insights profonds (Premium/Pro) */
  deepInsights: () =>
    request<SoKinDeepInsights>("/analytics/ai/deep"),

  /** Recommandations IA actives */
  recommendations: () =>
    request<{
      id: string;
      type: string;
      title: string;
      message: string;
      priority: number;
      status: string;
    }[]>("/analytics/ai/recommendations"),

  /** Fermer une recommandation */
  dismissRecommendation: (id: string) =>
    mutate<{ ok: boolean }>(
      `/analytics/ai/recommendations/${encodeURIComponent(id)}/dismiss`,
      { method: "POST" },
      []
    ),

  /** Tendances de l'utilisateur */
  trends: () =>
    request<{ trends: { metric: string; direction: string; value: number }[] }>(
      "/analytics/ai/trends"
    ),

  /** Pricing nudges */
  pricingNudges: () =>
    request<{ nudges: { id: string; message: string; ctaLabel: string; ctaTarget: string }[] }>(
      "/analytics/ai/pricing-nudges"
    ),

  /** Conseil commercial */
  commercialAdvice: () =>
    request<{ advice: { id: string; message: string; ctaLabel: string; ctaTarget: string }[] }>(
      "/analytics/ai/commercial-advice"
    ),
};

// ── API — Trends So-Kin (feed-level) ──

export const sokinTrends = {
  /** Tendances locales (hashtags, sujets populaires) */
  trending: (params?: { city?: string; limit?: number }) =>
    request<{ topics: TrendingTopic[]; hashtags: TrendingHashtag[] }>(
      "/sokin/trends",
      { params: params as Record<string, string | number | undefined> }
    ),

  /** Profils suggérés */
  suggestedProfiles: (params?: { city?: string; limit?: number }) =>
    request<{ profiles: SuggestedProfile[] }>(
      "/sokin/trends/profiles",
      { params: params as Record<string, string | number | undefined> }
    ),

  /** Insights d'un post (auteur only) */
  postInsight: (postId: string) =>
    request<PostInsight>(`/sokin/trends/post-insight/${encodeURIComponent(postId)}`),
};
