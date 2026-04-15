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
    negotiation: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    negotiationBundleItem: { findMany: vi.fn() },
    categoryNegotiationRule: { findUnique: vi.fn() },
    cart: { findFirst: vi.fn(), create: vi.fn() },
    cartItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    order: { create: vi.fn() },
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

// ════════════════════════════════════════════════════════════
// respondToNegotiation — prix snapshot & atomicité
// ════════════════════════════════════════════════════════════

describe("respondToNegotiation() — prix snapshot", () => {
  const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const makeNego = (overrides: any = {}) => ({
    id: "neg-1",
    buyerUserId: "buyer-1",
    sellerUserId: "seller-1",
    listingId: "lst-1",
    type: "SIMPLE",
    status: "PENDING",
    originalPriceUsdCents: 1500,
    finalPriceUsdCents: null,
    quantity: 1,
    bundleId: null,
    groupId: null,
    minBuyers: null,
    expiresAt: futureDate,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    offers: [{ id: "o-1", fromUserId: "buyer-1", priceUsdCents: 1400, quantity: 1, message: null, createdAt: new Date() }],
    ...overrides,
  });

  const makeUpdated = (overrides: any = {}) => ({
    ...makeNego(overrides),
    status: overrides.status ?? "ACCEPTED",
    finalPriceUsdCents: overrides.finalPriceUsdCents ?? 1400,
    resolvedAt: new Date(),
    listing: { id: "lst-1", type: "PRODUCT", title: "Test", category: "electronique", city: "Kinshasa", imageUrl: null, priceUsdCents: 1500 },
    buyer: { id: "buyer-1", profile: { displayName: "Acheteur" } },
    seller: { id: "seller-1", profile: { displayName: "Vendeur" } },
    offers: [{ id: "o-1", fromUserId: "buyer-1", priceUsdCents: overrides.offerPrice ?? 1400, quantity: 1, message: null, createdAt: new Date(), fromUser: { profile: { displayName: "Acheteur" } } }],
  });

  const singleCartItem = {
    id: "ci-1",
    cart: { id: "cart-1" },
    listing: { id: "lst-1", title: "Test", type: "PRODUCT", category: "electronique", city: "Kinshasa", ownerUserId: "seller-1", businessId: null },
  };

  // ── 1. ACCEPT single non-promo → commande au prix négocié ──
  it("ACCEPT single non-promo — commande à 1400 (pas 1500 catalogue)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.negotiation.findFirst.mockResolvedValue(makeNego());
    mockPrisma.negotiation.update.mockResolvedValue(makeUpdated());
    mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.cartItem.findFirst.mockResolvedValue(singleCartItem);
    mockPrisma.order.create.mockResolvedValue({ id: "order-1" });
    mockPrisma.cartItem.delete.mockResolvedValue({});

    await negotiationsService.respondToNegotiation("seller-1", "neg-1", { action: "ACCEPT" });

    expect(mockPrisma.negotiation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finalPriceUsdCents: 1400 }) })
    );
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalUsdCents: 1400 }) })
    );
  });

  // ── 2. ACCEPT single promo → le snapshot original est 1200, offre 1100 ──
  it("ACCEPT single promo — commande à 1100 (prix négocié, snapshot 1200)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.negotiation.findFirst.mockResolvedValue(
      makeNego({ originalPriceUsdCents: 1200, offers: [{ id: "o-1", fromUserId: "buyer-1", priceUsdCents: 1100, quantity: 1, message: null, createdAt: new Date() }] })
    );
    mockPrisma.negotiation.update.mockResolvedValue(makeUpdated({ finalPriceUsdCents: 1100, offerPrice: 1100 }));
    mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.cartItem.findFirst.mockResolvedValue(singleCartItem);
    mockPrisma.order.create.mockResolvedValue({ id: "order-2" });
    mockPrisma.cartItem.delete.mockResolvedValue({});

    await negotiationsService.respondToNegotiation("seller-1", "neg-1", { action: "ACCEPT" });

    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalUsdCents: 1100 }) })
    );
  });

  // ── 3. REFUSE single promo → restaure au snapshot 1200, pas à 1500 catalogue ──
  it("REFUSE single promo — restaure unitPrice à 1200 (snapshot, pas catalogue)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.negotiation.findFirst.mockResolvedValue(
      makeNego({ originalPriceUsdCents: 1200, offers: [{ id: "o-1", fromUserId: "buyer-1", priceUsdCents: 1100, quantity: 1, message: null, createdAt: new Date() }] })
    );
    mockPrisma.negotiation.update.mockResolvedValue(makeUpdated({ status: "REFUSED", finalPriceUsdCents: null }));
    mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });

    await negotiationsService.respondToNegotiation("seller-1", "neg-1", { action: "REFUSE" });

    expect(mockPrisma.cartItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unitPriceUsdCents: 1200 } })
    );
  });

  // ── 4. ACCEPT bundle — allocation proportionnelle sur snapshots ──
  it("ACCEPT bundle — allocation basée sur snapshots (pas prix catalogue actuels)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.negotiation.findFirst.mockResolvedValue(
      makeNego({ bundleId: "bundle-1", originalPriceUsdCents: 3000, offers: [{ id: "o-1", fromUserId: "buyer-1", priceUsdCents: 2500, quantity: 1, message: null, createdAt: new Date() }] })
    );
    mockPrisma.negotiation.update.mockResolvedValue(makeUpdated({ bundleId: "bundle-1", finalPriceUsdCents: 2500, offerPrice: 2500 }));
    // Snapshots: A=1000, B=2000 → ratio 1:2
    mockPrisma.negotiationBundleItem.findMany.mockResolvedValue([
      { listingId: "lst-a", quantity: 1, snapshotPriceUsdCents: 1000 },
      { listingId: "lst-b", quantity: 1, snapshotPriceUsdCents: 2000 },
    ]);
    mockPrisma.cartItem.findMany.mockResolvedValue([
      { id: "ci-a", listingId: "lst-a", quantity: 1, cart: { id: "c1" }, listing: { id: "lst-a", title: "A", type: "PRODUCT", category: "electronique", city: "Kinshasa", ownerUserId: "seller-1", businessId: null, priceUsdCents: 1500 } },
      { id: "ci-b", listingId: "lst-b", quantity: 1, cart: { id: "c1" }, listing: { id: "lst-b", title: "B", type: "PRODUCT", category: "mode", city: "Kinshasa", ownerUserId: "seller-1", businessId: null, priceUsdCents: 2500 } },
    ]);
    mockPrisma.cartItem.update.mockResolvedValue({});
    mockPrisma.order.create.mockResolvedValue({ id: "order-bundle" });
    mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 2 });

    await negotiationsService.respondToNegotiation("seller-1", "neg-1", { action: "ACCEPT" });

    // Total commande = 2500
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalUsdCents: 2500 }) })
    );
    // Ratio snapshots 1000:2000 → A = round(2500*1000/3000)=833, B = 2500-833=1667
    const updateCalls = mockPrisma.cartItem.update.mock.calls;
    expect(updateCalls[0][0].data.unitPriceUsdCents).toBe(833);
    expect(updateCalls[1][0].data.unitPriceUsdCents).toBe(1667);
  });

  // ── 5. EXPIRED bundle → restaure les snapshots par item ──
  it("expireStaleNegotiations bundle — restaure les snapshots (pas catalogue)", async () => {
    mockPrisma.negotiation.findMany.mockResolvedValue([
      { id: "neg-exp", originalPriceUsdCents: 3000, buyerUserId: "buyer-1", sellerUserId: "seller-1", bundleId: "bundle-exp" },
    ]);
    mockPrisma.negotiation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.negotiationBundleItem.findMany.mockResolvedValue([
      { listingId: "lst-a", snapshotPriceUsdCents: 1000 },
      { listingId: "lst-b", snapshotPriceUsdCents: 2000 },
    ]);
    mockPrisma.cartItem.findMany.mockResolvedValue([
      { id: "ci-a", listingId: "lst-a" },
      { id: "ci-b", listingId: "lst-b" },
    ]);
    mockPrisma.cartItem.update.mockResolvedValue({});

    const result = await negotiationsService.expireStaleNegotiations();

    expect(result.expired).toBe(1);
    const updateCalls = mockPrisma.cartItem.update.mock.calls;
    expect(updateCalls[0][0].data).toEqual({ negotiationId: null, unitPriceUsdCents: 1000 });
    expect(updateCalls[1][0].data).toEqual({ negotiationId: null, unitPriceUsdCents: 2000 });
  });

  // ── 6. ACCEPT — échec order.create → transaction rollback, pas de catch silencieux ──
  it("ACCEPT single — échec DB propage erreur (pas de catch silencieux)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.negotiation.findFirst.mockResolvedValue(makeNego());
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("DB write failure"));

    await expect(
      negotiationsService.respondToNegotiation("seller-1", "neg-1", { action: "ACCEPT" })
    ).rejects.toThrow("DB write failure");
  });
});
