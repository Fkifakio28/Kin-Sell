import { request, mutate } from "../api-core";

// ═══════════════════════════════════════════════════════════════
// Boost API (Phase 4+5) — Campagnes unifiées Listing/Post/Profile/Shop
// ═══════════════════════════════════════════════════════════════

export type BoostTarget = "LISTING" | "POST" | "PROFILE" | "SHOP";
export type BoostScope = "LOCAL" | "NATIONAL" | "CROSS_BORDER";
export type BoostStatus = "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELED" | "EXHAUSTED";

export interface BoostCampaign {
  id: string;
  userId: string;
  target: BoostTarget;
  targetId: string;
  scope: BoostScope;
  targetCountries: string[];
  budgetUsdCents: number;
  budgetSpentUsdCents: number;
  durationDays: number;
  pricingMultiplier: number;
  status: BoostStatus;
  startsAt: string;
  expiresAt: string;
  estReachMin: number;
  estReachMax: number;
  estClicksMin: number;
  estClicksMax: number;
  totalImpressions: number;
  totalClicks: number;
  totalContacts: number;
  totalDmOpens: number;
  totalSalesAttributed: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoostEstimate {
  dailyRateUsdCents: number;
  maxDaysByBudget: number;
  estReachMin: number;
  estReachMax: number;
  estClicksMin: number;
  estClicksMax: number;
  pricingMultiplier: number;
}

export interface WalletSnapshot {
  id: string;
  userId: string;
  balanceUsdCents: number;
  totalCreditedUsdCents: number;
  totalDebitedUsdCents: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: "CREDIT" | "DEBIT" | "REFUND" | "ADJUSTMENT";
  amountUsdCents: number;
  balanceAfterUsdCents: number;
  description: string | null;
  reference: string | null;
  campaignId: string | null;
  createdAt: string;
}

export interface AdminBoostKpi {
  activeCampaigns: number;
  expiredLast24h: number;
  totalBudgetCents: number;
  totalSpentCents: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  topAdvertisers: Array<{
    userId: string;
    spentCents: number;
    impressions: number;
    clicks: number;
  }>;
}

export const boostApi = {
  estimate: (scope: BoostScope, durationDays: number, budgetUsdCents: number) =>
    mutate<BoostEstimate>(
      "/boost/estimate",
      { method: "POST", body: { scope, durationDays, budgetUsdCents } },
      [],
    ),

  createCampaign: (input: {
    target: BoostTarget;
    targetId: string;
    scope: BoostScope;
    targetCountries?: string[];
    budgetUsdCents: number;
    durationDays: number;
  }) =>
    mutate<{ campaign: BoostCampaign }>(
      "/boost/campaigns",
      { method: "POST", body: input },
      ["/boost/campaigns", "/boost/wallet", "/sokin/posts", "/listings"],
    ),

  listMyCampaigns: (status?: BoostStatus) => {
    const q = status ? `?status=${status}` : "";
    return request<{ campaigns: BoostCampaign[] }>(`/boost/campaigns${q}`);
  },

  getCampaign: (id: string) =>
    request<{ campaign: BoostCampaign }>(`/boost/campaigns/${encodeURIComponent(id)}`),

  pause: (id: string) =>
    mutate<{ campaign: BoostCampaign }>(
      `/boost/campaigns/${encodeURIComponent(id)}/pause`,
      { method: "POST" },
      ["/boost/campaigns"],
    ),

  resume: (id: string) =>
    mutate<{ campaign: BoostCampaign }>(
      `/boost/campaigns/${encodeURIComponent(id)}/resume`,
      { method: "POST" },
      ["/boost/campaigns"],
    ),

  cancel: (id: string) =>
    mutate<{ campaign: BoostCampaign; refundedUsdCents: number }>(
      `/boost/campaigns/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
      ["/boost/campaigns", "/boost/wallet"],
    ),

  trackEvent: (campaignId: string, event: "impression" | "click" | "contact" | "dmOpen" | "saleAttributed") =>
    mutate<{ ok: boolean }>(
      `/boost/campaigns/${encodeURIComponent(campaignId)}/event`,
      { method: "POST", body: { event } },
      [],
    ),

  // Wallet
  getWallet: () => request<{ wallet: WalletSnapshot }>("/boost/wallet"),

  listWalletTransactions: (cursor?: string, limit = 20) => {
    const q = new URLSearchParams();
    if (cursor) q.set("cursor", cursor);
    q.set("limit", String(limit));
    return request<{ items: WalletTransaction[]; nextCursor: string | null }>(
      `/boost/wallet/transactions?${q.toString()}`,
    );
  },

  // Admin
  getAdminKpi: () => request<AdminBoostKpi>("/boost/admin/kpi"),

  adminCredit: (userId: string, amountUsdCents: number, description?: string, reference?: string) =>
    mutate<{ wallet: WalletSnapshot }>(
      "/boost/wallet/credit",
      { method: "POST", body: { userId, amountUsdCents, description, reference } },
      [],
    ),
};
