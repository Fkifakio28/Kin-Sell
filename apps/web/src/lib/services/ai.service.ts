import { request, mutate } from "../api-core";

// ── IA Marchand (Negotiation AI) ──

export type BuyerNegotiationHint = {
  listingId: string;
  listingTitle: string;
  originalPriceUsdCents: number;
  suggestedOfferUsdCents: number;
  minRealisticOfferUsdCents: number;
  successRate: number;
  marketContext: "COMPETITIVE" | "FLEXIBLE" | "FIXED";
  messageSuggestion: string;
  insight: string;
  sampleSize: number;
  enrichment: {
    marketHeatScore: number;
    priceFlexibilityScore: number;
    regionalDemandScore: number;
    competitionPressureScore: number;
    confidenceScore: number;
    sourceType: string;
    externalInsight: string | null;
  } | null;
};

export type SellerNegotiationAdvice = {
  recommendation: "ACCEPT" | "COUNTER" | "REFUSE";
  counterSuggestionUsdCents: number | null;
  marginImpact: {
    originalPriceUsdCents: number;
    proposedPriceUsdCents: number;
    discountPercent: number;
  };
  conversionProbability: number;
  buyerProfile: {
    trustLevel: "LOW" | "MEDIUM" | "HIGH";
    previousPurchases: number;
    isRepeatBuyer: boolean;
  };
  insight: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
};

export type AutoRespondRules = {
  enabled: boolean;
  minFloorPercent?: number;
  maxAutoDiscountPercent?: number;
  preferredCounterPercent?: number;
  prioritizeSpeed?: boolean;
  stockUrgencyBoost?: boolean;
};

export type AutoRespondDecision = {
  action: "ACCEPT" | "COUNTER" | "REFUSE";
  counterPrice?: number;
  reasoning: string;
};

export const negotiationAi = {
  buyerHint: (listingId: string, proposedPrice?: number) =>
    request<BuyerNegotiationHint>(`/negotiations/ai/hint/${encodeURIComponent(listingId)}`, {
      params: proposedPrice ? { proposedPrice } : undefined,
    }),
  sellerAdvice: (negotiationId: string) =>
    request<SellerNegotiationAdvice>(`/negotiations/${encodeURIComponent(negotiationId)}/ai-advice/seller`),
  autoRespond: (negotiationId: string, rules: AutoRespondRules) =>
    request<AutoRespondDecision>(`/negotiations/${encodeURIComponent(negotiationId)}/ai-auto-respond`, {
      method: "POST",
      body: rules,
    }),
};

// ── Boutique Automatique (Auto-Shop) ──

export type AutoNegoRules = {
  enabled: boolean;
  minFloorPercent: number;
  maxAutoDiscountPercent: number;
  preferredCounterPercent: number;
  firmness: "FLEXIBLE" | "BALANCED" | "FIRM";
};

export type AutoShopListing = {
  id: string;
  title: string;
  category: string;
  priceUsdCents: number;
  imageUrl: string | null;
  isNegotiable: boolean;
  autoNegoRules: AutoNegoRules | null;
};

export const autoShop = {
  getListings: () =>
    request<AutoShopListing[]>("/negotiations/auto-shop/listings"),
  updateRules: (listingId: string, rules: AutoNegoRules) =>
    request<{ id: string; title: string; autoNegoRules: AutoNegoRules }>(`/negotiations/auto-shop/listings/${encodeURIComponent(listingId)}/rules`, {
      method: "PUT",
      body: rules,
    }),
  bulkUpdateRules: (rules: AutoNegoRules) =>
    request<{ updated: number; rules: AutoNegoRules }>("/negotiations/auto-shop/bulk-rules", {
      method: "PUT",
      body: rules,
    }),
};

// ── IA Commande (Order AI) ──

export type CheckoutAdvice = {
  cartId: string;
  bundleSuggestions: Array<{
    listingId: string;
    title: string;
    priceUsdCents: number;
    reason: string;
  }>;
  discountTrigger: {
    available: boolean;
    thresholdUsdCents: number;
    currentTotalUsdCents: number;
    savingsPercent: number;
    message: string | null;
  };
  urgencySignals: Array<{
    listingId: string;
    title: string;
    signal: "LOW_STOCK" | "PRICE_INCREASE" | "HIGH_DEMAND";
    message: string;
  }>;
  paymentOptimization: string;
  estimatedDeliveryHours: { min: number; max: number } | null;
};

export type AbandonmentRisk = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  suggestions: string[];
  cartAge: string;
};

export const orderAi = {
  checkoutAdvice: (cartId: string) =>
    request<CheckoutAdvice>(`/orders/ai/checkout-advice/${encodeURIComponent(cartId)}`),
  abandonmentRisk: () =>
    request<AbandonmentRisk>("/orders/ai/abandonment-risk"),
};

// ── Kin-Sell Analytique ──

export type BasicInsights = {
  activitySummary: { listings: number; negotiations: number; orders: number; revenueCents: number };
  marketPosition: { avgPriceCents: number; medianCents: number; position: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET" };
  trendingCategories: Array<{ category: string; count: number }>;
  bestPublicationHour: number | null;
  recommendations: string[];
};

export type DeepInsights = {
  funnel: { views: number; negotiations: number; orders: number; conversionRate: number };
  audienceSegments: Array<{ label: string; percent: number }>;
  velocityMetrics: { avgDaysToSell: number; fastestCategory: string | null };
  predictiveScores: { churnRisk: number; growthPotential: number };
};

export type DiagnosticReport = {
  overallScore: number;
  issues: Array<{ type: string; severity: "LOW" | "MEDIUM" | "HIGH"; agent: string; action: string; endpoint: string }>;
  prioritizedActions: string[];
  agentSummary: Array<{ agentName: string; status: string; reason: string }>;
};

export type MemoryReport = {
  currentMetrics: Record<string, number>;
  anomalies: Array<{ metric: string; change: number; severity: string }>;
  trends: Array<{ metric: string; direction: "UP" | "DOWN" | "STABLE"; delta: number }>;
  predictions: Array<{ metric: string; predicted: number; confidence: number }>;
  historicalComparison: { vsLastWeek: Record<string, number>; vsLastMonth: Record<string, number> };
};

export type AnomalyReport = {
  metric: string;
  currentValue: number;
  historicalAvg: number;
  deviationPercent: number;
  direction: "UP" | "DOWN";
  severity: "LOW" | "MEDIUM" | "HIGH";
  insight: string;
};

export type TrendAnalysis = {
  metric: string;
  direction: "GROWING" | "STABLE" | "DECLINING";
  weekOverWeek: number;
  monthOverMonth: number;
  insight: string;
};

export type SellerProfile = {
  userId: string;
  lifecycle: string;
  score: number;
  activeListings: number;
  totalRevenueCents: number;
  subscriptionPlan: string | null;
  addons: string[];
  joinedAt: string;
};

export type EnrichedCategoryInsight = {
  data: {
    category: string;
    internalCount: number;
    internalAvgPriceCents: number;
    externalDemand: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    externalTrend: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
    externalPriceRange: { minUsdCents: number; maxUsdCents: number } | null;
    seasonalNote: string | null;
    competitorDensity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    insight: string;
  };
  score: { source: string; confidence: number; reasoning: string; dataPoints: number; freshness: string };
};

export type EnrichedAnalyticsReport = {
  categories: EnrichedCategoryInsight[];
  regionalDemand: {
    data: { city: string; country: string; topDemandCategories: Array<{ category: string; demandLevel: string }>; marketSummary: string };
    score: { source: string; confidence: number; reasoning: string };
  } | null;
  overallConfidence: { source: string; confidence: number; reasoning: string };
  enrichedAt: string;
};

export const analyticsAi = {
  basic: () => request<BasicInsights>("/analytics/ai/basic"),
  deep: () => request<DeepInsights>("/analytics/ai/deep"),
  diagnostic: () => request<DiagnosticReport>("/analytics/ai/diagnostic"),
  memory: () => request<MemoryReport>("/analytics/ai/memory"),
  anomalies: () => request<AnomalyReport[]>("/analytics/ai/anomalies"),
  trends: () => request<TrendAnalysis[]>("/analytics/ai/trends"),
  sellerProfile: () => request<SellerProfile>("/analytics/ai/seller-profile"),
  enriched: (city?: string) => request<EnrichedAnalyticsReport>("/analytics/ai/enriched", { params: city ? { city } : undefined }),
  categoryDemand: (category: string, city?: string) =>
    request<EnrichedCategoryInsight>("/analytics/ai/category-demand", { params: { category, ...(city ? { city } : {}) } }),
};

// ── AI Recommendations (Smart Triggers) ──

export type AiRecommendation = {
  id: string;
  engineKey: string;
  userId: string;
  businessId: string | null;
  accountType: string;
  triggerType: string;
  title: string;
  message: string;
  actionType: string;
  actionTarget: string | null;
  actionData: Record<string, unknown> | null;
  priority: number;
  dismissed: boolean;
  clicked: boolean;
  accepted: boolean;
  displayedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AiTrial = {
  id: string;
  userId: string;
  businessId: string | null;
  accountType: string;
  planCode: string;
  sourceEngine: string;
  reason: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  convertedAt: string | null;
  createdAt: string;
};

export const aiRecommendations = {
  getActive: () => request<AiRecommendation[]>("/analytics/ai/recommendations"),
  dismiss: (id: string) => mutate<{ ok: boolean }>(`/analytics/ai/recommendations/${id}/dismiss`, { method: "POST" }, ["/analytics/ai/recommendations"]),
  click: (id: string) => mutate<{ ok: boolean }>(`/analytics/ai/recommendations/${id}/click`, { method: "POST" }, ["/analytics/ai/recommendations"]),
  accept: (id: string) => mutate<{ ok: boolean }>(`/analytics/ai/recommendations/${id}/accept`, { method: "POST" }, ["/analytics/ai/recommendations"]),
};

export const aiTrials = {
  getMyTrials: () => request<AiTrial[]>("/analytics/ai/trials"),
  activate: (id: string) => mutate<AiTrial>(`/analytics/ai/trials/${id}/activate`, { method: "POST" }, ["/analytics/ai/trials"]),
  decline: (id: string) => mutate<{ ok: boolean }>(`/analytics/ai/trials/${id}/decline`, { method: "POST" }, ["/analytics/ai/trials"]),
};

// ── Pricing Nudges ──

export type PricingNudge = {
  triggerType: string;
  priority: number;
  title: string;
  message: string;
  ctaLabel: string;
  ctaTarget: string;
  reason: string;
  metric?: Record<string, number | string>;
};

export const pricingNudges = {
  evaluate: () => request<PricingNudge[]>("/analytics/ai/pricing-nudges"),
};

// ── Commercial Advisor ──

export type CommercialRecommendation = {
  productType: "PLAN" | "ADDON" | "BOOST" | "ADS_PACK" | "ADS_PREMIUM" | "ANALYTICS";
  productCode: string;
  priority: number;
  confidence: number;
  title: string;
  message: string;
  rationale: string;
  ctaLabel: string;
  ctaTarget: string;
  pricing: string;
  signals: string[];
  metric: Record<string, number | string>;
};

export const commercialAdvisor = {
  getAdvice: () => request<CommercialRecommendation[]>("/analytics/ai/commercial-advice"),
};

// ── Post-Publish Advisor ──

export type AdviceCategory = "BOOST" | "ADS_PACK" | "ADS_PREMIUM" | "PLAN" | "ANALYTICS" | "CONTENT_TIP";

export type PostPublishAdvice = {
  category: AdviceCategory;
  priority: number;
  icon: string;
  title: string;
  message: string;
  rationale: string;
  ctaLabel: string;
  ctaTarget: string;
  ctaAction?: string;
  metric?: Record<string, number | string>;
  isLocked?: boolean;
  lockReason?: string | null;
  previewText?: string | null;
};

export type FreemiumMeta = {
  mode: "FULL" | "PREVIEW" | "LOCKED";
  listingType: string | null;
  visibleAdviceCount: number;
  blurredAdviceCount: number;
  usedProductFree: boolean;
  usedServiceFree: boolean;
  upgradeCtaTarget: string;
  upgradeCtaLabel: string;
};

export type PostPublishReport = {
  context: "SINGLE" | "PROMO" | "BULK";
  listingTitle?: string;
  qualityScore: number;
  qualitySignals: string[];
  advice: PostPublishAdvice[];
  sellerLifecycle: string;
  freemium?: FreemiumMeta;
};

export const postPublishAdvisor = {
  getAdvice: (params: { type: "SINGLE" | "PROMO" | "BULK"; listingId?: string; promoCount?: number }) => {
    const query = new URLSearchParams();
    query.set("type", params.type);
    if (params.listingId) query.set("listingId", params.listingId);
    if (params.promoCount) query.set("promoCount", String(params.promoCount));
    return request<PostPublishReport>(`/analytics/ai/post-publish-advice?${query.toString()}`);
  },
};

// ── Post-Sale Advisor ──

export type SaleAdviceCategory = "BOOST" | "ADS_CAMPAIGN" | "PLAN" | "ANALYTICS" | "STRATEGY" | "REPLICATE";

export type PostSaleAdvice = {
  category: SaleAdviceCategory;
  priority: number;
  icon: string;
  title: string;
  message: string;
  rationale: string;
  ctaLabel: string;
  ctaTarget: string;
  ctaAction?: string;
  metric?: Record<string, number | string>;
};

export type PostSaleReport = {
  scenario: string;
  orderId: string;
  orderTotal: string;
  itemTitle: string;
  itemCategory: string;
  saleNumber: number;
  congratsMessage: string;
  advice: PostSaleAdvice[];
  sellerLifecycle: string;
};

export const postSaleAdvisor = {
  getAdvice: (orderId: string) =>
    request<PostSaleReport>(`/analytics/ai/post-sale-advice?orderId=${encodeURIComponent(orderId)}`),
};

// ── Analytics CTA ──

export type AnalyticsTrigger =
  | "MULTI_LISTINGS"
  | "PROMO_ACTIVITY"
  | "SALES_HISTORY"
  | "PRICE_HESITATION"
  | "GROWING_BUSINESS"
  | "CATALOG_DIVERSITY"
  | "IRREGULAR_RESULTS"
  | "OPTIMIZATION_INTENT";

export type AnalyticsCTA = {
  trigger: AnalyticsTrigger;
  tier: "MEDIUM" | "PREMIUM";
  priority: number;
  icon: string;
  title: string;
  subtitle: string;
  message: string;
  whyNow: string;
  valuePills: string[];
  ctaLabel: string;
  ctaTarget: string;
  planName: string;
  planPrice: string;
  metric?: Record<string, number | string>;
};

export type AnalyticsCTAReport = {
  ctas: AnalyticsCTA[];
  hasAnalytics: boolean;
  currentTier: "NONE" | "MEDIUM" | "PREMIUM";
  suggestedUpgrade: "MEDIUM" | "PREMIUM" | null;
};

export const analyticsCTA = {
  evaluate: () => request<AnalyticsCTAReport>("/analytics/ai/analytics-cta"),
};

// ════════════════════════════════════════
// Direct Answers — Chantier C Phase 5/6
// Réponses droit au but unifiées (SELL + JOB)
// ════════════════════════════════════════

export type DirectAnswerSeverity = "INFO" | "WARN" | "CRITICAL";
export type DirectAnswerSource = "SELL" | "JOB" | "HYBRID";
export type DirectAnswerTier = "FREE" | "MEDIUM" | "PREMIUM";

export interface DirectAnswer {
  id: string;
  severity: DirectAnswerSeverity;
  pain: string;
  action: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  source: DirectAnswerSource;
  priority: number;
}

export interface DirectAnswerReport {
  tier: DirectAnswerTier;
  answers: DirectAnswer[];
  totalCandidates: number;
  cappedBy: "TIER" | "NONE";
}

export const directAnswers = {
  fetch: () => request<DirectAnswerReport>("/analytics/direct-answers"),
};

// ════════════════════════════════════════
// Job Analytics — Chantier C Phase 3/7
// ════════════════════════════════════════

export type JobTier = "FREE" | "MEDIUM" | "PREMIUM";

export interface JobDemandZone {
  country: string;
  countryCode: string | null;
  city: string;
  category: string;
  openJobs: number;
  applicants: number;
  saturationIndex: number;
  avgSalaryUsd: number | null;
  topSkills: string[];
  trend7d: string | null;
  locked?: boolean;
}

export interface JobDemandMap {
  updatedAt: string;
  scope: "NATIONAL" | "CROSS_BORDER";
  tier: JobTier;
  zones: JobDemandZone[];
  hiddenCount: number;
}

export interface JobMarketSnapshot {
  tier: JobTier;
  asCandidate: {
    openJobsForMe: number;
    avgAlignmentScore: number | null;
    hotCategories: { category: string; jobs: number; alignment: number | null }[];
  };
  asRecruiter: {
    activeJobs: number;
    candidatePool: number;
    avgApplicationsPerJob: number;
    poolSaturation: "LOW" | "MEDIUM" | "HIGH";
  } | null;
}

export interface JobApplicationsInsights {
  totalApplications: number;
  byStatus: Record<string, number>;
  responseRate: number;
  avgResponseDelayHours: number | null;
  bestAlignmentCategory: string | null;
  frustrationSignal: "NONE" | "LOW_RESPONSE_RATE" | "STALE" | "LOW_ALIGNMENT";
  tier: JobTier;
}

export interface JobAlignmentResult {
  jobId: string;
  candidateUserId: string;
  scoreGlobal: number;
  breakdown?: {
    qualifications: number;
    experience: number;
    skills: number;
    geo: number;
    salary: number;
  };
  strengths: string[];
  gaps: string[];
  verdict: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  tier: JobTier;
}

export interface JobPostingInsights {
  jobId: string;
  title: string;
  views: number;
  applications: number;
  applicationRate: number;
  qualityDistribution: { weak: number; fair: number; strong: number };
  avgAlignment: number | null;
  recommendations: string[];
  tier: JobTier;
}

export const jobAnalytics = {
  demandMap: (params?: { category?: string; countries?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.countries) qs.set("countries", params.countries);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<JobDemandMap>(`/analytics/jobs/demand-map${q ? `?${q}` : ""}`);
  },
  marketSnapshot: () => request<JobMarketSnapshot>("/analytics/jobs/market-snapshot"),
  myApplicationsInsights: () => request<JobApplicationsInsights>("/analytics/jobs/my-applications-insights"),
  alignmentScore: (jobId: string, candidateUserId?: string) => {
    const qs = new URLSearchParams({ jobId });
    if (candidateUserId) qs.set("candidateUserId", candidateUserId);
    return request<JobAlignmentResult>(`/analytics/jobs/alignment-score?${qs.toString()}`);
  },
  postingInsights: (jobId: string) =>
    request<JobPostingInsights>(`/analytics/jobs/posting-insights?jobId=${encodeURIComponent(jobId)}`),
  directAnswers: () =>
    request<{ answers: JobDirectAnswer[] }>("/analytics/jobs/direct-answers"),
  regionalContext: (category: string, city: string, country: string) => {
    const qs = new URLSearchParams({ category, city, country });
    return request<RegionalJobContext>(`/analytics/jobs/regional-context?${qs.toString()}`);
  },
  regionalContextMulti: (categories: string[], city: string, country: string) => {
    const qs = new URLSearchParams({ categories: categories.join(","), city, country });
    return request<RegionalJobContext>(`/analytics/jobs/regional-context/multi?${qs.toString()}`);
  },
};

export interface JobDirectAnswer {
  severity: "INFO" | "WARN" | "CRITICAL";
  pain: string;
  action: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  source: "SELL" | "JOB" | "HYBRID";
  priority: number;
  rule?: string;
}

export interface RegionalJobSignal {
  category: string;
  city: string;
  country: string;
  salaryRange: { minUsd: number; maxUsd: number } | null;
  demandLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  trend: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
  saturation: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  topSkills: string[];
  crossBorderOpportunity: string | null;
  insight: string;
  sources: string[];
}

export interface ScoredJobInsight {
  data: RegionalJobSignal;
  confidence: {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH";
    sourceType: "EXTERNAL" | "INTERNAL" | "INFERRED" | "AI_ESTIMATE";
    explanation: string;
  };
}

export interface RegionalJobContext {
  signals: ScoredJobInsight[];
  summary: string;
  generatedAt: string;
  region: string;
}
