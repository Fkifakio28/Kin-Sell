/**
 * Incentives service — Chantier D Phase D3
 *
 * Client pour les routes user-facing "Mes avantages IA" :
 *   GET  /incentives/me/grants
 *   GET  /incentives/me/coupons
 *   POST /incentives/me/grants/:id/convert
 */
import { request } from "../api-core";

export type GrantSummary = {
  grantId: string;
  kind: string;
  discountPercent: number | null;
  addonCode: string | null;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
  convertible: boolean;
};

export type CouponSummary = {
  couponId: string;
  code: string;
  kind: string;
  discountPercent: number | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "USED";
  expiresAt: string;
  usedCount: number;
  maxUses: number;
  maxUsesPerUser: number;
  createdAt: string;
  fromGrantId: string | null;
};

export type ConvertGrantResult = {
  grantId: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: string;
};

export const incentives = {
  myGrants: () =>
    request<{ grants: GrantSummary[] }>("/incentives/me/grants"),
  myCoupons: () =>
    request<{ coupons: CouponSummary[] }>("/incentives/me/coupons"),
  convertGrant: (grantId: string) =>
    request<ConvertGrantResult>(`/incentives/me/grants/${grantId}/convert`, {
      method: "POST",
      body: {},
    }),
};
