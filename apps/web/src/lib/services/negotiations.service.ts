import { request, invalidateCache } from "../api-core";

export type NegotiationStatus = "PENDING" | "ACCEPTED" | "REFUSED" | "EXPIRED" | "COUNTERED";

export type NegotiationOfferSummary = {
  id: string;
  fromUserId: string;
  priceUsdCents: number;
  quantity: number;
  message: string | null;
  createdAt: string;
  fromDisplayName: string;
};

export type NegotiationSummary = {
  id: string;
  buyerUserId: string;
  sellerUserId: string;
  listingId: string;
  type: "SIMPLE" | "QUANTITY" | "GROUPED";
  status: NegotiationStatus;
  originalPriceUsdCents: number;
  finalPriceUsdCents: number | null;
  quantity: number;
  groupId: string | null;
  minBuyers: number | null;
  groupCurrentBuyers: number | null;
  bundleId: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
  buyer: { userId: string; displayName: string };
  seller: { userId: string; displayName: string };
  offers: NegotiationOfferSummary[];
};

export type GroupNegotiationSummary = {
  groupId: string;
  listingId: string;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
  minBuyers: number;
  currentBuyers: number;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
};

export type GroupDetailSummary = {
  groupId: string;
  listingId: string;
  minBuyers: number;
  currentBuyers: number;
  expiresAt: string;
  status: NegotiationStatus;
  participants: NegotiationSummary[];
};

export type BundleItemSummary = {
  listingId: string;
  quantity: number;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
};

export type BundleNegotiationResult = NegotiationSummary & {
  bundle: {
    id: string;
    totalOriginalUsdCents: number;
    items: BundleItemSummary[];
  };
};

export type BundleDetailSummary = {
  id: string;
  totalOriginalUsdCents: number;
  createdAt: string;
  creator: string;
  seller: string;
  items: BundleItemSummary[];
  negotiations: NegotiationSummary[];
};

export const negotiations = {
  create: async (body: { listingId: string; proposedPriceUsdCents: number; quantity?: number; message?: string; type?: "SIMPLE" | "QUANTITY" | "GROUPED"; minBuyers?: number }) => {
    const result = await request<NegotiationSummary>("/negotiations", { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  buyerList: (params?: { page?: number; limit?: number; status?: NegotiationStatus }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; negotiations: NegotiationSummary[] }>("/negotiations/buyer", { params }),

  sellerList: (params?: { page?: number; limit?: number; status?: NegotiationStatus }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; negotiations: NegotiationSummary[] }>("/negotiations/seller", { params }),

  detail: (negotiationId: string) =>
    request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}`),

  respond: async (negotiationId: string, body: { action: "ACCEPT" | "REFUSE" | "COUNTER"; counterPriceUsdCents?: number; message?: string }) => {
    const result = await request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}/respond`, { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  cancel: async (negotiationId: string) => {
    const result = await request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}`, { method: "DELETE" });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  listOpenGroups: (params?: { listingId?: string; page?: number; limit?: number }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; groups: GroupNegotiationSummary[] }>("/negotiations/groups", { params }),

  groupDetails: (groupId: string) =>
    request<GroupDetailSummary>(`/negotiations/groups/${encodeURIComponent(groupId)}`),

  joinGroup: async (groupId: string, body: { proposedPriceUsdCents: number; quantity?: number; message?: string }) => {
    const result = await request<NegotiationSummary>(`/negotiations/groups/${encodeURIComponent(groupId)}/join`, { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  createBundle: async (body: { items: { listingId: string; quantity: number }[]; proposedTotalUsdCents: number; message?: string; type?: "SIMPLE" | "QUANTITY" | "GROUPED"; minBuyers?: number }) => {
    const result = await request<BundleNegotiationResult>("/negotiations/bundle", { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  bundleDetails: (bundleId: string) =>
    request<BundleDetailSummary>(`/negotiations/bundle/${encodeURIComponent(bundleId)}`),
};
