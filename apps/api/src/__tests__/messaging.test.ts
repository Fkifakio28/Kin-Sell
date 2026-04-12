/**
 * Tests — messaging.service.ts
 *
 * Conversations DM, messages, recherche utilisateurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversationParticipant: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), createMany: vi.fn(),
      update: vi.fn(),
    },
    message: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    messageReadReceipt: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../modules/message-guard/message-guard.service.js", () => ({
  analyzeMessage: vi.fn().mockResolvedValue({ allowed: true, verdict: "ALLOWED", warningMessage: null, riskScore: 0 }),
}));
vi.mock("../modules/contacts/contacts.service.js", () => ({
  autoAddMessagingContacts: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────

import * as messagingService from "../modules/messaging/messaging.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// getOrCreateDMConversation
// ════════════════════════════════════════════════════════════

describe("getOrCreateDMConversation()", () => {
  it("empêche de créer un DM avec soi-même (400)", async () => {
    await expect(
      messagingService.getOrCreateDMConversation("u1", "u1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejette si l'utilisateur cible n'existe pas (404)", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]); // only 1 user found → length !== 2

    await expect(
      messagingService.getOrCreateDMConversation("u1", "unknown"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// sendMessage
// ════════════════════════════════════════════════════════════

describe("sendMessage()", () => {
  it("rejette un non-participant (403)", async () => {
    mockPrisma.conversationParticipant.findUnique.mockResolvedValue(null);

    await expect(
      messagingService.sendMessage("conv-1", "stranger", { type: "TEXT", content: "hello" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ════════════════════════════════════════════════════════════
// editMessage
// ════════════════════════════════════════════════════════════

describe("editMessage()", () => {
  it("rejette si message inexistant (404)", async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(
      messagingService.editMessage("nonexistent", "u1", "new content"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette si pas propriétaire (403)", async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: "msg-1", senderId: "other-user", type: "TEXT", isDeleted: false,
    });

    await expect(
      messagingService.editMessage("msg-1", "u1", "hacked"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ════════════════════════════════════════════════════════════
// deleteMessage
// ════════════════════════════════════════════════════════════

describe("deleteMessage()", () => {
  it("rejette si message inexistant (404)", async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(
      messagingService.deleteMessage("nonexistent", "u1"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ════════════════════════════════════════════════════════════
// searchUsers
// ════════════════════════════════════════════════════════════

describe("searchUsers()", () => {
  it("retourne les utilisateurs correspondants", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u2",
        profile: { displayName: "Alice", avatarUrl: null, username: "alice" },
      },
    ]);

    const results = await messagingService.searchUsers("alice", "u1");
    expect(results).toHaveLength(1);
  });
});
