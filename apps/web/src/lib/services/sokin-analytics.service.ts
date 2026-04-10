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
  sokinSummary: {
    postCount: number;
    totalViews: number;
    avgSocialScore: number;
    avgBusinessScore: number;
    topPostId: string | null;
  } | null;
};

// ── Types — Deep Insights (Palier 2, Premium) ──

export type SoKinDeepInsights = {
  tier: "PREMIUM";
  funnelAnalysis: {
    activeListings: number;
    totalNegotiations: number;
    negotiationConversionRate: number;
    cartAbandonment: number;
    ordersCompleted: number;
    overallConversionRate: number;
  };
  audienceSegmentation: {
    cityBreakdown: { city: string; count: number; percent: number }[];
    categoryBreakdown: { category: string; count: number; revenueCents: number }[];
    buyerRetentionRate: number;
  };
  velocityScore: {
    label: "SLOW" | "NORMAL" | "FAST" | "ACCELERATING";
    score: number;
    insight: string;
  };
  predictiveSuggestions: string[];
  automationTriggers: {
    agent: string;
    action: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
  }[];
  competitorContext: {
    categoryRank: number;
    totalSellersInCategory: number;
    strengthAreas: string[];
    improvementAreas: string[];
  };
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

export type HashtagPerformance = {
  hashtag: string;
  usageCount: number;
  avgViews: number;
  avgEngagement: number;
  trend: 'HOT' | 'STABLE' | 'COLD';
};

export type TypePerformance = {
  postType: string;
  postCount: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgEngagementRate: number;
  trend: 'UP' | 'STABLE' | 'DOWN';
};

export type GlobalTrends = {
  period: '7d';
  topHashtags: HashtagPerformance[];
  topTypes: TypePerformance[];
  emergingHashtags: string[];
};

export type PostInsightCard = {
  postId: string;
  postType: string;
  publishedAt: string;
  reach: { views: number; label: string };
  engagement: { likes: number; comments: number; shares: number; rate: number; label: string };
  comments: { total: number; replies: number; label: string };
  reposts: { total: number; label: string };
  saves: { total: number; label: string };
  potential: { score: number; level: 'ÉLEVÉ' | 'BON' | 'MOYEN' | 'FAIBLE'; label: string };
  suggestion: { title: string; message: string; action?: string };
  // Premium (null if not subscribed)
  localInterest: { city: string; viewsFromCity: number; label: string } | null;
  clicks: { listings: number; profiles: number; contacts: number; label: string } | null;
  dmOpens: { total: number; label: string } | null;
};

// ── Types — Author Dashboard ──

export type AuthorDashboard = {
  period: "7d" | "30d";
  overview: {
    posts: number;
    views: number;
    engagementRate: number;
    avgPotential: number;
    label: string;
  };
  topPost: {
    id: string;
    type: string;
    views: number;
    label: string;
  } | null;
  suggestion: {
    type: string;
    message: string;
    actionLabel: string;
  };
  premium: {
    bestTiming: { day: string; hour: string; label: string };
    hotHashtags: { hashtag: string; avgEngagement: number }[];
    topCity: { city: string; views: number; label: string } | null;
    socialVsBusiness: {
      social: number;
      business: number;
      profile: string;
      label: string;
    };
  } | null;
};

export type AuthorTrackingStats = {
  views: number;
  commentOpens: number;
  profileClicks: number;
  listingClicks: number;
  contactClicks: number;
  dmOpens: number;
  period: string;
};

export type AuthorTip = {
  id: string;
  triggerType: string;
  title: string;
  message: string;
  actionType: string;
  actionTarget: string | null;
  actionData: Record<string, unknown>;
  priority: number;
  createdAt: string;
};

// ── Types — Smart Feed Blocks ──

export type SmartHotHashtag = {
  hashtag: string;
  posts7d: number;
  avgEngagement: number;
  velocity: 'RISING' | 'STEADY' | 'NEW';
};

export type SmartTrendingTopic = {
  topic: string;
  label: string;
  posts7d: number;
  engagement7d: number;
  momentum: 'UP' | 'STABLE' | 'EMERGING';
};

export type SmartPublishIdea = {
  id: string;
  type: 'FORMAT' | 'HASHTAG' | 'TOPIC' | 'TIMING' | 'GEO';
  title: string;
  reason: string;
  actionLabel: string;
};

export type SmartWinningFormat = {
  postType: string;
  label: string;
  posts7d: number;
  avgViews: number;
  avgEngagement: number;
  trend: 'HOT' | 'STABLE' | 'COOL';
};

export type SmartBoostOpportunity = {
  postId: string;
  authorId: string;
  boostScore: number;
  reason: string;
  actionLabel: string;
};

export type SmartFeedBlocks = {
  trendingTopics: SmartTrendingTopic[];
  hotHashtags: SmartHotHashtag[];
  publishIdeas: SmartPublishIdea[];
  boostOpportunities: SmartBoostOpportunity[];
  winningFormats: SmartWinningFormat[];
  generatedAt: string;
};

export type SoKinTier = 'FREE' | 'ANALYTICS' | 'ADS' | 'ADMIN';

export type UpsellHint = {
  feature: string;
  requiredPlan: string;
  message: string;
  ctaLabel: string;
  ctaRoute: string;
};

export type SoKinAccessInfo = {
  tier: SoKinTier;
  planCode: string;
  features: {
    analytics: boolean;
    ads: boolean;
    admin: boolean;
  };
  upsells: UpsellHint[];
};

// ── Scoring détaillé ──

export type SocialBreakdown = {
  reactionsPoints: number;
  commentsPoints: number;
  repliesPoints: number;
  sharesPoints: number;
  bookmarksPoints: number;
  velocityPoints: number;
  profileClicksPoints: number;
  localInterestPoints: number;
};

export type BusinessBreakdown = {
  listingClicksPoints: number;
  contactClicksPoints: number;
  dmOpensPoints: number;
  postNaturePoints: number;
  localDemandPoints: number;
  authorProfilePoints: number;
};

export type BoostBreakdown = {
  socialWeight: number;
  businessWeight: number;
  contentQualityPoints: number;
  geoReachPoints: number;
  postTypePoints: number;
};

export type ScoredPost = {
  postId: string;
  socialScore: number;
  businessScore: number;
  boostScore: number;
  breakdown: {
    social: SocialBreakdown;
    business: BusinessBreakdown;
    boost: BoostBreakdown;
  };
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

  /** Insight enrichi d'un post (free + premium) */
  postInsightCard: (postId: string) =>
    request<PostInsightCard>(`/sokin/trends/insights/post/${encodeURIComponent(postId)}`),

  /** Dashboard auteur So-Kin */
  authorDashboard: (period: "7d" | "30d" = "7d") =>
    request<AuthorDashboard>("/sokin/trends/insights/my", {
      params: { period } as Record<string, string>,
    }),

  /** Stats de tracking auteur (7j) */
  trackingStats: () =>
    request<{ stats: AuthorTrackingStats }>("/sokin/tracking/stats"),

  /** Conseils IA auteur */
  advisorTips: (limit = 3) =>
    request<{ tips: AuthorTip[] }>("/sokin/advisor/tips", {
      params: { limit } as unknown as Record<string, string>,
    }),

  /** Smart Feed Blocks — vue combinée tendances + formats + idées */
  smartFeed: (params?: { city?: string }) =>
    request<SmartFeedBlocks>("/sokin/trends/smart/feed", {
      params: params as Record<string, string | undefined>,
    }),

  /** Accès So-Kin — tier + features + upsells */
  access: () =>
    request<SoKinAccessInfo>("/sokin/trends/access"),

  /** Scoring détaillé d'un post (premium) */
  scoringDetail: (postId: string) =>
    request<ScoredPost>(`/sokin/scoring/post/${encodeURIComponent(postId)}`),

  /** Tendances globales So-Kin */
  globalTrends: (city?: string) =>
    request<GlobalTrends>('/sokin/trends/analytics/global', {
      params: city ? { city } as Record<string, string> : undefined,
    }),
};
