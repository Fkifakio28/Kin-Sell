/**
 * Tests — http-error.ts & error-handler.ts
 *
 * Vérifie la classe HttpError et le middleware error handler.
 */

import { describe, it, expect, vi } from "vitest";
import { HttpError } from "../shared/errors/http-error.js";

describe("HttpError", () => {
  it("crée une erreur avec statusCode et message", () => {
    const error = new HttpError(404, "Not found");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Not found");
    expect(error.name).toBe("HttpError");
  });

  it("fonctionne avec différents status codes", () => {
    const cases = [
      [400, "Bad request"],
      [401, "Unauthorized"],
      [403, "Forbidden"],
      [409, "Conflict"],
      [429, "Too many requests"],
      [500, "Internal error"],
    ] as const;

    for (const [code, msg] of cases) {
      const err = new HttpError(code, msg);
      expect(err.statusCode).toBe(code);
      expect(err.message).toBe(msg);
    }
  });

  it("est catchable comme une Error standard", () => {
    try {
      throw new HttpError(500, "Server error");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as HttpError).statusCode).toBe(500);
    }
  });
});

describe("errorHandler middleware", () => {
  // Mock logger avant import
  vi.mock("../shared/logger.js", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  }));

  it("renvoie le statusCode correct pour HttpError", async () => {
    const { errorHandler } = await import("../shared/errors/error-handler.js");
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const mockReq = { path: "/test", method: "GET" } as any;

    errorHandler(new HttpError(403, "Interdit"), mockReq, mockRes, vi.fn());

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Interdit" });
  });

  it("gère les erreurs Zod (400)", async () => {
    const { errorHandler } = await import("../shared/errors/error-handler.js");
    const { ZodError } = await import("zod");
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const mockReq = { path: "/test", method: "POST" } as any;

    const zodErr = new ZodError([
      { code: "too_small", minimum: 8, type: "string", inclusive: true, exact: false, message: "Too short", path: ["password"] },
    ]);

    errorHandler(zodErr, mockReq, mockRes, vi.fn());

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Donnees invalides",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "password" }),
        ]),
      }),
    );
  });

  it("renvoie 500 pour les erreurs inconnues", async () => {
    const { errorHandler } = await import("../shared/errors/error-handler.js");
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const mockReq = { path: "/test", method: "GET" } as any;

    errorHandler(new Error("unknown"), mockReq, mockRes, vi.fn());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Erreur interne serveur" });
  });
});
