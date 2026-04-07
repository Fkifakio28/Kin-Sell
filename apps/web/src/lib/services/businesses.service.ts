import { request, mutate } from "../api-core";

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
    highlights?: { id: string; icon: string; name: string; description: string }[] | null;
    shopPhotos?: string[];
  } | null;
};

export const businesses = {
  create: (body: { legalName: string; publicName: string; description?: string; city: string }) =>
    mutate<BusinessAccount>("/business-accounts", { method: "POST", body }, ["/business-accounts"]),
  me: () => request<BusinessAccount>("/business-accounts/me"),
  updateMe: (body: Record<string, unknown>) =>
    mutate<BusinessAccount>("/business-accounts/me", { method: "PATCH", body }, ["/business-accounts"]),
  getBySlug: (slug: string) =>
    request<BusinessAccount & { listings: unknown[]; _count: { sellerOrders: number } }>(
      `/business-accounts/${encodeURIComponent(slug)}`
    ),
  follow: (businessId: string) =>
    mutate<{ following: boolean; followersCount: number }>(
      `/business-accounts/${encodeURIComponent(businessId)}/follow`,
      { method: "POST" }, [`/business-accounts/${encodeURIComponent(businessId)}`]
    ),
  unfollow: (businessId: string) =>
    mutate<{ following: boolean; followersCount: number }>(
      `/business-accounts/${encodeURIComponent(businessId)}/follow`,
      { method: "DELETE" }, [`/business-accounts/${encodeURIComponent(businessId)}`]
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
