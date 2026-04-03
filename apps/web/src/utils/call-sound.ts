/**
 * Call Sound Manager — Kin-Sell
 *
 * Gère la sélection et lecture de sonnerie selon la connectivité réseau.
 *
 * Règle métier :
 * - Online  (Wi-Fi / données mobiles avec accès réel) → kin_sell_ringtone_pro.wav
 * - Offline (aucun accès réseau réel)                 → kin_sell_ringtone.wav
 * - Erreur de détection                               → fallback kin_sell_ringtone.wav
 *
 * Fonctionne pour appels entrants ET sortants.
 */

const SOUND_OFFLINE = "/assets/sounds/kin_sell_ringtone.wav";
const SOUND_ONLINE = "/assets/sounds/kin_sell_ringtone_pro.wav";

const LOG_PREFIX = "[CallSound]";

/* ══════════════════════════════════════════════════════════
   1. Détection de connectivité réseau
   ══════════════════════════════════════════════════════════ */

/**
 * Détermine si l'appareil a un accès réseau réel.
 *
 * Combine `navigator.onLine` + Network Information API (si dispo)
 * pour un résultat plus fiable qu'un simple check booléen.
 */
export function checkNetworkStatus(): boolean {
  try {
    // Vérification de base
    if (!navigator.onLine) {
      console.debug(LOG_PREFIX, "navigator.onLine = false → OFFLINE");
      return false;
    }

    // Network Information API (Chrome, Edge, Android WebView)
    const conn = (navigator as any).connection;
    if (conn) {
      // "none" signifie aucune connexion active
      if (conn.type === "none") {
        console.debug(LOG_PREFIX, "connection.type = none → OFFLINE");
        return false;
      }
      // downlink = 0 → pas de bande passante réelle
      if (typeof conn.downlink === "number" && conn.downlink === 0) {
        console.debug(LOG_PREFIX, "connection.downlink = 0 → OFFLINE");
        return false;
      }
      // saveData mode → connexion très limitée, considérer comme "dégradée" mais online
      console.debug(
        LOG_PREFIX,
        `connection: type=${conn.effectiveType}, downlink=${conn.downlink}Mbps, rtt=${conn.rtt}ms → ONLINE`,
      );
    } else {
      console.debug(LOG_PREFIX, "navigator.onLine = true (pas de Network Info API) → ONLINE");
    }

    return true;
  } catch (err) {
    console.warn(LOG_PREFIX, "Erreur détection réseau → fallback OFFLINE", err);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════
   2. Sélection du fichier audio
   ══════════════════════════════════════════════════════════ */

/**
 * Retourne le chemin du fichier audio à jouer selon l'état réseau actuel.
 */
export function getCallSoundByNetworkStatus(): string {
  const isOnline = checkNetworkStatus();
  const sound = isOnline ? SOUND_ONLINE : SOUND_OFFLINE;

  console.debug(LOG_PREFIX, `Réseau: ${isOnline ? "ONLINE" : "OFFLINE"} → son: ${sound}`);

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
 * - Détermine le son selon la connectivité réseau au moment de l'appel.
 * - Loop activé pour que la sonnerie continue jusqu'à stopCallSound().
 * - Si la connectivité change, appeler cette fonction à nouveau pour switcher.
 *
 * @param direction  "incoming" | "outgoing" — pour le log uniquement
 */
export function playCallSound(direction: "incoming" | "outgoing"): void {
  const soundSrc = getCallSoundByNetworkStatus();

  console.debug(LOG_PREFIX, `▶ Lecture sonnerie — direction: ${direction}, fichier: ${soundSrc}`);

  // Si le même son est déjà en cours, ne pas relancer
  if (_currentAudio && _currentSrc === soundSrc && !_currentAudio.paused) {
    console.debug(LOG_PREFIX, "Son déjà en lecture, skip");
    return;
  }

  // Arrêter le son précédent s'il y en a un (changement de fichier)
  stopCallSound();

  try {
    const audio = new Audio(soundSrc);
    audio.loop = true;
    audio.volume = 0.85;

    // Tentative de lecture (peut échouer si pas d'interaction utilisateur)
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
 * Arrête la sonnerie en cours.
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
 * Met à jour le son en cours si la connectivité a changé.
 * Appeler lors d'un event "online"/"offline" pendant un appel ringing.
 */
export function refreshCallSoundIfNeeded(direction: "incoming" | "outgoing"): void {
  if (!_currentAudio) return; // Pas de sonnerie en cours

  const newSrc = getCallSoundByNetworkStatus();
  if (newSrc === _currentSrc) return; // Même son, rien à changer

  console.debug(LOG_PREFIX, `🔄 Changement réseau détecté — switch vers: ${newSrc}`);
  playCallSound(direction);
}
