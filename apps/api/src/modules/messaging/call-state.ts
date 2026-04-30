/**
 * call-state.ts — État serveur des appels actifs (étape 2 : callId + expiresAt).
 *
 * Indexation primaire par callId (= id du CallLog). Toute la validation des
 * événements socket call:accept/reject/end passe par ce module.
 */

export type ActiveCallEntry = {
  callId: string;
  conversationId: string;
  callerUserId: string;
  receiverUserId: string;
  callType: "AUDIO" | "VIDEO";
  startedAt: number;
  expiresAt: number;
  accepted: boolean;
  ended: boolean;
};

export const CALL_TIMEOUT_MS = 30_000;

/** callId → entry */
export const activeCalls = new Map<string, ActiveCallEntry>();
/** callId → server-side no-answer timer */
export const activeCallTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getActiveCall(callId: string | undefined | null): ActiveCallEntry | null {
  if (!callId || typeof callId !== "string") return null;
  return activeCalls.get(callId) ?? null;
}

export type ValidationResult =
  | { ok: true; entry: ActiveCallEntry }
  | { ok: false; reason: string };

/** Valide un call:accept — seul le receiver attendu peut accepter. */
export function validateAccept(callId: unknown, userId: string): ValidationResult {
  if (typeof callId !== "string" || callId.length === 0 || callId.length > 64) {
    return { ok: false, reason: "callId_invalid" };
  }
  const entry = activeCalls.get(callId);
  if (!entry) return { ok: false, reason: "call_not_found" };
  if (entry.ended) return { ok: false, reason: "call_terminal" };
  if (entry.expiresAt <= Date.now()) return { ok: false, reason: "call_expired" };
  if (entry.receiverUserId !== userId) return { ok: false, reason: "not_receiver" };
  return { ok: true, entry };
}

/** Valide un call:reject — seul le receiver attendu peut rejeter. */
export function validateReject(callId: unknown, userId: string): ValidationResult {
  return validateAccept(callId, userId);
}

/** Valide un call:end — caller OU receiver peuvent terminer. */
export function validateEnd(callId: unknown, userId: string): ValidationResult {
  if (typeof callId !== "string" || callId.length === 0 || callId.length > 64) {
    return { ok: false, reason: "callId_invalid" };
  }
  const entry = activeCalls.get(callId);
  if (!entry) return { ok: false, reason: "call_not_found" };
  if (entry.ended) return { ok: false, reason: "call_terminal" };
  if (entry.callerUserId !== userId && entry.receiverUserId !== userId) {
    return { ok: false, reason: "not_participant" };
  }
  return { ok: true, entry };
}

/** Marque un appel terminé et libère le timer. */
export function terminateCall(callId: string): ActiveCallEntry | null {
  const entry = activeCalls.get(callId);
  if (!entry) return null;
  entry.ended = true;
  const t = activeCallTimers.get(callId);
  if (t) {
    clearTimeout(t);
    activeCallTimers.delete(callId);
  }
  activeCalls.delete(callId);
  return entry;
}

/**
 * Sweep des appels orphelins :
 * - jamais d'appel accepté/terminé converti en NO_ANSWER ici (le timer
 *   s'en charge déjà) ;
 * - on supprime uniquement les entrées clairement expirées sans timer
 *   (cas d'un crash entre initiate et armement du timer).
 *
 * Retourne la liste des callIds purgés (logId à passer en NO_ANSWER côté
 * appelant si pertinent).
 */
export function sweepOrphanCalls(now: number = Date.now()): string[] {
  const purged: string[] = [];
  for (const [callId, entry] of activeCalls.entries()) {
    if (entry.accepted || entry.ended) continue;
    if (activeCallTimers.has(callId)) continue;
    if (entry.expiresAt + 5_000 > now) continue;
    activeCalls.delete(callId);
    purged.push(callId);
  }
  return purged;
}

/** Helpers de test — réinitialise tout l'état (à n'utiliser que dans les tests). */
export function __resetCallState() {
  for (const t of activeCallTimers.values()) clearTimeout(t);
  activeCallTimers.clear();
  activeCalls.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Étape 3 — résolution d'état pour l'endpoint REST
// ─────────────────────────────────────────────────────────────────────────────

export type CallStateResolution =
  | { kind: "invalid" }
  | { kind: "forbidden" }
  | { kind: "not_found"; now: number }
  | {
      kind: "live";
      now: number;
      payload: {
        callId: string;
        conversationId: string;
        callerUserId: string;
        receiverUserId: string;
        callType: "audio" | "video";
        status: "RINGING" | "ACCEPTED" | "EXPIRED" | "ENDED";
        isActive: boolean;
        expiresAt: number;
      };
    }
  | {
      kind: "log";
      now: number;
      payload: {
        callId: string;
        conversationId: string;
        callerUserId: string;
        receiverUserId: string;
        callType: "audio" | "video";
        status: string;
        isActive: false;
        expiresAt: null;
      };
    };

export type CallLogShape = {
  id: string;
  conversationId: string;
  callerUserId: string;
  receiverUserId: string;
  callType: "AUDIO" | "VIDEO";
  status: string;
};

/** Résout l'état d'un appel pour l'endpoint REST.
 *  Pure (modulo lecture de `activeCalls`). Les tests injectent le résultat
 *  du lookup CallLog persisté en argument pour rester sans IO. */
export function resolveCallStateForUser(
  callId: string,
  userId: string,
  persistedLog: CallLogShape | null,
  now: number = Date.now(),
): CallStateResolution {
  if (!callId || typeof callId !== "string" || callId.length > 64) {
    return { kind: "invalid" };
  }
  const live = activeCalls.get(callId);
  if (live) {
    if (live.callerUserId !== userId && live.receiverUserId !== userId) {
      return { kind: "forbidden" };
    }
    let status: "RINGING" | "ACCEPTED" | "EXPIRED" | "ENDED";
    if (live.ended) status = "ENDED";
    else if (live.accepted) status = "ACCEPTED";
    else if (live.expiresAt <= now) status = "EXPIRED";
    else status = "RINGING";
    // isActive = appel encore injectable comme "incoming" pour le receiver.
    // ACCEPTED/EXPIRED/ENDED ne doivent jamais ré-ouvrir une UI incoming.
    const isActive = status === "RINGING";
    return {
      kind: "live",
      now,
      payload: {
        callId: live.callId,
        conversationId: live.conversationId,
        callerUserId: live.callerUserId,
        receiverUserId: live.receiverUserId,
        callType: live.callType === "AUDIO" ? "audio" : "video",
        status,
        isActive,
        expiresAt: live.expiresAt,
      },
    };
  }
  if (!persistedLog) return { kind: "not_found", now };
  if (persistedLog.callerUserId !== userId && persistedLog.receiverUserId !== userId) {
    return { kind: "forbidden" };
  }
  return {
    kind: "log",
    now,
    payload: {
      callId: persistedLog.id,
      conversationId: persistedLog.conversationId,
      callerUserId: persistedLog.callerUserId,
      receiverUserId: persistedLog.receiverUserId,
      callType: persistedLog.callType === "AUDIO" ? "audio" : "video",
      status: persistedLog.status,
      isActive: false,
      expiresAt: null,
    },
  };
}
