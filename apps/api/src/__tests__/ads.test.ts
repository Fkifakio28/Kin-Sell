/**
 * Tests — ads.service.ts
 *
 * Bannières publicitaires, impressions, statut admin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    advertisement: {
      findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
    },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../modules/ads/ads-boost.service.js", () => ({
  expireBoosts: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────

import * as adsService from "../modules/ads/ads.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// getActiveBannerForPage
// ════════════════════════════════════════════════════════════

describe("getActiveBannerForPage()", () => {
  it("retourne null s'il n'y a pas de bannières actives", async () => {
    mockPrisma.advertisement.findMany.mockResolvedValue([]);

    const result = await adsService.getActiveBannerForPage("HOME");
    expect(result).toBeNull();
  });

  it("retourne une bannière active", async () => {
    mockPrisma.advertisement.findMany.mockResolvedValue([
      {
        id: "ad-1", title: "Promo", status: "ACTIVE",
        targetPages: ["HOME"], promotionScope: "LOCAL",
        baseCity: "Kinshasa",
      },
    ]);

    const result = await adsService.getActiveBannerForPage("HOME", "Kinshasa");
    expect(result).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// recordImpression / recordClick
// ════════════════════════════════════════════════════════════

describe("recordImpression()", () => {
  it("incrémente les impressions sans erreur", async () => {
    mockPrisma.advertisement.update.mockResolvedValue({});
    await adsService.recordImpression("ad-1");
    expect(mockPrisma.advertisement.update).toHaveBeenCalledOnce();
  });
});

describe("recordClick()", () => {
  it("incrémente les clics sans erreur", async () => {
    mockPrisma.advertisement.update.mockResolvedValue({});
    await adsService.recordClick("ad-1");
    expect(mockPrisma.advertisement.update).toHaveBeenCalledOnce();
  });
});

// ════════════════════════════════════════════════════════════
// adminCreateAd
// ════════════════════════════════════════════════════════════

describe("adminCreateAd()", () => {
  it("crée une annonce publicitaire PENDING", async () => {
    mockPrisma.advertisement.create.mockResolvedValue({
      id: "ad-new", status: "PENDING", title: "Test Ad",
    });

    const result = await adsService.adminCreateAd({
      title: "Test Ad",
      description: "Description",
      type: "BANNER",
      targetPages: ["HOME"],
    });

    expect(result.id).toBe("ad-new");
    expect(result.status).toBe("PENDING");
  });
});

// ════════════════════════════════════════════════════════════
// adminDeleteAd
// ════════════════════════════════════════════════════════════

describe("adminDeleteAd()", () => {
  it("supprime une annonce", async () => {
    mockPrisma.advertisement.delete.mockResolvedValue({});
    await adsService.adminDeleteAd("ad-1");
    expect(mockPrisma.advertisement.delete).toHaveBeenCalledWith({ where: { id: "ad-1" } });
  });
});
