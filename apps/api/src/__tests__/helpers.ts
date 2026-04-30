/**
 * Test helpers & mock factories — Kin-Sell API
 *
 * Centralise les mocks Prisma, Redis, Logger, et les helpers
 * pour éviter la duplication dans chaque fichier de test.
 */

import { vi } from "vitest";

// ── Mock Prisma ──────────────────────────────────────────

export function createMockPrisma() {
  const handler: ProxyHandler<Record<string, any>> = {
    get(_target, prop) {
      if (prop === "$transaction") {
        // If a custom $transaction override was set, use it
        if (_target._$transactionOverride) {
          return _target._$transactionOverride;
        }
        return vi.fn(async (fn: (tx: any) => any) => fn(new Proxy({}, handler)));
      }
      if (typeof prop === "string" && !prop.startsWith("_")) {
        if (!_target[prop as string]) {
          _target[prop as string] = {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            createMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
            count: vi.fn(),
            aggregate: vi.fn(),
            groupBy: vi.fn(),
          };
        }
        return _target[prop as string];
      }
      return undefined;
    },
  };
  return new Proxy({} as Record<string, any>, handler);
}

// ── Mock Logger ──────────────────────────────────────────

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// ── Mock Redis ───────────────────────────────────────────

export function createMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue("OK"),
    multi: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0], [null, 1], [null, 1], [null, 1]]),
    }),
    keys: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(0),
    ttl: vi.fn().mockResolvedValue(-1),
  };
}

// ── Fake data factories ──────────────────────────────────

let idCounter = 0;
export function fakeId(): string {
  return `test-id-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fakeUser(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? fakeId();
  return {
    id,
    email: `user-${id}@test.com`,
    passwordHash: "$2a$12$fakehashfakehashfakehashfakehashfakehashfakehash",
    role: "USER",
    accountStatus: "ACTIVE",
    emailVerified: false,
    suspensionReason: null,
    suspensionExpiresAt: null,
    profileCompleted: false,
    preferredAccountType: "USER",
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      displayName: `Test User ${id}`,
      username: `test-${id}`,
      avatarUrl: null,
      city: "Kinshasa",
      country: "CD",
      verificationStatus: "UNVERIFIED",
    },
    ...overrides,
  };
}

export function fakeListing(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? fakeId();
  return {
    id,
    type: "PRODUCT",
    title: `Test Listing ${id}`,
    description: "A test listing",
    category: "electronics",
    city: "Kinshasa",
    priceUsdCents: 5000,
    currency: "USD",
    imageUrl: null,
    mediaUrls: [],
    isNegotiable: true,
    stock: 10,
    status: "ACTIVE",
    ownerUserId: fakeId(),
    businessId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function fakeOrder(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? fakeId();
  return {
    id,
    status: "PENDING",
    currency: "USD",
    totalUsdCents: 10000,
    notes: null,
    buyerUserId: fakeId(),
    sellerUserId: fakeId(),
    sellerBusinessId: null,
    validationCode: "ABC123",
    createdAt: new Date(),
    confirmedAt: null,
    deliveredAt: null,
    canceledAt: null,
    ...overrides,
  };
}

export function fakeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? fakeId(),
    scope: "USER",
    userId: fakeId(),
    businessId: null,
    planCode: "FREE",
    status: "ACTIVE",
    billingCycle: "MONTHLY",
    priceUsdCents: 0,
    startsAt: new Date(),
    endsAt: null,
    autoRenew: false,
    metadata: {},
    addons: [],
    ...overrides,
  };
}
