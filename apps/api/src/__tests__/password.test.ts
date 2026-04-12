/**
 * Tests — password.ts (hashPassword, verifyPassword)
 *
 * Tests purs sans mocks — vérifie le hashing bcrypt.
 */

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../shared/auth/password.js";

describe("password hashing", () => {
  it("hash un mot de passe et le vérifie correctement", async () => {
    const password = "MySecurePassword123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("rejette un mot de passe incorrect", async () => {
    const hash = await hashPassword("CorrectPassword");
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produit des hashes différents pour le même mot de passe (salt)", async () => {
    const password = "SamePassword";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  it("hash vide ne plante pas", async () => {
    const hash = await hashPassword("");
    expect(hash).toBeTruthy();
    expect(await verifyPassword("", hash)).toBe(true);
    expect(await verifyPassword("something", hash)).toBe(false);
  });
});
