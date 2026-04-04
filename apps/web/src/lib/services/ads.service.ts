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
  getBanner: (page: string) =>
    request<{ ad: AdvertisementItem | null }>(`/ads/banner?page=${encodeURIComponent(page)}`),
  recordImpression: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/impression`, { method: 'POST' }),
  recordClick: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/click`, { method: 'POST' }),
};
