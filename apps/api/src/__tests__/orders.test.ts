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
    order: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
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

// ════════════════════════════════════════════════════════════
// CHECKOUT — stock validation
// ════════════════════════════════════════════════════════════

describe("checkoutBuyerCart() — stock validation", () => {
  const makeCartWithStock = (stockQuantity: number | null, itemQty: number) => ({
    id: "cart-stock",
    buyerUserId: "buyer-stock",
    status: "OPEN",
    currency: "USD",
    items: [
      {
        id: "ci-1",
        listingId: "listing-stock",
        quantity: itemQty,
        unitPriceUsdCents: 1000,
        negotiationId: null,
        negotiation: null,
        listing: {
          id: "listing-stock",
          type: "PRODUIT",
          title: "Produit Stock",
          category: "electronics",
          city: "Kinshasa",
          imageUrl: null,
          priceUsdCents: 1000,
          isNegotiable: false,
          isPublished: true,
          stockQuantity,
          ownerUserId: "seller-stock",
          businessId: null,
        },
      },
    ],
  });

  it("rejette le checkout si le stock est à 0 (400)", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue(makeCartWithStock(0, 1));

    await expect(
      ordersService.checkoutBuyerCart("buyer-stock"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("rupture de stock"),
    });
  });

  it("rejette le checkout si quantité > stock (400)", async () => {
    mockPrisma.cart.findFirst.mockResolvedValue(makeCartWithStock(2, 5));

    await expect(
      ordersService.checkoutBuyerCart("buyer-stock"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Stock insuffisant"),
    });
  });

  it("accepte le checkout si stock illimité (null)", async () => {
    const cart = makeCartWithStock(null, 100);
    mockPrisma.cart.findFirst.mockResolvedValue(cart);
    mockPrisma.order.create.mockResolvedValue({ id: "order-unlimited" });
    mockPrisma.cart.update.mockResolvedValue({});
    mockPrisma.cart.create.mockResolvedValue({ id: "new-cart" });
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: "order-unlimited",
        status: "PENDING",
        currency: "USD",
        totalUsdCents: 100000,
        notes: null,
        createdAt: new Date(),
        confirmedAt: null,
        deliveredAt: null,
        canceledAt: null,
        buyer: { id: "buyer-stock", profile: { displayName: "Buyer", username: null } },
        seller: { id: "seller-stock", profile: { displayName: "Seller", username: null } },
        sellerBusiness: null,
        items: [],
      },
    ]);

    const result = await ordersService.checkoutBuyerCart("buyer-stock");

    expect(result.orders).toHaveLength(1);
  });

  it("accepte le checkout si quantité <= stock", async () => {
    const cart = makeCartWithStock(10, 3);
    mockPrisma.cart.findFirst.mockResolvedValue(cart);
    mockPrisma.order.create.mockResolvedValue({ id: "order-ok" });
    mockPrisma.cart.update.mockResolvedValue({});
    mockPrisma.cart.create.mockResolvedValue({ id: "new-cart" });
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: "order-ok",
        status: "PENDING",
        currency: "USD",
        totalUsdCents: 3000,
        notes: null,
        createdAt: new Date(),
        confirmedAt: null,
        deliveredAt: null,
        canceledAt: null,
        buyer: { id: "buyer-stock", profile: { displayName: "Buyer", username: null } },
        seller: { id: "seller-stock", profile: { displayName: "Seller", username: null } },
        sellerBusiness: null,
        items: [],
      },
    ]);

    const result = await ordersService.checkoutBuyerCart("buyer-stock");

    expect(result.orders).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════
// STATUS UPDATE — stock decrement
// ════════════════════════════════════════════════════════════

describe("updateSellerOrderStatus() — stock decrement", () => {
  it("décremente le stock quand le vendeur confirme (CONFIRMED)", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.order.findFirst.mockResolvedValue({
      id: "order-dec",
      status: "PENDING",
    });
    mockPrisma.order.update.mockResolvedValue({
      id: "order-dec",
      status: "CONFIRMED",
      currency: "USD",
      totalUsdCents: 2000,
      notes: null,
      createdAt: new Date(),
      confirmedAt: new Date(),
      deliveredAt: null,
      canceledAt: null,
      buyer: { id: "buyer-1", profile: { displayName: "Buyer", username: null } },
      seller: { id: "seller-1", profile: { displayName: "Seller", username: null } },
      sellerBusiness: null,
      items: [
        {
          id: "oi-1",
          listingId: "listing-dec",
          listingType: "PRODUIT",
          title: "Article A",
          category: "cat",
          city: "Kinshasa",
          quantity: 3,
          unitPriceUsdCents: 500,
          lineTotalUsdCents: 1500,
          listing: { imageUrl: null, stockQuantity: 10 },
        },
      ],
    });
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-dec",
      title: "Article A",
      stockQuantity: 10,
    });
    mockPrisma.listing.update.mockResolvedValue({});

    const result = await ordersService.updateSellerOrderStatus("seller-1", "order-dec", "CONFIRMED" as any);

    expect(mockPrisma.listing.update).toHaveBeenCalledWith({
      where: { id: "listing-dec" },
      data: { stockQuantity: 7 }, // 10 - 3
    });
    expect((result as any)._exhaustedListings).toEqual([]);
  });

  it("retourne les listings épuisés quand le stock tombe à 0", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.order.findFirst.mockResolvedValue({
      id: "order-exhaust",
      status: "PENDING",
    });
    mockPrisma.order.update.mockResolvedValue({
      id: "order-exhaust",
      status: "CONFIRMED",
      currency: "USD",
      totalUsdCents: 2000,
      notes: null,
      createdAt: new Date(),
      confirmedAt: new Date(),
      deliveredAt: null,
      canceledAt: null,
      buyer: { id: "buyer-1", profile: { displayName: "Buyer", username: null } },
      seller: { id: "seller-1", profile: { displayName: "Seller", username: null } },
      sellerBusiness: null,
      items: [
        {
          id: "oi-2",
          listingId: "listing-exhaust",
          listingType: "PRODUIT",
          title: "Article B",
          category: "cat",
          city: "Kinshasa",
          quantity: 5,
          unitPriceUsdCents: 400,
          lineTotalUsdCents: 2000,
          listing: { imageUrl: null, stockQuantity: 5 },
        },
      ],
    });
    mockPrisma.listing.findUnique.mockResolvedValue({
      id: "listing-exhaust",
      title: "Article B",
      stockQuantity: 5,
    });
    mockPrisma.listing.update.mockResolvedValue({});

    const result = await ordersService.updateSellerOrderStatus("seller-1", "order-exhaust", "CONFIRMED" as any);

    expect(mockPrisma.listing.update).toHaveBeenCalledWith({
      where: { id: "listing-exhaust" },
      data: { stockQuantity: 0 }, // 5 - 5
    });
    expect((result as any)._exhaustedListings).toEqual([
      { id: "listing-exhaust", title: "Article B" },
    ]);
  });

  it("ne décremente pas le stock pour un status autre que CONFIRMED", async () => {
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.order.findFirst.mockResolvedValue({
      id: "order-ship",
      status: "CONFIRMED",
    });
    mockPrisma.order.update.mockResolvedValue({
      id: "order-ship",
      status: "PROCESSING",
      currency: "USD",
      totalUsdCents: 1000,
      notes: null,
      createdAt: new Date(),
      confirmedAt: new Date(),
      deliveredAt: null,
      canceledAt: null,
      buyer: { id: "buyer-1", profile: { displayName: "Buyer", username: null } },
      seller: { id: "seller-1", profile: { displayName: "Seller", username: null } },
      sellerBusiness: null,
      items: [
        {
          id: "oi-3",
          listingId: "listing-ship",
          listingType: "PRODUIT",
          title: "Article C",
          category: "cat",
          city: "Kinshasa",
          quantity: 2,
          unitPriceUsdCents: 500,
          lineTotalUsdCents: 1000,
          listing: { imageUrl: null, stockQuantity: 8 },
        },
      ],
    });

    await ordersService.updateSellerOrderStatus("seller-1", "order-ship", "PROCESSING" as any);

    expect(mockPrisma.listing.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.listing.update).not.toHaveBeenCalled();
  });
});
