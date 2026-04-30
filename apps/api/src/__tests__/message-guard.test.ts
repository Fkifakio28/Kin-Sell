/**
 * Tests — Message Guard Engines (pure functions)
 *
 * Teste les moteurs purs (normalize, detectPatterns, assessRisk)
 * sans dépendance Prisma.
 */

import { describe, it, expect } from "vitest";
import { normalize, extractDigitSequence, findPlatformMentions } from "../modules/message-guard/normalizer.js";
import { detectPatterns } from "../modules/message-guard/pattern-engine.js";
import { assessRisk, type RiskAssessment } from "../modules/message-guard/risk-engine.js";

// ════════════════════════════════════════════════════════════
// NORMALIZER
// ════════════════════════════════════════════════════════════

describe("normalize()", () => {
  it("passe en minuscules et supprime les accents", () => {
    expect(normalize("SALUT l'Éléphant")).toBe("salut l'elephant");
  });

  it("retourne vide pour chaîne vide", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });

  it("convertit mots-nombres en chiffres (français)", () => {
    const result = normalize("J'ai zéro quatre-vingt-dix trois");
    expect(result).toContain("0");
    expect(result).toContain("90");
    expect(result).toContain("3");
  });

  it("convertit termes en symboles (arobase, point)", () => {
    const result = normalize("écris moi arobase gmail point com");
    expect(result).toContain("@");
    expect(result).toContain(".");
  });

  it("réduit les espaces multiples", () => {
    const result = normalize("salut    comment   ça   va");
    expect(result).not.toContain("  ");
  });

  it("supprime les caractères de bruit (*, |, ~)", () => {
    const result = normalize("a*p*p*e*l*e *moi");
    expect(result).not.toContain("*");
  });
});

describe("extractDigitSequence()", () => {
  it("extrait les chiffres d'un texte", () => {
    expect(extractDigitSequence("mon num: +243 812 345 678")).toBe("+243812345678");
  });

  it("retourne vide si aucun chiffre", () => {
    expect(extractDigitSequence("aucun chiffre ici")).toBe("");
  });
});

describe("findPlatformMentions()", () => {
  it("détecte whatsapp et ses variantes", () => {
    expect(findPlatformMentions("contactez moi sur watsap")).toContain("whatsapp");
    expect(findPlatformMentions("envoie sur wa")).toContain("whatsapp");
  });

  it("détecte telegram et ses variantes", () => {
    expect(findPlatformMentions("mon telegram est")).toContain("telegram");
  });

  it("détecte instagram", () => {
    expect(findPlatformMentions("mon insta est @test")).toContain("instagram");
  });

  it("retourne un tableau vide si aucune plateforme mentionnée", () => {
    expect(findPlatformMentions("je vends des chaussures")).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════
// PATTERN ENGINE
// ════════════════════════════════════════════════════════════

describe("detectPatterns()", () => {
  it("détecte un numéro international (+243)", () => {
    const result = detectPatterns("+243812345678", "+243812345678");
    expect(result.some(r => r.type === "PHONE")).toBe(true);
  });

  it("détecte un email", () => {
    const result = detectPatterns("ecris moi test@gmail.com vite", "Ecris moi test@gmail.com vite");
    expect(result.some(r => r.type === "EMAIL")).toBe(true);
  });

  it("détecte une URL", () => {
    const result = detectPatterns("va sur https://evil.com/pay", "Va sur https://evil.com/pay");
    expect(result.some(r => r.type === "URL")).toBe(true);
  });

  it("détecte un handle social (@username)", () => {
    const result = detectPatterns("mon instagram cest @johndoe", "Mon Instagram cest @JohnDoe");
    expect(result.some(r => r.type === "SOCIAL_HANDLE")).toBe(true);
  });

  it("ne détecte rien pour un message normal", () => {
    const result = detectPatterns("bonjour je veux acheter cet article svp", "Bonjour je veux acheter cet article svp");
    expect(result).toHaveLength(0);
  });

  it("détecte un numéro local congolais (0812)", () => {
    const result = detectPatterns("appelle moi 0812345678", "Appelle moi 0812345678");
    expect(result.some(r => r.type === "PHONE")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// RISK ENGINE
// ════════════════════════════════════════════════════════════

describe("assessRisk()", () => {
  const defaultContext = {
    isTransactional: false,
    userTrustScore: 50,
    recentViolations: 0,
  };

  it("aucune détection → ALLOWED, score 0", () => {
    const result = assessRisk([], [], [], [], defaultContext);
    expect(result.verdict).toBe("ALLOWED");
    expect(result.score).toBe(0);
  });

  it("un téléphone détecté → score élevé (WARNED ou BLOCKED)", () => {
    const patterns = [{ type: "PHONE" as const, matched: "+243812345678", confidence: 0.95 }];
    const result = assessRisk(patterns, [], [], [], defaultContext);
    expect(result.score).toBeGreaterThan(0);
    expect(["WARNED", "BLOCKED"]).toContain(result.verdict);
    expect(result.categories).toContain("PHONE_NUMBER");
  });

  it("email détecté → inclut la catégorie EMAIL", () => {
    const patterns = [{ type: "EMAIL" as const, matched: "test@gmail.com", confidence: 0.95 }];
    const result = assessRisk(patterns, [], [], [], defaultContext);
    expect(result.categories).toContain("EMAIL");
  });

  it("multiples détections augmentent le score", () => {
    const patterns = [
      { type: "PHONE" as const, matched: "+243812345678", confidence: 0.95 },
      { type: "EMAIL" as const, matched: "test@gmail.com", confidence: 0.95 },
    ];
    const singleResult = assessRisk(
      [{ type: "PHONE" as const, matched: "+243812345678", confidence: 0.95 }],
      [], [], [], defaultContext,
    );
    const multiResult = assessRisk(patterns, [], [], [], defaultContext);
    expect(multiResult.score).toBeGreaterThanOrEqual(singleResult.score);
  });

  it("violations récentes multiplient le score", () => {
    const patterns = [{ type: "PHONE" as const, matched: "+243812345678", confidence: 0.95 }];
    const clean = assessRisk(patterns, [], [], [], { ...defaultContext, recentViolations: 0 });
    const repeat = assessRisk(patterns, [], [], [], { ...defaultContext, recentViolations: 5 });
    expect(repeat.score).toBeGreaterThanOrEqual(clean.score);
  });

  it("contexte transactionnel augmente le risque", () => {
    const intents = [{ type: "OFF_PLATFORM_PAYMENT" as const, matched: "paye moi par mpesa", confidence: 0.8 }];
    const nonTx = assessRisk([], [], intents, [], { ...defaultContext, isTransactional: false });
    const tx = assessRisk([], [], intents, [], { ...defaultContext, isTransactional: true });
    expect(tx.score).toBeGreaterThanOrEqual(nonTx.score);
  });

  it("warningMessage est non-null pour WARNED/BLOCKED", () => {
    const patterns = [{ type: "PHONE" as const, matched: "+243812345678", confidence: 0.95 }];
    const result = assessRisk(patterns, [], [], [], defaultContext);
    if (result.verdict !== "ALLOWED") {
      expect(result.warningMessage).toBeTruthy();
    }
  });
});
