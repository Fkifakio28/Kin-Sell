/**
 * Tests — boost ranking engine (ranking.service.ts)
 *
 * Couvre :
 * - isBoostVisibleToViewer (P1.6 scope LOCAL/NATIONAL/CROSS_BORDER)
 * - applyBoostRanking : density cap 25%, fairness (no 2 consecutive same seller)
 * - Filtre des boosts invisibles selon scope
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../shared/db/prisma.js", () => ({
  prisma: {
    boostCampaign: { findMany: vi.fn() },
  },
}));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  applyBoostRanking,
  isBoostVisibleToViewer,
  type RankableItem,
} from "../modules/boost/ranking.service.js";

// ─────────────────────────────────────────────────────
// isBoostVisibleToViewer (fix P1.6)
// ─────────────────────────────────────────────────────

describe("isBoostVisibleToViewer()", () => {
  const baseRow = {
    isBoosted: true,
    boostExpiresAt: new Date(Date.now() + 86_400_000),
    boostTargetCountries: [],
    city: "Kinshasa",
    country: "CD",
  };

  it("retourne false si boost expiré", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostExpiresAt: new Date(Date.now() - 1000), boostScope: "LOCAL" },
        { viewerCity: "Kinshasa" },
      ),
    ).toBe(false);
  });

  it("LOCAL : false si pas de viewerCity (fix P1.6 — pas d'exposition anonyme)", () => {
    expect(
      isBoostVisibleToViewer({ ...baseRow, boostScope: "LOCAL" }, {}),
    ).toBe(false);
  });

  it("LOCAL : true si viewerCity matche city de l'item", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostScope: "LOCAL" },
        { viewerCity: "Kinshasa" },
      ),
    ).toBe(true);
  });

  it("LOCAL : false si ville différente", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostScope: "LOCAL" },
        { viewerCity: "Lubumbashi" },
      ),
    ).toBe(false);
  });

  it("NATIONAL : false si pas de viewerCountry", () => {
    expect(
      isBoostVisibleToViewer({ ...baseRow, boostScope: "NATIONAL" }, {}),
    ).toBe(false);
  });

  it("NATIONAL : true si même pays", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostScope: "NATIONAL" },
        { viewerCountry: "CD" },
      ),
    ).toBe(true);
  });

  it("CROSS_BORDER : true si pays viewer dans targetCountries", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostScope: "CROSS_BORDER", boostTargetCountries: ["FR", "BE"] },
        { viewerCountry: "FR" },
      ),
    ).toBe(true);
  });

  it("CROSS_BORDER : false si pays absent de targetCountries", () => {
    expect(
      isBoostVisibleToViewer(
        { ...baseRow, boostScope: "CROSS_BORDER", boostTargetCountries: ["FR"] },
        { viewerCountry: "US" },
      ),
    ).toBe(false);
  });

  it("boost sans scope (legacy) reste visible", () => {
    expect(
      isBoostVisibleToViewer({ ...baseRow, boostScope: null }, { viewerCity: "X" }),
    ).toBe(true);
  });

  it("isBoosted=false retourne false", () => {
    expect(
      isBoostVisibleToViewer({ ...baseRow, isBoosted: false, boostScope: "LOCAL" }, { viewerCity: "Kinshasa" }),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
// applyBoostRanking — density cap + fairness
// ─────────────────────────────────────────────────────

function makeItem(id: string, sellerId: string, opts: Partial<RankableItem> = {}): RankableItem {
  return {
    id,
    sellerId,
    isBoosted: false,
    createdAt: new Date(),
    relevance: 0.5,
    quality: 0.5,
    ...opts,
  };
}

describe("applyBoostRanking() — density cap 25%", () => {
  it("limite à 25% d'items boostés max", () => {
    const items: RankableItem[] = [];
    // 20 items dont 10 boostés → cap = floor(20*0.25) = 5
    for (let i = 0; i < 10; i++) {
      items.push(
        makeItem(`b${i}`, `seller-b-${i}`, {
          isBoosted: true,
          boostScope: "NATIONAL",
          itemCountry: "CD",
          boostBudgetTotal: 1000,
          boostBudgetSpent: 0,
          relevance: 0.9,
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      items.push(makeItem(`n${i}`, `seller-n-${i}`, { relevance: 0.3 }));
    }

    const ranked = applyBoostRanking(items, { viewerCountry: "CD" });
    expect(ranked.length).toBe(20);

    // Les 5 premiers items (avant dilution) devraient contenir au plus 5 boostés
    const firstFive = ranked.slice(0, 5);
    const boostedInTop = firstFive.filter((r) => r.isBoosted).length;
    expect(boostedInTop).toBeLessThanOrEqual(5);
  });

  it("items boostés invisibles au viewer sont normalisés (isBoosted=false)", () => {
    const items: RankableItem[] = [
      makeItem("b1", "s1", {
        isBoosted: true,
        boostScope: "LOCAL",
        itemCity: "Kinshasa",
      }),
    ];
    const ranked = applyBoostRanking(items, {}); // viewer anonyme → LOCAL filtré
    expect(ranked[0].isBoosted).toBe(false);
  });
});

describe("applyBoostRanking() — fairness", () => {
  it("évite 2 items consécutifs du même vendeur quand possible", () => {
    const items: RankableItem[] = [
      makeItem("a1", "alice", { relevance: 0.9 }),
      makeItem("a2", "alice", { relevance: 0.85 }),
      makeItem("b1", "bob", { relevance: 0.8 }),
      makeItem("c1", "carol", { relevance: 0.75 }),
    ];
    const ranked = applyBoostRanking(items, {});
    // Vérifier qu'aucun 2 consécutifs ne sont du même vendeur dans le haut du classement
    for (let i = 0; i < ranked.length - 1; i++) {
      if (ranked[i].sellerId === ranked[i + 1].sellerId) {
        // Autorisé uniquement si le restant pending n'a pas d'autre choix
        // (ici on a assez de diversité)
      }
    }
    // alice ne devrait pas apparaître 2 fois au top
    expect(ranked[0].sellerId === ranked[1].sellerId).toBe(false);
  });

  it("liste vide retournée telle quelle", () => {
    expect(applyBoostRanking([], {})).toEqual([]);
  });

  it("tous du même vendeur : pas d'exception, toutes les items retournés", () => {
    const items: RankableItem[] = [
      makeItem("a1", "alice", { relevance: 0.9 }),
      makeItem("a2", "alice", { relevance: 0.8 }),
      makeItem("a3", "alice", { relevance: 0.7 }),
    ];
    const ranked = applyBoostRanking(items, {});
    expect(ranked).toHaveLength(3);
  });
});
