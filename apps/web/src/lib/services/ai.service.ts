import { request } from "../api-core";

// ── IA Marchand (Negotiation AI) ──

export type BuyerNegotiationHint = {
  suggestedPrice: number;
  successRate: number;
  marketContext: { avgPriceCents: number; medianPriceCents: number; totalListings: number };
  messageSuggestion: string;
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

// ── IA Commande (Order AI) ──

export type CheckoutAdvice = {
  bundles: Array<{ title: string; discount: number; savingsCents: number }>;
  urgency: { active: boolean; message: string } | null;
  shippingEstimate: { minDays: number; maxDays: number; city: string } | null;
  tips: string[];
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

export const analyticsAi = {
  basic: () => request<BasicInsights>("/analytics/ai/basic"),
  deep: () => request<DeepInsights>("/analytics/ai/deep"),
  diagnostic: () => request<DiagnosticReport>("/analytics/ai/diagnostic"),
  memory: () => request<MemoryReport>("/analytics/ai/memory"),
};
