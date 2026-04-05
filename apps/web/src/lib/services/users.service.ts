import { request, mutate } from "../api-core";
import type { LocationVisibility } from "./geo.service";

// ── Users ──
export type UpdateProfilePayload = {
  displayName?: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  bio?: string;
  domain?: string;
  qualification?: string;
  experience?: string;
  workHours?: string;
  countryCode?: string;
  region?: string;
  district?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  locationVisibility?: LocationVisibility;
};

export const users = {
  me: () => request<unknown>("/users/me"),
  updateMe: (body: UpdateProfilePayload) =>
    mutate<unknown>("/users/me", { method: "PATCH", body }, ["/users/me", "/account/me"]),
  publicProfile: (username: string) => request<unknown>(`/users/public/${encodeURIComponent(username)}`),
  publicProfileById: (id: string) => request<unknown>(`/users/${encodeURIComponent(id)}/public`),
  report: (body: { reportedUserId: string; reason: string; message?: string }) =>
    request<{ id: string; status: string }>("/users/report", { method: "POST", body }),
};

// ── Reviews ──
export type ReviewItem = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number;
  text: string | null;
  verified: boolean;
  orderId: string | null;
  createdAt: string;
};

export type PendingReviewOrder = {
  orderId: string;
  targetId: string;
  targetName: string;
  targetAvatar: string | null;
  itemSummary: string;
  totalUsdCents: number;
  deliveredAt: string | null;
};

export const reviews = {
  forUser: (userId: string) =>
    request<{ reviews: ReviewItem[]; averageRating: number; totalCount: number }>(
      `/reviews/${encodeURIComponent(userId)}`
    ),
  create: (body: { targetId: string; rating: number; text?: string }) =>
    mutate<unknown>("/reviews", { method: "POST", body }, ["/reviews"]),
  createForOrder: (body: { orderId: string; rating: number; text?: string }) =>
    mutate<unknown>("/reviews/order", { method: "POST", body }, ["/reviews"]),
  checkOrder: (orderId: string) =>
    request<{ canReview: boolean; alreadyReviewed?: boolean; targetId?: string }>(
      `/reviews/check/${encodeURIComponent(orderId)}`
    ),
  pending: () =>
    request<PendingReviewOrder[]>("/reviews/pending"),
};
