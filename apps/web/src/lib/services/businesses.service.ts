import { request } from "../api-core";

export type BusinessAccount = {
  id: string;
  ownerUserId: string;
  legalName: string;
  publicName: string;
  description: string | null;
  slug: string;
  createdAt: string;
  updatedAt: string;
  shop: {
    id: string;
    businessId: string;
    city: string | null;
    address: string | null;
    coverImage: string | null;
    logo: string | null;
    publicDescription: string | null;
    active: boolean;
  } | null;
};

export const businesses = {
  create: (body: { legalName: string; publicName: string; description?: string; city: string }) =>
    request<BusinessAccount>("/business-accounts", { method: "POST", body }),
  me: () => request<BusinessAccount>("/business-accounts/me"),
  updateMe: (body: Record<string, unknown>) =>
    request<BusinessAccount>("/business-accounts/me", { method: "PATCH", body }),
  getBySlug: (slug: string) =>
    request<BusinessAccount & { listings: unknown[]; _count: { sellerOrders: number } }>(
      `/business-accounts/${encodeURIComponent(slug)}`
    ),
  follow: (businessId: string) =>
    request<{ following: boolean; followersCount: number }>(
      `/business-accounts/${encodeURIComponent(businessId)}/follow`,
      { method: "POST" }
    ),
  unfollow: (businessId: string) =>
    request<{ following: boolean; followersCount: number }>(
      `/business-accounts/${encodeURIComponent(businessId)}/follow`,
      { method: "DELETE" }
    ),
  isFollowing: (businessId: string) =>
    request<{ following: boolean }>(
      `/business-accounts/${encodeURIComponent(businessId)}/follow`
    ),
  followersCount: (businessId: string) =>
    request<{ followersCount: number }>(
      `/business-accounts/${encodeURIComponent(businessId)}/followers-count`
    ),
};
