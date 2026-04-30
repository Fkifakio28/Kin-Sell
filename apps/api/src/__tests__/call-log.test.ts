/**
 * Tests — call-log.service.ts
 *
 * Création, mise à jour, liste des appels.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    callLog: {
      create: vi.fn(), update: vi.fn(), findMany: vi.fn(),
    },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));

// ── Import after mocks ─────────────────────────────────────

import { createCallLog, updateCallLogStatus, getUserCallLogs } from "../modules/messaging/call-log.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════

describe("createCallLog()", () => {
  it("crée un log d'appel avec statut MISSED", async () => {
    mockPrisma.callLog.create.mockResolvedValue({
      id: "cl-1", callerUserId: "u1", receiverUserId: "u2",
      callType: "AUDIO", status: "MISSED",
    });

    const result = await createCallLog({
      conversationId: "conv-1",
      callerUserId: "u1",
      receiverUserId: "u2",
      callType: "AUDIO",
    });

    expect(result.status).toBe("MISSED");
    expect(result.callerUserId).toBe("u1");
  });
});

describe("updateCallLogStatus()", () => {
  it("met à jour le statut d'un appel", async () => {
    mockPrisma.callLog.update.mockResolvedValue({
      id: "cl-1", status: "ANSWERED",
    });

    const result = await updateCallLogStatus("cl-1", "ANSWERED", {
      answeredAt: new Date(),
    });

    expect(result.status).toBe("ANSWERED");
  });
});

describe("getUserCallLogs()", () => {
  it("retourne les appels de l'utilisateur", async () => {
    mockPrisma.callLog.findMany.mockResolvedValue([
      { id: "cl-1", callerUserId: "u1" },
      { id: "cl-2", receiverUserId: "u1" },
    ]);

    const result = await getUserCallLogs("u1");
    expect(result).toHaveLength(2);
  });
});
