/**
 * Tests — reviews.service.ts
 *
 * Avis liés aux commandes, avis libres, validations métier.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    order: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    userReview: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), count: vi.fn(),
    },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../modules/notifications/push.service.js", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));

// ── Import after mocks ─────────────────────────────────────

import { createOrderReview, createReview, getReviewsForUser } from "../modules/reviews/reviews.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// createOrderReview
// ════════════════════════════════════════════════════════════

describe("createOrderReview()", () => {
  it("crée un avis vérifié pour une commande livrée (buyer → seller)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-1", status: "DELIVERED", buyerUserId: "buyer-1", sellerUserId: "seller-1",
    });
    mockPrisma.userReview.findUnique.mockResolvedValue(null);
    mockPrisma.userReview.create.mockResolvedValue({
      id: "rev-1", authorId: "buyer-1", targetId: "seller-1", rating: 5, verified: true,
    });

    const result = await createOrderReview("buyer-1", "ord-1", 5, "Excellent !");
    expect(result.verified).toBe(true);
    expect(result.rating).toBe(5);
  });

  it("rejette une commande non livrée (400)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-2", status: "PENDING", buyerUserId: "buyer-1", sellerUserId: "seller-1",
    });

    await expect(
      createOrderReview("buyer-1", "ord-2", 4),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette une commande inexistante (404)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    await expect(
      createOrderReview("buyer-1", "nonexistent", 5),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette un utilisateur étranger à la commande (403)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-3", status: "DELIVERED", buyerUserId: "buyer-1", sellerUserId: "seller-1",
    });

    await expect(
      createOrderReview("stranger", "ord-3", 5),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("détecte un doublon d'avis (409)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-4", status: "DELIVERED", buyerUserId: "buyer-1", sellerUserId: "seller-1",
    });
    mockPrisma.userReview.findUnique.mockResolvedValue({ id: "existing-rev" });

    await expect(
      createOrderReview("buyer-1", "ord-4", 5),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ════════════════════════════════════════════════════════════
// createReview (libre)
// ════════════════════════════════════════════════════════════

describe("createReview()", () => {
  it("empêche de s'auto-évaluer (400)", async () => {
    await expect(
      createReview("u1", "u1", 5),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette une cible inexistante (404)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      createReview("u1", "unknown", 4),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// getReviewsForUser
// ════════════════════════════════════════════════════════════

describe("getReviewsForUser()", () => {
  it("retourne les avis paginés et la moyenne", async () => {
    mockPrisma.userReview.findMany.mockResolvedValue([
      {
        id: "r1", authorId: "a1", rating: 5, text: "Top", verified: true, orderId: "o1",
        createdAt: new Date(),
        author: { profile: { displayName: "Alice", avatarUrl: null } },
      },
      {
        id: "r2", authorId: "a2", rating: 3, text: "OK", verified: false, orderId: null,
        createdAt: new Date(),
        author: { profile: { displayName: "Bob", avatarUrl: null } },
      },
    ]);
    mockPrisma.userReview.count.mockResolvedValue(2);

    const result = await getReviewsForUser("target-1", 20, 0);
    expect(result.reviews).toHaveLength(2);
    expect(result.averageRating).toBe(4);
    expect(result.totalCount).toBe(2);
  });
});
