import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AudioRoute = "earpiece" | "speaker" | "bluetooth" | "wired";

export interface RoutesPayload {
  current: AudioRoute;
  available: AudioRoute[];
}

interface AudioRoutePlugin {
  setEarpiece(): Promise<{ mode: string }>;
  setSpeaker(): Promise<{ mode: string }>;
  getRoute(): Promise<{ mode: string; speakerOn: boolean }>;
  reset(): Promise<{ mode: string }>;
  /** Étape 5 — routage explicite avec fallback */
  setRoute(options: { route: AudioRoute }): Promise<{ mode: AudioRoute; requested?: AudioRoute; fallback: boolean }>;
  /** Étape 5 — routes disponibles */
  getRoutes(): Promise<RoutesPayload>;
  addListener(
    eventName: "routesChanged",
    listenerFunc: (payload: RoutesPayload) => void,
  ): Promise<PluginListenerHandle>;
}

const AudioRoute = registerPlugin<AudioRoutePlugin>("AudioRoute");

const isNative = Capacitor.isNativePlatform();

/** Route audio to earpiece + activate proximity sensor (compat) */
export async function setEarpiece(): Promise<void> {
  if (!isNative) return;
  try { await AudioRoute.setEarpiece(); } catch { /* ignore */ }
}

/** Route audio to loudspeaker (compat) */
export async function setSpeaker(): Promise<void> {
  if (!isNative) return;
  try { await AudioRoute.setSpeaker(); } catch { /* ignore */ }
}

/** Get current audio route (compat) */
export async function getAudioRoute(): Promise<AudioRoute> {
  if (!isNative) return "speaker";
  try {
    const r = await AudioRoute.getRoute();
    const mode = r.mode as string;
    if (mode === "earpiece" || mode === "speaker" || mode === "bluetooth" || mode === "wired") return mode;
    return "earpiece";
  } catch {
    return "earpiece";
  }
}

/** Reset audio to normal (call ended) */
export async function resetAudioRoute(): Promise<void> {
  if (!isNative) return;
  try { await AudioRoute.reset(); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────
// Étape 5 — API étendue
// ─────────────────────────────────────────────────────────────────────

/**
 * Liste les routes audio disponibles + la route courante.
 * Sur Web non natif : earpiece n'est pas un concept exposé par les browsers,
 * on retourne juste { current: "speaker", available: ["speaker"] } pour ne
 * pas mentir à l'UI.
 */
export async function getAudioRoutes(): Promise<RoutesPayload> {
  if (!isNative) {
    return { current: "speaker", available: ["speaker"] };
  }
  try {
    const payload = await AudioRoute.getRoutes();
    return {
      current: normalizeRoute(payload.current) ?? "earpiece",
      available: (payload.available ?? [])
        .map(normalizeRoute)
        .filter((r): r is AudioRoute => r !== null),
    };
  } catch {
    return { current: "earpiece", available: ["earpiece", "speaker"] };
  }
}

/**
 * Force une route audio. Si BT demandé sans device disponible, le plugin
 * Android fait fallback vers earpiece et retourne fallback=true.
 * Web non natif : no-op silencieux (pas d'API navigateur fiable pour ça).
 */
export async function setAudioRoute(route: AudioRoute): Promise<{ mode: AudioRoute; requested: AudioRoute; fallback: boolean }> {
  if (!isNative) return { mode: route, requested: route, fallback: false };
  try {
    const r = await AudioRoute.setRoute({ route });
    const effective = normalizeRoute(r.mode) ?? "earpiece";
    return {
      mode: effective,
      requested: route,
      fallback: Boolean(r.fallback) || effective !== route,
    };
  } catch {
    return { mode: route, requested: route, fallback: false };
  }
}

/** S'abonne aux changements de routes (BT plug/unplug). No-op sur Web. */
export async function addAudioRouteListener(
  cb: (payload: RoutesPayload) => void,
): Promise<() => void> {
  if (!isNative) return () => { /* no-op */ };
  try {
    const handle = await AudioRoute.addListener("routesChanged", (payload) => {
      cb({
        current: normalizeRoute(payload.current) ?? "earpiece",
        available: (payload.available ?? [])
          .map(normalizeRoute)
          .filter((r): r is AudioRoute => r !== null),
      });
    });
    return () => { try { handle.remove(); } catch { /* ignore */ } };
  } catch {
    return () => { /* ignore */ };
  }
}

function normalizeRoute(value: unknown): AudioRoute | null {
  if (value === "earpiece" || value === "speaker" || value === "bluetooth" || value === "wired") return value;
  return null;
}

