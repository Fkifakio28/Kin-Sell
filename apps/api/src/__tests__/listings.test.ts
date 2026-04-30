/**
 * Tests — listings.service.ts
 *
 * Création de listing, validations métier, rôles, stock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    businessAccount: { findFirst: vi.fn(), findMany: vi.fn() },
    listing: {
      findUnique: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    subscription: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("../shared/utils/media-storage.js", () => ({
  normalizeImageInput: vi.fn(async (url: string | undefined) => url ?? null),
  normalizeImageInputs: vi.fn(async (urls: string[] | undefined) => urls ?? []),
}));
vi.mock("../shared/geo/country-aliases.js", () => ({
  resolveCountryCode: vi.fn(() => "CD"),
  resolveCountryTerms: vi.fn(() => []),
  getSameRegionCountries: vi.fn(() => []),
}));
vi.mock("../shared/promo/promo-engine.js", () => ({
  resolvePromoStatus: vi.fn(() => null),
}));

// ── Import after mocks ─────────────────────────────────────

import * as listingsService from "../modules/listings/listings.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// createListing
// ════════════════════════════════════════════════════════════

describe("createListing()", () => {
  const basePayload = {
    type: "PRODUIT" as const,
    title: "iPhone 15 Pro",
    category: "electronique",
    city: "Kinshasa",
    latitude: -4.325,
    longitude: 15.322,
  };

  it("crée un listing pour un USER valide", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", role: "USER" });
    mockPrisma.listing.count.mockResolvedValue(0);
    mockPrisma.listing.create.mockResolvedValue({
      id: "lst-1",
      ...basePayload,
      ownerUserId: "u1",
      isPublished: true,
      priceUsdCents: 0,
    });

    const result = await listingsService.createListing("u1", basePayload);
    expect(result).toBeDefined();
    expect(result.id).toBe("lst-1");
  });

  it("refuse un utilisateur inexistant (404)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      listingsService.createListing("unknown", basePayload),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuse un rôle non autorisé (403)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin1", role: "ADMIN" });

    await expect(
      listingsService.createListing("admin1", basePayload),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse un BUSINESS sans businessAccount (400)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "biz1", role: "BUSINESS" });
    mockPrisma.businessAccount.findFirst.mockResolvedValue(null);

    await expect(
      listingsService.createListing("biz1", basePayload),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("crée un listing pour un BUSINESS avec businessAccount", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "biz2", role: "BUSINESS" });
    mockPrisma.businessAccount.findFirst.mockResolvedValue({ id: "ba-1", ownerUserId: "biz2" });
    mockPrisma.listing.count.mockResolvedValue(0);
    mockPrisma.listing.create.mockResolvedValue({
      id: "lst-2",
      ...basePayload,
      ownerUserId: "biz2",
      businessId: "ba-1",
      isPublished: true,
    });

    const result = await listingsService.createListing("biz2", basePayload);
    expect(result).toBeDefined();
  });
});
