/**
 * Tests — identity-normalizers.ts
 *
 * Tests purs : normalizeEmail, normalizePhone, slugifyUsername.
 */

import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone, slugifyUsername } from "../shared/utils/identity-normalizers.js";

describe("normalizeEmail()", () => {
  it("convertit en lowercase", () => {
    expect(normalizeEmail("Test@Example.COM")).toBe("test@example.com");
  });

  it("trim les espaces", () => {
    expect(normalizeEmail("  user@test.com  ")).toBe("user@test.com");
  });

  it("gère un email déjà normalisé", () => {
    expect(normalizeEmail("already@normal.com")).toBe("already@normal.com");
  });
});

describe("normalizePhone()", () => {
  it("normalise un numéro international congolais", () => {
    expect(normalizePhone("+243 812 345 678")).toBe("+243812345678");
  });

  it("supprime les parenthèses et tirets", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("rejette un numéro sans préfixe international", () => {
    expect(() => normalizePhone("0812345678")).toThrow("format international");
  });

  it("rejette un numéro trop court", () => {
    expect(() => normalizePhone("+243123")).toThrow("invalide");
  });

  it("rejette un numéro trop long", () => {
    expect(() => normalizePhone("+2431234567890123456")).toThrow("invalide");
  });

  it("rejette un numéro avec des lettres", () => {
    expect(() => normalizePhone("+243abc")).toThrow("invalide");
  });
});

describe("slugifyUsername()", () => {
  it("convertit en slug basique", () => {
    expect(slugifyUsername("John Doe")).toBe("john-doe");
  });

  it("supprime les accents", () => {
    expect(slugifyUsername("Fulgençe Kifakio")).toBe("fulgence-kifakio");
  });

  it("supprime les caractères spéciaux", () => {
    expect(slugifyUsername("user@#$%!name")).toBe("user-name");
  });

  it("supprime les tirets en début et fin", () => {
    expect(slugifyUsername("--test--")).toBe("test");
  });

  it("tronque à 30 caractères", () => {
    const longName = "a".repeat(50);
    expect(slugifyUsername(longName).length).toBeLessThanOrEqual(30);
  });

  it("gère une chaîne vide", () => {
    expect(slugifyUsername("")).toBe("");
  });
});
