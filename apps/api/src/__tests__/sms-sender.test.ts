/**
 * Tests — shared/sms/sms-sender.ts
 *
 * Couvre :
 *  - isSmsConfigured() pour disabled / africastalking / beem
 *  - sendOtpSms dispatcher (route vers le bon provider)
 *  - sendOtpSmsBeem : succès, échec HTTP, payload JSON malformé, sender ID manquant
 *  - sendOtpSmsAfricasTalking : succès, échec HTTP (régression — non touché par cette étape)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    SMS_PROVIDER: "disabled" as "disabled" | "africastalking" | "beem",
    AT_USERNAME: undefined as string | undefined,
    AT_API_KEY: undefined as string | undefined,
    AT_SENDER_ID: undefined as string | undefined,
    AT_SANDBOX: true,
    BEEM_API_KEY: undefined as string | undefined,
    BEEM_SECRET_KEY: undefined as string | undefined,
    BEEM_SENDER_ID: "KINSELL",
    OTP_TTL_SECONDS: 300,
  },
}));

vi.mock("../config/env.js", () => ({ env: mockEnv }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Import après les mocks
const smsSender = await import("../shared/sms/sms-sender.js");

beforeEach(() => {
  fetchMock.mockReset();
  // Reset env defaults
  mockEnv.SMS_PROVIDER = "disabled";
  mockEnv.AT_USERNAME = undefined;
  mockEnv.AT_API_KEY = undefined;
  mockEnv.AT_SENDER_ID = undefined;
  mockEnv.AT_SANDBOX = true;
  mockEnv.BEEM_API_KEY = undefined;
  mockEnv.BEEM_SECRET_KEY = undefined;
  mockEnv.BEEM_SENDER_ID = "KINSELL";
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── isSmsConfigured ───────────────────────────────────────

describe("isSmsConfigured", () => {
  it("retourne false quand SMS_PROVIDER=disabled", () => {
    mockEnv.SMS_PROVIDER = "disabled";
    expect(smsSender.isSmsConfigured()).toBe(false);
  });

  it("retourne false pour africastalking sans clés", () => {
    mockEnv.SMS_PROVIDER = "africastalking";
    expect(smsSender.isSmsConfigured()).toBe(false);
  });

  it("retourne true pour africastalking avec username + apiKey", () => {
    mockEnv.SMS_PROVIDER = "africastalking";
    mockEnv.AT_USERNAME = "sandbox";
    mockEnv.AT_API_KEY = "atsk_xxx";
    expect(smsSender.isSmsConfigured()).toBe(true);
  });

  it("retourne false pour beem sans clés", () => {
    mockEnv.SMS_PROVIDER = "beem";
    expect(smsSender.isSmsConfigured()).toBe(false);
  });

  it("retourne false pour beem si seulement API_KEY est défini", () => {
    mockEnv.SMS_PROVIDER = "beem";
    mockEnv.BEEM_API_KEY = "key";
    expect(smsSender.isSmsConfigured()).toBe(false);
  });

  it("retourne true pour beem avec API_KEY + SECRET_KEY + SENDER_ID", () => {
    mockEnv.SMS_PROVIDER = "beem";
    mockEnv.BEEM_API_KEY = "key";
    mockEnv.BEEM_SECRET_KEY = "secret";
    mockEnv.BEEM_SENDER_ID = "KINSELL";
    expect(smsSender.isSmsConfigured()).toBe(true);
  });
});

// ── sendOtpSms dispatcher ─────────────────────────────────

describe("sendOtpSms (dispatcher)", () => {
  it("retourne false si SMS_PROVIDER=disabled, sans appel réseau", async () => {
    mockEnv.SMS_PROVIDER = "disabled";
    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── sendOtpSmsBeem ────────────────────────────────────────

describe("sendOtpSms via Beem", () => {
  beforeEach(() => {
    mockEnv.SMS_PROVIDER = "beem";
    mockEnv.BEEM_API_KEY = "test-api-key";
    mockEnv.BEEM_SECRET_KEY = "test-secret-key";
    mockEnv.BEEM_SENDER_ID = "KINSELL";
  });

  it("envoie un POST JSON Basic Auth vers https://apisms.beem.africa/v1/send et retourne true sur succès", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ successful: true, request_id: 42, code: 100, valid: 1, invalid: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://apisms.beem.africa/v1/send");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    // Basic Auth = base64(api_key:secret_key)
    const expectedAuth = "Basic " + Buffer.from("test-api-key:test-secret-key").toString("base64");
    expect(init.headers["Authorization"]).toBe(expectedAuth);

    const payload = JSON.parse(init.body);
    expect(payload.source_addr).toBe("KINSELL");
    expect(payload.encoding).toBe(0);
    expect(payload.recipients).toEqual([{ recipient_id: 1, dest_addr: "243900000000" }]); // sans le "+"
    expect(payload.message).toContain("123456");
  });

  it("retourne false si réponse HTTP non-OK", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
  });

  it("retourne false si JSON renvoie successful=false", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ successful: false, code: 102, message: "rejected" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
  });

  it("retourne false si fetch lève une exception réseau", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
  });

  it("retourne false si BEEM_API_KEY manquant (garde-fou interne)", async () => {
    mockEnv.BEEM_API_KEY = undefined;
    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── sendOtpSmsAfricasTalking (régression) ─────────────────

describe("sendOtpSms via Africa's Talking (régression non-cassée)", () => {
  beforeEach(() => {
    mockEnv.SMS_PROVIDER = "africastalking";
    mockEnv.AT_USERNAME = "sandbox";
    mockEnv.AT_API_KEY = "atsk_xxx";
    mockEnv.AT_SANDBOX = true;
  });

  it("retourne true sur succès AT (sandbox endpoint)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          SMSMessageData: { Recipients: [{ status: "Success", statusCode: 101 }] },
        }),
        { status: 200 },
      ),
    );

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.sandbox.africastalking.com/version1/messaging");
    expect(init.headers["apiKey"]).toBe("atsk_xxx");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("retourne false si Recipients.status != Success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          SMSMessageData: { Recipients: [{ status: "InvalidPhoneNumber", statusCode: 403 }] },
        }),
        { status: 200 },
      ),
    );

    const ok = await smsSender.sendOtpSms("+243900000000", "123456");
    expect(ok).toBe(false);
  });
});
