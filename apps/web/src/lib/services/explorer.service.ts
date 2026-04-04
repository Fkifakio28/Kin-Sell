import { request } from "../api-core";

export type ExplorerShopApi = {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  badge: string;
  city: string;
  coverImage: string | null;
  logo: string | null;
  publicDescription: string | null;
  active: boolean;
};

export type ExplorerProfileApi = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string;
  badge: string;
};

export const explorer = {
  stats: () => request<{ categories: number; publicProfiles: number; onlineShops: number }>("/explorer/stats"),
  ads: (params?: { city?: string; country?: string }) =>
    request<unknown>("/explorer/ads", { params }),
  shops: (params?: { limit?: number; city?: string; country?: string }) =>
    request<ExplorerShopApi[]>("/explorer/shops", {
      params: {
        limit: params?.limit ?? 4,
        city: params?.city,
        country: params?.country,
      },
    }),
  profiles: (params?: { limit?: number; city?: string; country?: string }) =>
    request<ExplorerProfileApi[]>("/explorer/profiles", {
      params: {
        limit: params?.limit ?? 4,
        city: params?.city,
        country: params?.country,
      },
    }),
};
