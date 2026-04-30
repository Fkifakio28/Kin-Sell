/**
 * Tests — contacts.service.ts
 *
 * Import contacts, ajout manuel, favoris, suppression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    userContact: {
      findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(),
      upsert: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────

import * as contactsService from "../modules/contacts/contacts.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// addManualContact
// ════════════════════════════════════════════════════════════

describe("addManualContact()", () => {
  it("empêche de s'ajouter soi-même", async () => {
    await expect(
      contactsService.addManualContact("u1", "u1"),
    ).rejects.toThrow("Vous ne pouvez pas vous ajouter vous-même.");
  });

  it("rejette un utilisateur cible inexistant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      contactsService.addManualContact("u1", "nonexistent"),
    ).rejects.toThrow("Utilisateur introuvable.");
  });

  it("crée un contact manuel", async () => {
    const targetUser = {
      id: "u2",
      profile: { displayName: "Alice", avatarUrl: null, city: "Kinshasa", username: "alice" },
    };
    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    mockPrisma.userContact.findFirst.mockResolvedValue(null);
    mockPrisma.userContact.create.mockResolvedValue({
      id: "c-1", userId: "u1", matchedUserId: "u2", source: "MANUAL", contactName: "Alice",
    });

    const result = await contactsService.addManualContact("u1", "u2");
    expect(result.matchedUserId).toBe("u2");
  });

  it("retourne le contact existant si déjà ajouté", async () => {
    const targetUser = {
      id: "u2",
      profile: { displayName: "Alice", avatarUrl: null, city: "Kinshasa", username: "alice" },
    };
    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    mockPrisma.userContact.findFirst.mockResolvedValue({
      id: "c-1", userId: "u1", matchedUserId: "u2", source: "MANUAL",
    });

    const result = await contactsService.addManualContact("u1", "u2");
    expect(result.matchedUserId).toBe("u2");
  });
});

// ════════════════════════════════════════════════════════════
// deleteContact
// ════════════════════════════════════════════════════════════

describe("deleteContact()", () => {
  it("rejette un contact introuvable", async () => {
    mockPrisma.userContact.findFirst.mockResolvedValue(null);
    await expect(
      contactsService.deleteContact("u1", "nonexistent"),
    ).rejects.toThrow("Contact introuvable.");
  });

  it("supprime un contact appartenant à l'utilisateur", async () => {
    mockPrisma.userContact.findFirst.mockResolvedValue({ id: "c-1", userId: "u1" });
    mockPrisma.userContact.delete.mockResolvedValue({ id: "c-1" });

    const result = await contactsService.deleteContact("u1", "c-1");
    expect(result).toEqual({ ok: true });
  });
});

// ════════════════════════════════════════════════════════════
// getUserContacts
// ════════════════════════════════════════════════════════════

describe("getUserContacts()", () => {
  it("retourne les contacts d'un utilisateur", async () => {
    mockPrisma.userContact.findMany.mockResolvedValue([
      { id: "c-1", userId: "u1", matchedUserId: "u2", source: "MANUAL" },
      { id: "c-2", userId: "u1", matchedUserId: "u3", source: "PHONE" },
    ]);

    const result = await contactsService.getUserContacts("u1");
    expect(result).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════
// toggleContactFavorite
// ════════════════════════════════════════════════════════════

describe("toggleContactFavorite()", () => {
  it("rejette si contact introuvable", async () => {
    mockPrisma.userContact.findFirst.mockResolvedValue(null);
    await expect(
      contactsService.toggleContactFavorite("u1", "nonexistent", true),
    ).rejects.toThrow("Contact introuvable.");
  });

  it("met à jour le favori", async () => {
    mockPrisma.userContact.findFirst.mockResolvedValue({ id: "c-1", userId: "u1" });
    mockPrisma.userContact.update.mockResolvedValue({
      id: "c-1", isFavorite: true,
      matchedUser: { profile: { displayName: "Alice" } },
    });

    const result = await contactsService.toggleContactFavorite("u1", "c-1", true);
    expect(result.isFavorite).toBe(true);
  });
});
