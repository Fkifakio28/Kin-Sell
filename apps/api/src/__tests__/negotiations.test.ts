/**
 * Tests — negotiations.service.ts
 *
 * Création de négociation, protection self-trade, validations,
 * TTL, déduplication.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    listing: { findUnique: vi.fn() },
    negotiation: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    categoryNegotiationRule: { findUnique: vi.fn() },
    cart: { findFirst: vi.fn(), create: vi.fn() },
    cartItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    businessAccount: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("../modules/notifications/push.service.js", () => ({
  sendPushToUser: vi.fn(),
}));
vi.mock("../modules/messaging/socket.js", () => ({
  emitToUsers: vi.fn(),
  emitToUser: vi.fn(),
  isUserOnline: vi.fn(() => false),
}));

// ── Import after mocks ─────────────────────────────────────

import * as negotiationsService from "../modules/negotiations/negotiations.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// createNegotiation
// ════════════════════════════════════════════════════════════

describe("createNegotiation()", () => {
  const listingData = {
    id: "lst-1",
    ownerUserId: "seller-1",
    isPublished: true,
    priceUsdCents: 10000,
    isNegotiable: true,
    category: "electronique",
  };

  it("rejette un article introuvable (404)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(null);

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "nonexistent",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette un article non publié (404)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ ...listingData, isPublished: false });

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette un article non négociable (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ ...listingData, isNegotiable: false });

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("empêche le vendeur de négocier son propre article (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(listingData);
    mockPrisma.categoryNegotiationRule.findUnique.mockResolvedValue(null);

    await expect(
      negotiationsService.createNegotiation("seller-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("propre article") });
  });

  it("rejette un prix proposé <= 0 (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(listingData);
    mockPrisma.categoryNegotiationRule.findUnique.mockResolvedValue(null);

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 0,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("détecte une négociation en doublon (409)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(listingData);
    mockPrisma.categoryNegotiationRule.findUnique.mockResolvedValue(null);
    mockPrisma.negotiation.findFirst.mockResolvedValue({ id: "neg-existing", status: "PENDING" });

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejette si la catégorie est verrouillée par admin (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(listingData);
    mockPrisma.categoryNegotiationRule.findUnique.mockResolvedValue({
      category: "electronique",
      negotiationLocked: true,
    });

    await expect(
      negotiationsService.createNegotiation("buyer-1", {
        listingId: "lst-1",
        proposedPriceUsdCents: 8000,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("catégorie") });
  });
});
