/**
 * Tests — business-accounts.service.ts
 *
 * Création de compte entreprise, validations de rôle, doublon.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    businessAccount: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/utils/media-storage.js", () => ({
  normalizeImageInput: vi.fn(async (url: string | undefined) => url ?? null),
  normalizeImageInputs: vi.fn(async (urls: string[] | undefined) => urls ?? []),
}));

// ── Import after mocks ─────────────────────────────────────

import { createBusinessAccount } from "../modules/businesses/business-accounts.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// createBusinessAccount
// ════════════════════════════════════════════════════════════

describe("createBusinessAccount()", () => {
  const payload = {
    legalName: "Ma Boutique SARL",
    publicName: "Ma Boutique",
    city: "Kinshasa",
  };

  it("crée un compte business pour un USER", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", role: "USER" });
    mockPrisma.businessAccount.findFirst.mockResolvedValue(null);
    mockPrisma.businessAccount.findUnique.mockResolvedValue(null); // slug check
    mockPrisma.businessAccount.create.mockResolvedValue({
      id: "ba-1",
      ownerUserId: "u1",
      publicName: "Ma Boutique",
      slug: "ma-boutique",
      shop: {},
    });
    mockPrisma.user.update.mockResolvedValue({});

    const result = await createBusinessAccount("u1", payload);
    expect(result.id).toBe("ba-1");
    expect(result.slug).toBe("ma-boutique");
  });

  it("refuse utilisateur inexistant (404)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      createBusinessAccount("unknown", payload),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuse un admin (403)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin1", role: "ADMIN" });
    await expect(
      createBusinessAccount("admin1", payload),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse un super_admin (403)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "sa1", role: "SUPER_ADMIN" });
    await expect(
      createBusinessAccount("sa1", payload),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("détecte un compte existant (409)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", role: "BUSINESS" });
    mockPrisma.businessAccount.findFirst.mockResolvedValue({ id: "ba-existing" });

    await expect(
      createBusinessAccount("u2", payload),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
