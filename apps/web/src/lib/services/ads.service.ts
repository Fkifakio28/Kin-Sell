import { request, mutate } from "../api-core";

export type AdvertisementItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  ctaText: string;
  type: string;
  status: string;
  targetPages: string[];
  impressions: number;
  clicks: number;
  priority: number;
};

export const adsApi = {
  getBanner: (page: string, options?: { excludeAdId?: string; slotKey?: string; city?: string; country?: string }) => {
    const query = new URLSearchParams();
    query.set('page', page);
    if (options?.excludeAdId) query.set('excludeAdId', options.excludeAdId);
    if (options?.slotKey) query.set('slotKey', options.slotKey);
    if (options?.city) query.set('city', options.city);
    if (options?.country) query.set('country', options.country);
    return request<{ ad: AdvertisementItem | null }>(`/ads/banner?${query.toString()}`);
  },
  recordImpression: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/impression`, { method: 'POST' }),
  recordClick: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/click`, { method: 'POST' }),
};

// ══════════════════════════════════════════════════════════════
// IA Ads — Smart Slot / Page / Campaign tracking
// ══════════════════════════════════════════════════════════════

export type AiAdSlotCreative = {
  id: string;
  title: string;
  contentText: string;
  subtitle: string | null;
  mediaType: string;
  mediaUrl: string | null;
  ctaLabel: string;
  ctaTarget: string;
  adType: string;
  tone: string | null;
  tags: string[];
};

export type AiAdSlotResponse = {
  campaignId: string;
  campaignName: string;
  objective: string;
  creative: AiAdSlotCreative;
  pageKey: string;
  componentKey: string;
  priority: number;
};

export const aiAdsSlot = {
  getForSlot: (pageKey: string, componentKey: string, opts?: { userRole?: string; userPlanCode?: string }) =>
    request<{ ad: AiAdSlotResponse | null }>(`/ads/ai-slot?pageKey=${encodeURIComponent(pageKey)}&componentKey=${encodeURIComponent(componentKey)}${opts?.userRole ? `&userRole=${encodeURIComponent(opts.userRole)}` : ''}${opts?.userPlanCode ? `&userPlanCode=${encodeURIComponent(opts.userPlanCode)}` : ''}`),
  getForPage: (pageKey: string, userRole?: string) =>
    request<{ ads: AiAdSlotResponse[] }>(`/ads/ai-page?pageKey=${encodeURIComponent(pageKey)}${userRole ? `&userRole=${encodeURIComponent(userRole)}` : ''}`),
  recordImpression: (campaignId: string) =>
    request<{ ok: boolean }>(`/ads/ai-campaign/${encodeURIComponent(campaignId)}/impression`, { method: 'POST' }),
  recordClick: (campaignId: string) =>
    request<{ ok: boolean }>(`/ads/ai-campaign/${encodeURIComponent(campaignId)}/click`, { method: 'POST' }),
  recordDismiss: (campaignId: string) =>
    request<{ ok: boolean }>(`/ads/ai-campaign/${encodeURIComponent(campaignId)}/dismiss`, { method: 'POST' }),
  recordConvert: (campaignId: string, type: 'subscription' | 'trial' | 'generic') =>
    request<{ ok: boolean }>(`/ads/ai-campaign/${encodeURIComponent(campaignId)}/convert`, { method: 'POST', body: { type } }),
};

// ══════════════════════════════════════════════════════════════
// IA ADS Kin-Sell — Boost & Mise en avant
// ══════════════════════════════════════════════════════════════

export type BoostProposal = {
  type: 'SINGLE_BOOST';
  listingId: string;
  listingTitle: string;
  message: string;
  benefits: string[];
  suggestedDurationDays: number;
  estimatedExtraViews: { min: number; max: number };
};

export type HighlightProposal = {
  type: 'PROFILE_HIGHLIGHT' | 'SHOP_HIGHLIGHT';
  targetId: string;
  targetName: string;
  message: string;
  benefits: string[];
  articleCount: number;
  suggestedDurationDays: number;
};

export const adsBoostApi = {
  getBoostProposal: (listingId: string) =>
    request<{ proposal: BoostProposal }>(`/ads/boost-proposal?listingId=${encodeURIComponent(listingId)}`),
  getHighlightProposal: (count: number) =>
    request<{ proposal: HighlightProposal }>(`/ads/highlight-proposal?count=${count}`),
  activateBoost: (listingId: string, durationDays?: number) =>
    mutate<{ listingId: string; isBoosted: boolean; boostExpiresAt: string | null }>('/ads/boost', { method: 'POST', body: { listingId, durationDays } }, []),
  activateHighlight: (durationDays?: number, businessId?: string) =>
    mutate<{ boostedCount: number; expiresAt: string }>('/ads/highlight', { method: 'POST', body: { durationDays, businessId } }, []),
};
