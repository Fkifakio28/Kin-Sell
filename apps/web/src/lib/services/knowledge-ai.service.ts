import { request } from "../api-core";

// ── Types ───────────────────────────────────────────────

export type KnowledgeGoal = "SELL" | "BUY" | "HIRE" | "WORK";

export type KnowledgeCountry = "CD" | "GA" | "CG" | "AO" | "CI" | "GN" | "SN" | "MA";

export type KnowledgeIntent = {
  id: string;
  userId: string;
  goals: KnowledgeGoal[];
  categories: string[];
  keywords: string[];
  countriesInterest: KnowledgeCountry[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemandZone = {
  countryCode: KnowledgeCountry;
  city: string | null;
  totalListings: number;
  totalViews: number;
  totalNegotiations: number;
  demandScore: number;
  demandLevel: "LOW" | "MEDIUM" | "HIGH";
};

export type WorkforceZone = {
  countryCode: KnowledgeCountry;
  city: string | null;
  providersCount: number;
  totalListings: number;
  totalViews: number;
  averagePriceUsdCents: number | null;
};

export type KnowledgeRecommendation = {
  id: string;
  goal: KnowledgeGoal;
  category: string | null;
  title: string;
  message: string;
  topZones: Array<{ countryCode: KnowledgeCountry; city: string | null; score: number; level?: string }>;
  kind: "DEMAND" | "WORKFORCE";
};

// ── API calls ───────────────────────────────────────────

export const knowledgeAi = {
  getIntent: () => request<{ intent: KnowledgeIntent | null }>("/knowledge-ai/intent"),

  saveIntent: (payload: Partial<Omit<KnowledgeIntent, "id" | "userId" | "createdAt" | "updatedAt">>) =>
    request<{ intent: KnowledgeIntent }>("/knowledge-ai/intent", {
      method: "PUT",
      body: payload,
    }),

  deleteIntent: () =>
    request<{ ok: boolean }>("/knowledge-ai/intent", { method: "DELETE" }),

  getAccess: () => request<{ hasAccess: boolean }>("/knowledge-ai/access"),

  getRecommendations: () =>
    request<{ recommendations: KnowledgeRecommendation[] }>("/knowledge-ai/recommendations"),

  getDemandMap: (params: { category?: string; countries?: KnowledgeCountry[]; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.category) q.set("category", params.category);
    if (params.countries?.length) q.set("countries", params.countries.join(","));
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ zones: DemandZone[] }>(`/knowledge-ai/demand-map${qs ? `?${qs}` : ""}`);
  },

  getWorkforceMap: (params: { category?: string; countries?: KnowledgeCountry[]; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.category) q.set("category", params.category);
    if (params.countries?.length) q.set("countries", params.countries.join(","));
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ zones: WorkforceZone[] }>(`/knowledge-ai/workforce-map${qs ? `?${qs}` : ""}`);
  },
};

export const KNOWLEDGE_GOAL_LABELS: Record<KnowledgeGoal, { label: string; icon: string; desc: string }> = {
  SELL: { label: "Vendre", icon: "💰", desc: "Je veux vendre des produits ou services" },
  BUY: { label: "Acheter", icon: "🛒", desc: "Je recherche des produits à acheter" },
  HIRE: { label: "Recruter", icon: "👔", desc: "Je cherche de la main-d'œuvre / prestataires" },
  WORK: { label: "Travailler", icon: "🧑‍🔧", desc: "Je propose mes services / compétences" },
};

export const KNOWLEDGE_COUNTRY_LABELS: Record<KnowledgeCountry, { name: string; flag: string }> = {
  CD: { name: "RD Congo", flag: "🇨🇩" },
  CG: { name: "Congo", flag: "🇨🇬" },
  GA: { name: "Gabon", flag: "🇬🇦" },
  AO: { name: "Angola", flag: "🇦🇴" },
  CI: { name: "Côte d'Ivoire", flag: "🇨🇮" },
  GN: { name: "Guinée", flag: "🇬🇳" },
  SN: { name: "Sénégal", flag: "🇸🇳" },
  MA: { name: "Maroc", flag: "🇲🇦" },
};

export const KNOWLEDGE_COUNTRIES: KnowledgeCountry[] = ["CD", "CG", "GA", "AO", "CI", "GN", "SN", "MA"];
