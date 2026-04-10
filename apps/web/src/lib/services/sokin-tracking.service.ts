/**
 * So-Kin Tracking — Client-side event collection & batching
 *
 * Collecte les événements So-Kin côté client et les envoie au backend
 * en batch toutes les 5 secondes (ou au unload de la page).
 *
 * Anti-spam intégré :
 * - Dédup locale : 1 VIEW par post par session
 * - IntersectionObserver : seuls les posts visibles ≥50% pendant 1s comptent
 * - Batch max 30 événements par requête
 */

import { API_BASE } from "../api-core";

// ── Types ──

export type SoKinTrackEvent =
  | "VIEW"
  | "COMMENT_OPEN"
  | "PROFILE_CLICK"
  | "LISTING_CLICK"
  | "CONTACT_CLICK"
  | "DM_OPEN";

interface TrackPayload {
  event: SoKinTrackEvent;
  postId: string;
  authorId: string;
  postType?: string;
  city?: string;
  country?: string;
  source?: string;
  meta?: Record<string, unknown>;
}

// ── Buffer & dédup ──

const buffer: TrackPayload[] = [];
const viewedPosts = new Set<string>(); // dédup vues par session
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 5_000; // 5 secondes
const MAX_BATCH = 30;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL);
}

async function flush() {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, MAX_BATCH);

  try {
    const token = localStorage.getItem("kin-sell.token");
    await fetch(`${API_BASE}/sokin/track`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true, // survit au unload
    });
  } catch {
    // Silencieux — tracking non critique
  }

  // S'il reste des événements dans le buffer
  if (buffer.length > 0) scheduleFlush();
}

// ── API publique ──

/**
 * Enregistre un événement de tracking.
 * Pour les VIEW, déduplique par postId dans la session courante.
 */
export function trackSoKinEvent(payload: TrackPayload): void {
  if (payload.event === "VIEW") {
    if (viewedPosts.has(payload.postId)) return;
    viewedPosts.add(payload.postId);
  }

  buffer.push(payload);
  scheduleFlush();
}

/**
 * Force l'envoi immédiat du buffer (appelé au unload).
 */
export function flushTracking(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

// ── IntersectionObserver pour les vues de posts ──

type PostMeta = {
  postId: string;
  authorId: string;
  postType?: string;
  city?: string;
  country?: string;
  source?: string;
};

const pendingTimers = new Map<Element, ReturnType<typeof setTimeout>>();
const observedMeta = new WeakMap<Element, PostMeta>();

const viewObserver: IntersectionObserver | null =
  typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              // Visible ≥50% — démarrer timer 1s
              if (!pendingTimers.has(entry.target)) {
                const timer = setTimeout(() => {
                  pendingTimers.delete(entry.target);
                  const meta = observedMeta.get(entry.target);
                  if (meta) {
                    trackSoKinEvent({ event: "VIEW", ...meta });
                  }
                }, 1000);
                pendingTimers.set(entry.target, timer);
              }
            } else {
              // Plus visible — annuler le timer
              const timer = pendingTimers.get(entry.target);
              if (timer) {
                clearTimeout(timer);
                pendingTimers.delete(entry.target);
              }
            }
          }
        },
        { threshold: 0.5 }
      )
    : null;

/**
 * Observer un élément de post pour tracking de vue.
 * Retourne une fonction cleanup pour le useEffect.
 */
export function observePostView(element: HTMLElement, meta: PostMeta): () => void {
  if (!viewObserver) return () => {};

  observedMeta.set(element, meta);
  viewObserver.observe(element);

  return () => {
    viewObserver.unobserve(element);
    observedMeta.delete(element);
    const timer = pendingTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(element);
    }
  };
}

// ── Flush au unload ──

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTracking();
  });
}
