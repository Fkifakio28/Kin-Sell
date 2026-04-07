import { request } from "../api-core";

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
  getBanner: (page: string, options?: { excludeAdId?: string; slotKey?: string }) => {
    const query = new URLSearchParams();
    query.set('page', page);
    if (options?.excludeAdId) query.set('excludeAdId', options.excludeAdId);
    if (options?.slotKey) query.set('slotKey', options.slotKey);
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
