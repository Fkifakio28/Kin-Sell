import { request } from "../api-core";

export type SearchParams = {
  q?: string; type?: string; city?: string; country?: string;
  latitude?: number; longitude?: number; radiusKm?: number; limit?: number;
};

export type ListingStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DELETED";

export type MyListing = {
  id: string;
  type: string;
  status: ListingStatus;
  title: string;
  description: string | null;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  mediaUrls: string[];
  priceUsdCents: number;
  stockQuantity: number | null;
  serviceDurationMin: number | null;
  serviceLocation: string | null;
  isPublished: boolean;
  isNegotiable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MyListingsResponse = {
  total: number;
  page: number;
  totalPages: number;
  listings: MyListing[];
};

export type MyListingsStats = {
  active: number;
  inactive: number;
  archived: number;
  deleted: number;
  total: number;
};

export type PublicListing = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  category: string;
  city: string;
  imageUrl: string | null;
  priceUsdCents: number;
  isNegotiable: boolean;
  createdAt: string;
  owner: {
    userId: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
};

export type ListingSearchResponse = {
  location: {
    latitude?: number;
    longitude?: number;
    radiusKm: number;
  } | null;
  total: number;
  results: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    category: string;
    city: string;
    latitude: number;
    longitude: number;
    imageUrl: string | null;
    priceUsdCents: number;
    isNegotiable: boolean;
    createdAt: string;
    distanceKm: number | null;
    owner: {
      userId: string;
      displayName: string;
      username: string | null;
      avatarUrl: string | null;
      businessPublicName?: string | null;
    };
  }>;
};

export const listings = {
  search: (params: SearchParams) =>
    request<ListingSearchResponse>("/listings/search", { params: params as Record<string, string | number | undefined> }),
  create: (body: Record<string, unknown>) =>
    request<MyListing>("/listings", { method: "POST", body }),
  latest: (params?: { type?: string; city?: string; country?: string; limit?: number }) =>
    request<PublicListing[]>("/listings/latest", { params: params as Record<string, string | number | undefined> }),
  mine: (params?: { status?: ListingStatus; type?: string; page?: number; limit?: number }) =>
    request<MyListingsResponse>("/listings/mine", { params: params as Record<string, string | number | undefined> }),
  mineStats: () =>
    request<MyListingsStats>("/listings/mine/stats"),
  mineDetail: (id: string) =>
    request<MyListing>(`/listings/mine/${encodeURIComponent(id)}`),
  update: (id: string, body: Record<string, unknown>) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  changeStatus: (id: string, status: ListingStatus) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  updateStock: (id: string, stockQuantity: number | null) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}/stock`, { method: "PATCH", body: { stockQuantity } }),
  lockedCategories: () =>
    request<string[]>("/listings/locked-categories"),
  contactSeller: (listingId: string) =>
    request<{ conversationId: string; listingId: string; sellerUserId: string; message: string }>(
      `/listings/${encodeURIComponent(listingId)}/contact`, { method: "POST" }
    ),
};
