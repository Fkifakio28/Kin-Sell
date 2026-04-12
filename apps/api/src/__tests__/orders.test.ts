/**
 * Tests — orders.service.ts
 *
 * Flux critiques : panier (CRUD), checkout, validation de commande,
 * protection achat de ses propres articles, limites de quantité.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    cart: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    cartItem: {
      findUnique: vi.fn(), findFirst: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(),
    },
    listing: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    orderItem: { create: vi.fn(), createMany: vi.fn() },
    negotiation: { update: vi.fn() },
    businessAccount: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));

// ── Import after mocks ─────────────────────────────────────

import * as ordersService from "../modules/orders/orders.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// CART — addCartItem
// ════════════════════════════════════════════════════════════

describe("addCartItem()", () => {
  it("empêche d'ajouter son propre article (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-1",
      ownerUserId: "user-seller",
      isPublished: true,
      priceUsdCents: 5000,
      promoActive: false,
    });

    await expect(
      ordersService.addCartItem("user-seller", { listingId: "listing-1", quantity: 1 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("propre article"),
    });
  });

  it("rejette un article non publié (404)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-2",
      ownerUserId: "other-user",
      isPublished: false,
      priceUsdCents: 5000,
    });

    await expect(
      ordersService.addCartItem("buyer-1", { listingId: "listing-2", quantity: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette un article inexistant (404)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(null);

    await expect(
      ordersService.addCartItem("buyer-2", { listingId: "nonexistent", quantity: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("utilise le prix promo si actif", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-promo",
      ownerUserId: "seller-1",
      isPublished: true,
      priceUsdCents: 10000,
      promoActive: true,
      promoPriceUsdCents: 7500,
    });
    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-1" });
    mockPrisma.cartItem.findUnique.mockResolvedValue(null);
    mockPrisma.cartItem.create.mockResolvedValue({});
    // Mock getBuyerCart chain
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: "cart-1",
      status: "OPEN",
      currency: "USD",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    await ordersService.addCartItem("buyer-3", { listingId: "listing-promo", quantity: 1 });

    expect(mockPrisma.cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPriceUsdCents: 7500, // prix promo, pas 10000
        }),
      }),
    );
  });

  it("incrémente la quantité si l'article est déjà dans le panier", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-dup",
      ownerUserId: "seller-2",
      isPublished: true,
      priceUsdCents: 3000,
      promoActive: false,
    });
    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-2" });
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: "item-existing",
      quantity: 2,
      unitPriceUsdCents: 3000,
    });
    mockPrisma.cartItem.update.mockResolvedValue({});
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: "cart-2",
      status: "OPEN",
      currency: "USD",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    await ordersService.addCartItem("buyer-4", { listingId: "listing-dup", quantity: 3 });

    expect(mockPrisma.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 5, // 2 existant + 3 ajouté
        }),
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// CART — removeCartItem
// ════════════════════════════════════════════════════════════

describe("removeCartItem()", () => {
  it("rejette si le panier n'existe pas (404)", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue(null);

    await expect(
      ordersService.removeCartItem("user-no-cart", "item-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette si l'article n'est pas dans le panier (404)", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-x" });
    mockPrisma.cartItem.findFirst.mockResolvedValue(null);

    await expect(
      ordersService.removeCartItem("user-with-cart", "item-unknown"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// CART — getBuyerCart
// ════════════════════════════════════════════════════════════

describe("getBuyerCart()", () => {
  it("crée un panier si aucun n'existe", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue(null);
    mockPrisma.cart.create.mockResolvedValue({ id: "new-cart" });
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: "new-cart",
      status: "OPEN",
      currency: "USD",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    const cart = await ordersService.getBuyerCart("new-buyer");

    expect(cart.id).toBe("new-cart");
    expect(cart.status).toBe("OPEN");
    expect(cart.itemsCount).toBe(0);
  });

  it("calcule le subtotal correctement", async () => {
    const items = [
      {
        id: "i1",
        listingId: "l1",
        quantity: 2,
        unitPriceUsdCents: 1000,
        negotiationId: null,
        negotiation: null,
        listing: {
          id: "l1", type: "PRODUCT", title: "Test", category: "electronics",
          city: "Kinshasa", imageUrl: null, priceUsdCents: 1000, isNegotiable: false,
          ownerUserId: "s1",
          ownerUser: { id: "s1", profile: { displayName: "Seller", avatarUrl: null, username: null, city: null } },
          business: null,
        },
      },
      {
        id: "i2",
        listingId: "l2",
        quantity: 1,
        unitPriceUsdCents: 5000,
        negotiationId: null,
        negotiation: null,
        listing: {
          id: "l2", type: "SERVICE", title: "Test 2", category: "services",
          city: "Kinshasa", imageUrl: null, priceUsdCents: 5000, isNegotiable: true,
          ownerUserId: "s2",
          ownerUser: { id: "s2", profile: { displayName: "Seller 2", avatarUrl: null, username: null, city: null } },
          business: null,
        },
      },
    ];

    mockPrisma.cart.findFirst.mockResolvedValue({ id: "cart-calc" });
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: "cart-calc",
      status: "OPEN",
      currency: "USD",
      createdAt: new Date(),
      updatedAt: new Date(),
      items,
    });

    const cart = await ordersService.getBuyerCart("buyer-calc");

    expect(cart.subtotalUsdCents).toBe(7000); // (2*1000) + (1*5000)
    expect(cart.itemsCount).toBe(2);
  });
});
