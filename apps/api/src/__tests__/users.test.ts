/**
 * Tests — users.service.ts
 *
 * getMe, updateMe, getPublicProfile.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    userProfile: { upsert: vi.fn() },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/utils/media-storage.js", () => ({
  normalizeImageInput: vi.fn(async (url: string | undefined) => url ?? null),
}));

// ── Import after mocks ─────────────────────────────────────

import { getMe, updateMe, getPublicProfile } from "../modules/users/users.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// getMe
// ════════════════════════════════════════════════════════════

describe("getMe()", () => {
  it("retourne le profil de l'utilisateur", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      role: "USER",
      accountStatus: "ACTIVE",
      email: "test@example.com",
      profile: {
        displayName: "Test User",
        avatarUrl: null,
        city: "Kinshasa",
        country: "RDC",
        bio: null,
        domain: null,
        qualification: null,
        experience: null,
        workHours: null,
        verificationStatus: "UNVERIFIED",
      },
    });

    const result = await getMe("u1");
    expect(result.id).toBe("u1");
    expect(result.displayName).toBe("Test User");
    expect(result.city).toBe("Kinshasa");
  });

  it("retourne des valeurs par défaut si pas de profil", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u2",
      role: "USER",
      accountStatus: "ACTIVE",
      email: "no-profile@test.com",
      profile: null,
    });

    const result = await getMe("u2");
    expect(result.displayName).toBe("");
    expect(result.avatarUrl).toBeNull();
    expect(result.verificationStatus).toBe("UNVERIFIED");
  });

  it("throw 404 si utilisateur introuvable", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(getMe("unknown")).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// updateMe
// ════════════════════════════════════════════════════════════

describe("updateMe()", () => {
  it("met à jour le profil avec upsert", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
    mockPrisma.userProfile.upsert.mockResolvedValue({
      userId: "u1",
      displayName: "Nouveau Nom",
      avatarUrl: null,
      city: "Lubumbashi",
      country: null,
      bio: null,
      domain: null,
      qualification: null,
      experience: null,
      workHours: null,
      verificationStatus: "UNVERIFIED",
    });

    const result = await updateMe("u1", {
      displayName: "Nouveau Nom",
      city: "Lubumbashi",
    });

    expect(result.displayName).toBe("Nouveau Nom");
    expect(result.city).toBe("Lubumbashi");
    expect(mockPrisma.userProfile.upsert).toHaveBeenCalledOnce();
  });

  it("throw 404 si utilisateur inexistant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(updateMe("unknown", { displayName: "X" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// getPublicProfile
// ════════════════════════════════════════════════════════════

describe("getPublicProfile()", () => {
  it("retourne un profil public", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u3",
      role: "USER",
      profile: {
        displayName: "Public User",
        avatarUrl: "https://cdn.example.com/avatar.jpg",
        city: "Kinshasa",
        country: "RDC",
        verificationStatus: "VERIFIED",
      },
    });

    const result = await getPublicProfile("u3");
    expect(result.displayName).toBe("Public User");
    expect(result.verificationStatus).toBe("VERIFIED");
  });

  it("throw 404 profil introuvable", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(getPublicProfile("unknown")).rejects.toMatchObject({ statusCode: 404 });
  });
});
