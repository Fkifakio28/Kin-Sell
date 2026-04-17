/**
 * Tests — Messenger Scheduler + Frequency Capping
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockPrisma, createMockLogger, fakeId } from "./helpers.js";

// ── Mocks ──
const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();
const mockSendMail = vi.fn().mockResolvedValue(true);
const mockSendPushToUser = vi.fn().mockResolvedValue(undefined);

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("../shared/email/mailer.js", () => ({ sendMail: mockSendMail }));
vi.mock("../modules/notifications/push.service.js", () => ({ sendPushToUser: mockSendPushToUser }));
vi.mock("../modules/incentives/incentive.service.js", () => ({ selectIncentiveForUser: vi.fn().mockResolvedValue(null) }));

// Import AFTER mocks
const { isFrequencyCapped } = await import("../modules/ads/messenger-scheduler.service.js");
const {
  runCouponExpiryReminders,
  runInactiveUserReengagement,
  runWelcomeFlow,
  runWeeklyDigest,
  runFirstSaleCongrats,
  getMessengerSchedulerStats,
} = await import("../modules/ads/messenger-scheduler.service.js");

// ── Helpers ──
function resetAllMocks() {
  vi.clearAllMocks();
  mockSendMail.mockResolvedValue(true);
  mockSendPushToUser.mockResolvedValue(undefined);
}

// ══════════════════════════════════════════════
// FREQUENCY CAPPING
// ══════════════════════════════════════════════

describe("isFrequencyCapped", () => {
  beforeEach(resetAllMocks);

  it("returns false when under daily and weekly limits", async () => {
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(1); // both daily & weekly
    const result = await isFrequencyCapped("user-1");
    expect(result).toBe(false);
  });

  it("returns true when daily limit reached (3/day)", async () => {
    mockPrisma.aiAutonomyLog.count
      .mockResolvedValueOnce(3)  // daily
      .mockResolvedValueOnce(5); // weekly
    const result = await isFrequencyCapped("user-1");
    expect(result).toBe(true);
  });

  it("returns true when weekly limit reached (8/week)", async () => {
    mockPrisma.aiAutonomyLog.count
      .mockResolvedValueOnce(2)  // daily
      .mockResolvedValueOnce(8); // weekly
    const result = await isFrequencyCapped("user-1");
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════
// COUPON EXPIRY REMINDERS
// ══════════════════════════════════════════════

describe("runCouponExpiryReminders", () => {
  beforeEach(resetAllMocks);

  it("sends reminder for coupons expiring within 48h", async () => {
    const userId = fakeId();
    const couponCode = "TEST-REMIND-50";
    const expiresAt = new Date(Date.now() + 36 * 60 * 60 * 1000); // 36h from now

    mockPrisma.incentiveCoupon.findMany.mockResolvedValue([
      { id: fakeId(), code: couponCode, discountPercent: 50, expiresAt, recipientUserId: userId },
    ]);
    // Not already reminded
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    // Not frequency capped
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0);
    // User for email
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "test@test.com",
      profile: { displayName: "Test" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runCouponExpiryReminders();
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    // Verify reminder logged
    expect(mockPrisma.aiAutonomyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: "COUPON_EXPIRY_REMINDER",
          targetUserId: userId,
        }),
      }),
    );
  });

  it("skips already-reminded coupons", async () => {
    const userId = fakeId();
    mockPrisma.incentiveCoupon.findMany.mockResolvedValue([
      { id: fakeId(), code: "OLD-CODE", discountPercent: 30, expiresAt: new Date(), recipientUserId: userId },
    ]);
    // Already reminded
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue({ id: "existing" });

    const result = await runCouponExpiryReminders();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips frequency-capped users", async () => {
    const userId = fakeId();
    mockPrisma.incentiveCoupon.findMany.mockResolvedValue([
      { id: fakeId(), code: "CAP-TEST", discountPercent: 50, expiresAt: new Date(), recipientUserId: userId },
    ]);
    // Not already reminded
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    // Frequency capped (3 daily)
    mockPrisma.aiAutonomyLog.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

    const result = await runCouponExpiryReminders();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ══════════════════════════════════════════════
// INACTIVE USER RE-ENGAGEMENT
// ══════════════════════════════════════════════

describe("runInactiveUserReengagement", () => {
  beforeEach(resetAllMocks);

  it("sends re-engagement to inactive users", async () => {
    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: userId, email: "inactive@test.com", profile: { displayName: "Inactif" } },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null); // not yet sent
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0); // not capped
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "inactive@test.com",
      profile: { displayName: "Inactif" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runInactiveUserReengagement();
    expect(result.sent).toBe(1);
    expect(mockPrisma.aiAutonomyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: "REENGAGEMENT" }),
      }),
    );
  });

  it("skips user already re-engaged this month", async () => {
    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: userId, email: "re@test.com", profile: { displayName: "Re" } },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue({ id: "exists" }); // already sent

    const result = await runInactiveUserReengagement();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ══════════════════════════════════════════════
// WELCOME FLOW
// ══════════════════════════════════════════════

describe("runWelcomeFlow", () => {
  beforeEach(resetAllMocks);

  it("sends welcome to new users without activity", async () => {
    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: userId, email: "new@test.com", profile: { displayName: "Nouveau" }, role: "USER" },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "new@test.com",
      profile: { displayName: "Nouveau" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runWelcomeFlow();
    expect(result.sent).toBe(1);
    expect(mockPrisma.aiAutonomyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: "WELCOME_FLOW" }),
      }),
    );
  });

  it("sends seller-specific welcome to sellers", async () => {
    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: userId, email: "seller@test.com", profile: { displayName: "Vendeur" }, role: "BUSINESS" },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "seller@test.com",
      profile: { displayName: "Vendeur" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runWelcomeFlow();
    expect(result.sent).toBe(1);
    // Verify email includes seller-specific content
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Publiez votre première annonce"),
      }),
    );
  });

  it("skips users already welcomed", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: fakeId(), email: "re@test.com", profile: { displayName: "Re" }, role: "USER" },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue({ id: "exists" });

    const result = await runWelcomeFlow();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ══════════════════════════════════════════════
// FIRST SALE CONGRATS
// ══════════════════════════════════════════════

describe("runFirstSaleCongrats", () => {
  beforeEach(resetAllMocks);

  it("sends congrats for first sale", async () => {
    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: userId, profile: { displayName: "Vendeur" }, _count: { sellerOrders: 1 } },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "seller@test.com",
      profile: { displayName: "Vendeur" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runFirstSaleCongrats();
    expect(result.sent).toBe(1);
    expect(mockPrisma.aiAutonomyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionType: "FIRST_SALE_CONGRATS" }),
      }),
    );
  });

  it("skips sellers with more than 2 orders", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: fakeId(), profile: { displayName: "Veteran" }, _count: { sellerOrders: 5 } },
    ]);

    const result = await runFirstSaleCongrats();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ══════════════════════════════════════════════
// WEEKLY DIGEST
// ══════════════════════════════════════════════

describe("runWeeklyDigest", () => {
  beforeEach(resetAllMocks);

  it("returns 0 if not Sunday", async () => {
    // If today is not Sunday, should skip
    const today = new Date().getDay();
    if (today !== 0) {
      const result = await runWeeklyDigest();
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });

  it("would send digest on Sunday (mock day)", async () => {
    // This test validates the function structure works with mock data
    // Actual Sunday check is tested above
    const spy = vi.spyOn(Date.prototype, "getDay").mockReturnValue(0);

    const userId = fakeId();
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: userId,
        profile: { displayName: "Vendeur" },
        listings: [{ id: "l1" }, { id: "l2" }],
        sellerOrders: [{ id: "o1", totalPriceCents: 5000 }],
      },
    ]);
    mockPrisma.aiAutonomyLog.findFirst.mockResolvedValue(null);
    mockPrisma.aiAutonomyLog.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: "seller@test.com",
      profile: { displayName: "Vendeur" },
    });
    mockPrisma.aiAutonomyLog.create.mockResolvedValue({});

    const result = await runWeeklyDigest();
    expect(result.sent).toBe(1);

    spy.mockRestore();
  });
});

// ══════════════════════════════════════════════
// SCHEDULER STATS
// ══════════════════════════════════════════════

describe("getMessengerSchedulerStats", () => {
  beforeEach(resetAllMocks);

  it("returns structured stats", async () => {
    mockPrisma.aiAutonomyLog.groupBy
      .mockResolvedValueOnce([
        { actionType: "COUPON_EXPIRY_REMINDER", _count: 5 },
        { actionType: "WELCOME_FLOW", _count: 3 },
      ])
      .mockResolvedValueOnce([
        { actionType: "COUPON_EXPIRY_REMINDER", _count: 15 },
        { actionType: "WELCOME_FLOW", _count: 8 },
        { actionType: "REENGAGEMENT", _count: 12 },
      ]);

    const stats = await getMessengerSchedulerStats();
    expect(stats.last24h.couponReminders).toBe(5);
    expect(stats.last24h.welcomeFlow).toBe(3);
    expect(stats.last24h.total).toBe(8);
    expect(stats.last7d.total).toBe(35);
    expect(stats.last7d.byType).toHaveProperty("COUPON_EXPIRY_REMINDER");
  });
});
