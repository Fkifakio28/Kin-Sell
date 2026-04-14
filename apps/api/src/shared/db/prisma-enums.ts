/**
 * Re-export Prisma enums via default import (CJS → ESM interop).
 *
 * Node.js ESM cannot reliably resolve named exports from the CJS
 * `@prisma/client` bundle.  Importing the default export and
 * destructuring works everywhere.
 *
 * Each enum is re-exported as both a VALUE (const) and a TYPE,
 * mirroring Prisma's own dual export pattern.
 */
import pkg from "@prisma/client";

// ── Helper type: extract enum member union from the enum object ──
type EnumValues<T> = T[keyof T];

// ── Runtime value exports ──
export const {
  AccountType,
  AuthProvider,
  SessionStatus,
  ListingStatus,
  PromotionStatus,
  PromotionDiffusion,
  PromotionType,
  CartStatus,
  OrderStatus,
  NegotiationStatus,
  NegotiationType,
  AddonCode,
  AddonStatus,
  BillingCycle,
  PaymentMethod,
  PaymentOrderStatus,
  SubscriptionScope,
  SubscriptionStatus,
  MomoStatus,
  RestrictionType,
  SanctionLevel,
  TrustLevel,
  VerificationStatus,
  VerificationPurpose,
  ContactSource,
  CountryCode,
} = pkg;

// ── Type exports (mirror Prisma's dual value+type pattern) ──
export type AccountType = EnumValues<typeof AccountType>;
export type AuthProvider = EnumValues<typeof AuthProvider>;
export type SessionStatus = EnumValues<typeof SessionStatus>;
export type ListingStatus = EnumValues<typeof ListingStatus>;
export type PromotionStatus = EnumValues<typeof PromotionStatus>;
export type PromotionDiffusion = EnumValues<typeof PromotionDiffusion>;
export type PromotionType = EnumValues<typeof PromotionType>;
export type CartStatus = EnumValues<typeof CartStatus>;
export type OrderStatus = EnumValues<typeof OrderStatus>;
export type NegotiationStatus = EnumValues<typeof NegotiationStatus>;
export type NegotiationType = EnumValues<typeof NegotiationType>;
export type AddonCode = EnumValues<typeof AddonCode>;
export type AddonStatus = EnumValues<typeof AddonStatus>;
export type BillingCycle = EnumValues<typeof BillingCycle>;
export type PaymentMethod = EnumValues<typeof PaymentMethod>;
export type PaymentOrderStatus = EnumValues<typeof PaymentOrderStatus>;
export type SubscriptionScope = EnumValues<typeof SubscriptionScope>;
export type SubscriptionStatus = EnumValues<typeof SubscriptionStatus>;
export type MomoStatus = EnumValues<typeof MomoStatus>;
export type RestrictionType = EnumValues<typeof RestrictionType>;
export type SanctionLevel = EnumValues<typeof SanctionLevel>;
export type TrustLevel = EnumValues<typeof TrustLevel>;
export type VerificationStatus = EnumValues<typeof VerificationStatus>;
export type VerificationPurpose = EnumValues<typeof VerificationPurpose>;
export type ContactSource = EnumValues<typeof ContactSource>;
export type CountryCode = EnumValues<typeof CountryCode>;
