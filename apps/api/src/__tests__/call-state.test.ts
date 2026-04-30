/**
 * Tests — call-state.ts (étape 2 callId/expiresAt)
 *
 * Couvre :
 * - validateAccept/Reject : callId requis, actif, receveur correct, non expiré
 * - validateEnd : caller ou receiver autorisés
 * - sweepOrphanCalls : ne dégrade jamais un appel accepté en NO_ANSWER
 * - terminateCall : nettoie timer + entry
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  activeCalls,
  activeCallTimers,
  validateAccept,
  validateReject,
  validateEnd,
  terminateCall,
  sweepOrphanCalls,
  resolveCallStateForUser,
  __resetCallState,
  CALL_TIMEOUT_MS,
  type ActiveCallEntry,
} from "../modules/messaging/call-state.js";

const makeEntry = (over: Partial<ActiveCallEntry> = {}): ActiveCallEntry => ({
  callId: "call-1",
  conversationId: "conv-1",
  callerUserId: "alice",
  receiverUserId: "bob",
  callType: "AUDIO",
  startedAt: Date.now(),
  expiresAt: Date.now() + CALL_TIMEOUT_MS,
  accepted: false,
  ended: false,
  ...over,
});

beforeEach(() => {
  __resetCallState();
});

describe("validateAccept()", () => {
  it("refuse callId absent ou non-string", () => {
    expect(validateAccept(undefined, "bob").ok).toBe(false);
    expect(validateAccept(null, "bob").ok).toBe(false);
    expect(validateAccept(42, "bob").ok).toBe(false);
    expect(validateAccept("", "bob").ok).toBe(false);
  });

  it("refuse callId trop long", () => {
    expect(validateAccept("a".repeat(65), "bob").ok).toBe(false);
  });

  it("refuse callId inconnu", () => {
    const r = validateAccept("ghost", "bob");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("call_not_found");
  });

  it("refuse si user n'est pas le receveur", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const r = validateAccept("c1", "alice"); // alice = caller
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_receiver");
  });

  it("refuse si appel expiré", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", expiresAt: Date.now() - 1 }));
    const r = validateAccept("c1", "bob");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("call_expired");
  });

  it("refuse si appel déjà terminé", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", ended: true }));
    const r = validateAccept("c1", "bob");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("call_terminal");
  });

  it("accepte un appel valide pour le receveur", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const r = validateAccept("c1", "bob");
    expect(r.ok).toBe(true);
  });
});

describe("validateEnd()", () => {
  it("refuse callId invalide", () => {
    expect(validateEnd(undefined, "bob").ok).toBe(false);
  });

  it("autorise le caller", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    expect(validateEnd("c1", "alice").ok).toBe(true);
  });

  it("autorise le receveur", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    expect(validateEnd("c1", "bob").ok).toBe(true);
  });

  it("refuse un user étranger", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const r = validateEnd("c1", "eve");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_participant");
  });
});

describe("validateReject()", () => {
  it("comportement identique à validateAccept (seul le receveur)", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    expect(validateReject("c1", "alice").ok).toBe(false);
    expect(validateReject("c1", "bob").ok).toBe(true);
  });
});

describe("Deux appels successifs même conversation", () => {
  it("le timeout de l'appel A ne touche pas l'appel B", () => {
    // Appel A terminé manuellement
    activeCalls.set("A", makeEntry({ callId: "A" }));
    activeCalls.set("B", makeEntry({ callId: "B", startedAt: Date.now() + 100 }));
    expect(validateAccept("A", "bob").ok).toBe(true);
    expect(validateAccept("B", "bob").ok).toBe(true);

    // Termine A
    terminateCall("A");
    // B doit rester valide
    expect(activeCalls.has("A")).toBe(false);
    expect(validateAccept("B", "bob").ok).toBe(true);
  });

  it("accept du callId A ne valide pas un call:end avec callId B", () => {
    activeCalls.set("A", makeEntry({ callId: "A", accepted: true }));
    // B n'existe pas
    expect(validateEnd("B", "alice").ok).toBe(false);
  });
});

describe("sweepOrphanCalls()", () => {
  it("ne purge JAMAIS un appel accepté", () => {
    activeCalls.set("c1", makeEntry({
      callId: "c1",
      accepted: true,
      expiresAt: Date.now() - 60_000,
    }));
    const purged = sweepOrphanCalls(Date.now());
    expect(purged).toEqual([]);
    expect(activeCalls.has("c1")).toBe(true);
  });

  it("ne purge pas un appel encore non expiré", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const purged = sweepOrphanCalls(Date.now());
    expect(purged).toEqual([]);
  });

  it("ne purge pas un appel encore armé d'un timer", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", expiresAt: Date.now() - 10_000 }));
    activeCallTimers.set("c1", setTimeout(() => {}, 100_000));
    const purged = sweepOrphanCalls(Date.now());
    expect(purged).toEqual([]);
    clearTimeout(activeCallTimers.get("c1")!);
  });

  it("purge un appel expiré + sans timer + non accepté", () => {
    activeCalls.set("c1", makeEntry({
      callId: "c1",
      expiresAt: Date.now() - 60_000,
    }));
    const purged = sweepOrphanCalls(Date.now());
    expect(purged).toEqual(["c1"]);
    expect(activeCalls.has("c1")).toBe(false);
  });
});

describe("terminateCall()", () => {
  it("nettoie l'entry et le timer", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    activeCallTimers.set("c1", setTimeout(() => {}, 100_000));
    const e = terminateCall("c1");
    expect(e?.callId).toBe("c1");
    expect(activeCalls.has("c1")).toBe(false);
    expect(activeCallTimers.has("c1")).toBe(false);
  });

  it("retourne null pour un callId inconnu", () => {
    expect(terminateCall("ghost")).toBeNull();
  });

  it("nettoie un appel ACCEPTÉ sans timer (cas disconnect après accept)", () => {
    // Après call:accept, le timer no-answer est supprimé mais l'entry reste
    // dans activeCalls jusqu'au call:end. Le handler disconnect doit pouvoir
    // la nettoyer en itérant sur activeCalls (pas activeCallTimers).
    activeCalls.set("c1", makeEntry({ callId: "c1", accepted: true }));
    expect(activeCallTimers.has("c1")).toBe(false);
    expect(activeCalls.has("c1")).toBe(true);

    const e = terminateCall("c1");
    expect(e?.accepted).toBe(true);
    expect(activeCalls.has("c1")).toBe(false);
  });

  it("disconnect-like sweep : itérer sur activeCalls trouve les appels acceptés", () => {
    activeCalls.set("A", makeEntry({ callId: "A", callerUserId: "alice", accepted: true }));
    activeCalls.set("B", makeEntry({ callId: "B", callerUserId: "carol", receiverUserId: "dave" }));

    // Simule la boucle du handler disconnect côté socket.ts pour userId=alice
    const userId = "alice";
    const toClean: string[] = [];
    for (const [callId, entry] of activeCalls.entries()) {
      if (entry.callerUserId === userId || entry.receiverUserId === userId) {
        toClean.push(callId);
      }
    }
    expect(toClean).toEqual(["A"]);
  });
});

// ════════════════════════════════════════════════════════════
// Étape 3 — resolveCallStateForUser (endpoint REST)
// ════════════════════════════════════════════════════════════

describe("resolveCallStateForUser()", () => {
  it("retourne kind=invalid si callId vide", () => {
    expect(resolveCallStateForUser("", "alice", null).kind).toBe("invalid");
  });

  it("retourne kind=invalid si callId trop long", () => {
    expect(resolveCallStateForUser("x".repeat(65), "alice", null).kind).toBe("invalid");
  });

  it("appel actif visible par caller → isActive true, RINGING", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const r = resolveCallStateForUser("c1", "alice", null);
    expect(r.kind).toBe("live");
    if (r.kind === "live") {
      expect(r.payload.isActive).toBe(true);
      expect(r.payload.status).toBe("RINGING");
      expect(r.payload.callType).toBe("audio");
    }
  });

  it("appel actif visible par receiver → isActive true", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    const r = resolveCallStateForUser("c1", "bob", null);
    expect(r.kind).toBe("live");
  });

  it("non participant → forbidden", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1" }));
    expect(resolveCallStateForUser("c1", "stranger", null).kind).toBe("forbidden");
  });

  it("appel expiré en mémoire → isActive false, EXPIRED", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", expiresAt: Date.now() - 1_000 }));
    const r = resolveCallStateForUser("c1", "alice", null);
    expect(r.kind).toBe("live");
    if (r.kind === "live") {
      expect(r.payload.isActive).toBe(false);
      expect(r.payload.status).toBe("EXPIRED");
    }
  });

  it("appel ended en mémoire → status=ENDED, isActive false", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", ended: true }));
    const r = resolveCallStateForUser("c1", "alice", null);
    expect(r.kind).toBe("live");
    if (r.kind === "live") {
      expect(r.payload.status).toBe("ENDED");
      expect(r.payload.isActive).toBe(false);
    }
  });

  it("appel accepté en mémoire → status=ACCEPTED, isActive false (pas d'injection incoming)", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", accepted: true }));
    const r = resolveCallStateForUser("c1", "alice", null);
    expect(r.kind).toBe("live");
    if (r.kind === "live") {
      expect(r.payload.status).toBe("ACCEPTED");
      expect(r.payload.isActive).toBe(false);
    }
  });

  it("ended prime sur accepted → status=ENDED", () => {
    activeCalls.set("c1", makeEntry({ callId: "c1", accepted: true, ended: true }));
    const r = resolveCallStateForUser("c1", "alice", null);
    if (r.kind === "live") {
      expect(r.payload.status).toBe("ENDED");
      expect(r.payload.isActive).toBe(false);
    }
  });

  it("absent en mémoire + log persisté participant → kind=log isActive false", () => {
    const r = resolveCallStateForUser("c1", "alice", {
      id: "c1",
      conversationId: "conv-1",
      callerUserId: "alice",
      receiverUserId: "bob",
      callType: "VIDEO",
      status: "ANSWERED",
    });
    expect(r.kind).toBe("log");
    if (r.kind === "log") {
      expect(r.payload.isActive).toBe(false);
      expect(r.payload.callType).toBe("video");
      expect(r.payload.status).toBe("ANSWERED");
    }
  });

  it("absent en mémoire + log persisté non-participant → forbidden", () => {
    const r = resolveCallStateForUser("c1", "stranger", {
      id: "c1",
      conversationId: "conv-1",
      callerUserId: "alice",
      receiverUserId: "bob",
      callType: "AUDIO",
      status: "MISSED",
    });
    expect(r.kind).toBe("forbidden");
  });

  it("absent en mémoire + log absent → not_found", () => {
    const r = resolveCallStateForUser("ghost", "alice", null);
    expect(r.kind).toBe("not_found");
  });
});
