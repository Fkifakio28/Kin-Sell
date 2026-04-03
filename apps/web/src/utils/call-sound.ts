/**
 * Call Sound Manager — Kin-Sell V2
 *
 * Gère la sélection et lecture de sonnerie selon la connectivité réseau RÉELLE.
 *
 * Règle métier :
 * - Online  (accès internet vérifié par fetch réel) → kin_sell_ringtone_pro.wav
 * - Offline (aucun accès réseau)                    → kin_sell_ringtone.wav
 * - Unknown (état incertain / timeout)              → kin_sell_ringtone.wav (fallback sécurisé)
 *
 * La détection réseau utilise 3 niveaux :
 * 1. navigator.onLine (pré-filtre rapide, élimine les cas offline évidents)
 * 2. Network Information API (type, downlink — si disponible)
 * 3. Fetch HEAD réel vers l'API /health (seule preuve d'accès internet effectif)
 *
 * kin_sell_ringtone_pro ne sera JAMAIS joué sans confirmation d'accès internet réel.
 */

export type NetworkStatus = "online" | "offline" | "unknown";

const SOUND_OFFLINE = "/assets/sounds/kin_sell_ringtone.wav";
const SOUND_ONLINE = "/assets/sounds/kin_sell_ringtone_pro.wav";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "/api";
const CONNECTIVITY_TIMEOUT_MS = 3000;

const LOG_PREFIX = "[CallSound]";

/* ══════════════════════════════════════════════════════════
   1. Détection de connectivité réseau RÉELLE
   ══════════════════════════════════════════════════════════ */

/**
 * Vérifie l'état réel de la connectivité réseau en 3 niveaux.
 *
 * Niveau 1 — navigator.onLine :
 *   Si false → OFFLINE immédiat (fiable pour détecter l'absence totale de réseau).
 *
 * Niveau 2 — Network Information API :
 *   Si connection.type === "none" ou downlink === 0 → OFFLINE.
 *
 * Niveau 3 — Fetch HEAD vers API /health :
 *   Seule vérification qui prouve un accès internet réel.
 *   Timeout de 3s. Succès (2xx) → ONLINE. Échec/timeout → UNKNOWN.
 *
 * Retourne : "online" | "offline" | "unknown"
 * En cas d'erreur inattendue → "unknown"
 */
export async function checkRealNetworkStatus(): Promise<NetworkStatus> {
  try {
    // ── Niveau 1 : navigator.onLine ──
    if (!navigator.onLine) {
      console.debug(LOG_PREFIX, "Niveau 1 — navigator.onLine = false → OFFLINE");
      return "offline";
    }

    // ── Niveau 2 : Network Information API (Chrome, Edge, Android WebView) ──
    const conn = (navigator as any).connection;
    if (conn) {
      if (conn.type === "none") {
        console.debug(LOG_PREFIX, "Niveau 2 — connection.type = none → OFFLINE");
        return "offline";
      }
      if (typeof conn.downlink === "number" && conn.downlink === 0) {
        console.debug(LOG_PREFIX, "Niveau 2 — connection.downlink = 0 → OFFLINE");
        return "offline";
      }
      console.debug(
        LOG_PREFIX,
        `Niveau 2 — Network Info: effectiveType=${conn.effectiveType}, downlink=${conn.downlink}Mbps, rtt=${conn.rtt}ms`,
      );
    }

    // ── Niveau 3 : Fetch réel vers l'API ──
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (response.ok) {
        console.debug(LOG_PREFIX, "Niveau 3 — Fetch /health OK → ONLINE");
        return "online";
      }
      console.debug(LOG_PREFIX, `Niveau 3 — Fetch /health status ${response.status} → UNKNOWN`);
      return "unknown";
    } catch (fetchErr) {
      clearTimeout(timeout);
      const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
      console.debug(
        LOG_PREFIX,
        isAbort
          ? `Niveau 3 — Fetch /health timeout (${CONNECTIVITY_TIMEOUT_MS}ms) → UNKNOWN`
          : "Niveau 3 — Fetch /health échec réseau → UNKNOWN",
        fetchErr,
      );
      return "unknown";
    }
  } catch (err) {
    console.warn(LOG_PREFIX, "Erreur inattendue détection réseau → UNKNOWN", err);
    return "unknown";
  }
}

/* ══════════════════════════════════════════════════════════
   2. Sélection du fichier audio
   ══════════════════════════════════════════════════════════ */

/**
 * Retourne le chemin du fichier audio selon le statut réseau.
 *
 * - "online"  → kin_sell_ringtone_pro (expérience connectée / premium)
 * - "offline" → kin_sell_ringtone     (expérience hors ligne / standard)
 * - "unknown" → kin_sell_ringtone     (fallback sécurisé — jamais le son premium en cas de doute)
 */
export function getCallRingtoneByNetworkStatus(status: NetworkStatus): string {
  const sound = status === "online" ? SOUND_ONLINE : SOUND_OFFLINE;
  console.debug(LOG_PREFIX, `Statut réseau: ${status} → son: ${sound}`);
  return sound;
}

/* ══════════════════════════════════════════════════════════
   3. Lecture / arrêt de la sonnerie
   ══════════════════════════════════════════════════════════ */

let _currentAudio: HTMLAudioElement | null = null;
let _currentSrc: string | null = null;

/**
 * Lance la sonnerie d'appel (entrant ou sortant).
 *
 * 1. Vérifie la connectivité réseau réelle (async, max 3s)
 * 2. Sélectionne le fichier audio approprié
 * 3. Lance la lecture en boucle (loop, volume 0.85)
 *
 * Protections :
 * - Si le même son est déjà en lecture → skip (pas de double lecture)
 * - Si un autre son tourne → arrêt propre avant switch
 * - Si la lecture est bloquée (autoplay policy) → log warning
 *
 * @param direction "incoming" | "outgoing" — pour les logs de debug
 */
export async function playCallSound(direction: "incoming" | "outgoing"): Promise<void> {
  const status = await checkRealNetworkStatus();
  const soundSrc = getCallRingtoneByNetworkStatus(status);

  console.debug(
    LOG_PREFIX,
    `▶ Lecture sonnerie — direction: ${direction}, réseau: ${status}, fichier: ${soundSrc}`,
  );

  // Si le même son est déjà en cours, ne pas relancer
  if (_currentAudio && _currentSrc === soundSrc && !_currentAudio.paused) {
    console.debug(LOG_PREFIX, "Son déjà en lecture, skip");
    return;
  }

  // Arrêter le son précédent s'il y en a un
  stopCallSound();

  try {
    const audio = new Audio(soundSrc);
    audio.loop = true;
    audio.volume = 0.85;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.warn(LOG_PREFIX, "Lecture audio bloquée (autoplay policy):", err.message);
      });
    }

    _currentAudio = audio;
    _currentSrc = soundSrc;
  } catch (err) {
    console.error(LOG_PREFIX, "Erreur création Audio:", err);
  }
}

/**
 * Arrête la sonnerie en cours et libère les ressources audio.
 */
export function stopCallSound(): void {
  if (_currentAudio) {
    console.debug(LOG_PREFIX, "⏹ Arrêt sonnerie");
    try {
      _currentAudio.pause();
      _currentAudio.currentTime = 0;
      _currentAudio.src = "";
    } catch { /* ignore */ }
    _currentAudio = null;
    _currentSrc = null;
  }
}

/**
 * Revérifie la connectivité et change le son si nécessaire.
 * À appeler sur événements "online"/"offline" pendant le ringing.
 */
export async function refreshCallSoundIfNeeded(direction: "incoming" | "outgoing"): Promise<void> {
  if (!_currentAudio) return;

  const status = await checkRealNetworkStatus();
  const newSrc = getCallRingtoneByNetworkStatus(status);

  if (newSrc === _currentSrc) return;

  console.debug(LOG_PREFIX, `🔄 Changement réseau détecté — switch de ${_currentSrc} vers: ${newSrc}`);
  await playCallSound(direction);
}
