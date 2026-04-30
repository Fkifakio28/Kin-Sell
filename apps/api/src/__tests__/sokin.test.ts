/**
 * Tests — sokin.service.ts & sokin-social.service.ts
 *
 * Publications So-Kin, réactions, bookmarks, reports.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    soKinPost: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
      groupBy: vi.fn(),
    },
    soKinComment: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    soKinReaction: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), delete: vi.fn(), update: vi.fn(),
      groupBy: vi.fn(),
    },
    soKinBookmark: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), delete: vi.fn(),
    },
    soKinReport: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────

import * as sokinService from "../modules/sokin/sokin.service.js";
import * as sokinSocial from "../modules/sokin/sokin-social.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// createSoKinPost
// ════════════════════════════════════════════════════════════

describe("createSoKinPost()", () => {
  it("crée un post texte seul avec background", async () => {
    mockPrisma.soKinPost.create.mockResolvedValue({
      id: "post-1",
      authorId: "u1",
      text: "Hello Kin-Sell !",
      backgroundStyle: "glass-violet-liquid",
      status: "ACTIVE",
    });

    const result = await sokinService.createSoKinPost(
      "u1", "Hello Kin-Sell !", undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, "glass-violet-liquid",
    );

    expect(result.id).toBe("post-1");
    expect(result.backgroundStyle).toBe("glass-violet-liquid");
  });

  it("rejette un post sans contenu (400)", async () => {
    await expect(
      sokinService.createSoKinPost("u1", ""),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette plus de 5 médias (400)", async () => {
    const tooMany = Array(6).fill("https://cdn.example.com/img.jpg");
    await expect(
      sokinService.createSoKinPost("u1", "test", tooMany),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette plus de 2 vidéos (400)", async () => {
    const videos = [
      "https://cdn.example.com/v1.mp4",
      "https://cdn.example.com/v2.mp4",
      "https://cdn.example.com/v3.webm",
    ];
    await expect(
      sokinService.createSoKinPost("u1", "vidéos", videos),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ════════════════════════════════════════════════════════════
// deleteSoKinPost
// ════════════════════════════════════════════════════════════

describe("deleteSoKinPost()", () => {
  it("rejette un post inexistant (404)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue(null);
    await expect(
      sokinService.deleteSoKinPost("u1", "nonexistent"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette si pas propriétaire (403)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", authorId: "other" });
    await expect(
      sokinService.deleteSoKinPost("u1", "p1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ════════════════════════════════════════════════════════════
// repostSoKinPost
// ════════════════════════════════════════════════════════════

describe("repostSoKinPost()", () => {
  it("rejette le repost de son propre post (400)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({
      id: "p1", authorId: "u1", status: "ACTIVE",
    });

    await expect(
      sokinService.repostSoKinPost("u1", "p1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette un post supprimé (404)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({
      id: "p2", authorId: "other", status: "DELETED",
    });

    await expect(
      sokinService.repostSoKinPost("u1", "p2"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// toggleReaction
// ════════════════════════════════════════════════════════════

describe("toggleReaction()", () => {
  it("rejette un type de réaction invalide (400)", async () => {
    await expect(
      sokinSocial.toggleReaction("u1", "p1", "INVALID" as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette un post supprimé (404)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", status: "DELETED" });

    await expect(
      sokinSocial.toggleReaction("u1", "p1", "LIKE" as any),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("ajoute une réaction LIKE", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", status: "ACTIVE", likes: 0 });
    mockPrisma.soKinReaction.findFirst.mockResolvedValue(null);
    mockPrisma.soKinReaction.create.mockResolvedValue({ id: "r1", type: "LIKE" });
    mockPrisma.soKinPost.update.mockResolvedValue({});

    const result = await sokinSocial.toggleReaction("u1", "p1", "LIKE" as any);
    expect(result.action).toBe("added");
  });
});

// ════════════════════════════════════════════════════════════
// reportPost
// ════════════════════════════════════════════════════════════

describe("reportPost()", () => {
  it("rejette un motif invalide (400)", async () => {
    await expect(
      sokinSocial.reportPost("u1", "p1", "INVALID_REASON" as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("empêche de signaler son propre post (400)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", authorId: "u1", status: "ACTIVE" });

    await expect(
      sokinSocial.reportPost("u1", "p1", "SPAM" as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("détecte un signalement duplicata (409)", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", authorId: "other", status: "ACTIVE" });
    mockPrisma.soKinReport.findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      sokinSocial.reportPost("u1", "p1", "SPAM" as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ════════════════════════════════════════════════════════════
// toggleBookmark
// ════════════════════════════════════════════════════════════

describe("toggleBookmark()", () => {
  it("ajoute un bookmark", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", status: "ACTIVE" });
    mockPrisma.soKinBookmark.findUnique.mockResolvedValue(null);
    mockPrisma.soKinBookmark.create.mockResolvedValue({ id: "bm-1" });

    const result = await sokinSocial.toggleBookmark("u1", "p1");
    expect(result.saved).toBe(true);
  });

  it("supprime un bookmark existant", async () => {
    mockPrisma.soKinPost.findUnique.mockResolvedValue({ id: "p1", status: "ACTIVE" });
    mockPrisma.soKinBookmark.findUnique.mockResolvedValue({ id: "bm-1" });
    mockPrisma.soKinBookmark.delete.mockResolvedValue({});

    const result = await sokinSocial.toggleBookmark("u1", "p1");
    expect(result.saved).toBe(false);
  });
});
