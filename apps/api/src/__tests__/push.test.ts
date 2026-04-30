/**
 * Tests — push.service.ts
 *
 * Push notifications: subscribe, unsubscribe, FCM token management.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    pushSubscription: {
      upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), delete: vi.fn(),
    },
    fcmToken: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/env.js", () => ({
  env: { VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" },
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));
vi.mock("./fcm.service.js", () => ({
  isFcmConfigured: vi.fn(() => false),
  sendFcmToToken: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────

import {
  subscribePush,
  unsubscribePush,
  unsubscribeAllPush,
  registerFcmToken,
  unregisterFcmToken,
} from "../modules/notifications/push.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// subscribePush
// ════════════════════════════════════════════════════════════

describe("subscribePush()", () => {
  it("upsert une souscription push", async () => {
    mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: "sub-1" });

    const result = await subscribePush("u1", {
      endpoint: "https://fcm.googleapis.com/fcm/send/xxx",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });

    expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledOnce();
    expect(result.id).toBe("sub-1");
  });
});

// ════════════════════════════════════════════════════════════
// unsubscribePush
// ════════════════════════════════════════════════════════════

describe("unsubscribePush()", () => {
  it("supprime la souscription par endpoint", async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

    await unsubscribePush("u1", "https://endpoint-to-remove");

    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", endpoint: "https://endpoint-to-remove" },
    });
  });
});

// ════════════════════════════════════════════════════════════
// unsubscribeAllPush
// ════════════════════════════════════════════════════════════

describe("unsubscribeAllPush()", () => {
  it("supprime toutes les souscriptions d'un user", async () => {
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 3 });
    await unsubscribeAllPush("u1");
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

// ════════════════════════════════════════════════════════════
// FCM Token
// ════════════════════════════════════════════════════════════

describe("registerFcmToken()", () => {
  it("upsert un token FCM", async () => {
    mockPrisma.fcmToken.upsert.mockResolvedValue({ token: "fcm-tok-1" });

    const result = await registerFcmToken("u1", "fcm-tok-1", "android");

    expect(mockPrisma.fcmToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "fcm-tok-1" },
        create: expect.objectContaining({ userId: "u1", token: "fcm-tok-1", platform: "android" }),
      }),
    );
  });
});

describe("unregisterFcmToken()", () => {
  it("supprime un token FCM", async () => {
    mockPrisma.fcmToken.deleteMany.mockResolvedValue({ count: 1 });
    await unregisterFcmToken("fcm-tok-1");
    expect(mockPrisma.fcmToken.deleteMany).toHaveBeenCalledWith({ where: { token: "fcm-tok-1" } });
  });
});
