import { Capacitor } from "@capacitor/core";

/**
 * CallSoundManager — Kin-Sell V2
 *
 * Gestionnaire audio CENTRALISÉ pour tous les sons de l'application.
 *
 * RÈGLES STRICTES :
 * - Un seul son joué à la fois — jamais de superposition
 * - Tout son précédent est stoppé avant le nouveau
 * - Les sons en boucle (incoming/outgoing) sont arrêtés dès changement d'état
 * - Volume système respecté
 * - Mute global possible
 *
 * Sons d'appel (7 fichiers) :
 *   incoming   → kinsell_incoming_call.wav      (boucle)
 *   outgoing   → kinsell_outgoing_call.wav      (boucle)
 *   connected  → kinsell_call_connected.wav     (une fois)
 *   declined   → kinsell_call_declined.wav      (une fois)
 *   unanswered → kinsell_call_unanswered.wav    (une fois)
 *   offline    → kinsell_user_offline.wav        (une fois)
 *   ended      → kinsell_call_ended.wav          (une fois)
 *
 * Sons UI (3 fichiers) :
 *   message    → kinsell_message.wav             (une fois)
 *   success    → kinsell_success.wav             (une fois)
 *   error      → kinsell_error.wav               (une fois)
 */

const LOG = "[SoundMgr]";

/* ══════════════════════════════════════════════════════════
   Chemins des fichiers audio
   ══════════════════════════════════════════════════════════ */

const SOUNDS = {
  // Appels
  incoming:   "/assets/sounds/call/kinsell_incoming_call.wav",
  outgoing:   "/assets/sounds/call/kinsell_outgoing_call.wav",
  connected:  "/assets/sounds/call/kinsell_call_connected.wav",
  declined:   "/assets/sounds/call/kinsell_call_declined.wav",
  unanswered: "/assets/sounds/call/kinsell_call_unanswered.wav",
  offline:    "/assets/sounds/call/kinsell_user_offline.wav",
  ended:      "/assets/sounds/call/kinsell_call_ended.wav",
  // UI
  message:    "/assets/sounds/ui/kinsell_message.wav",
  success:    "/assets/sounds/ui/kinsell_success.wav",
  error:      "/assets/sounds/ui/kinsell_error.wav",
} as const;

export type SoundName = keyof typeof SOUNDS;

/* ══════════════════════════════════════════════════════════
   État interne
   ══════════════════════════════════════════════════════════ */

let _current: HTMLAudioElement | null = null;
let _currentName: SoundName | null = null;
let _muted = false;

function useSystemSoundsOnly(): boolean {
  return Capacitor.isNativePlatform();
}

/* ══════════════════════════════════════════════════════════
   API publique
   ══════════════════════════════════════════════════════════ */

/**
 * Jouer un son. Arrête automatiquement tout son en cours.
 */
export function playSound(name: SoundName, loop = false, volume = 0.85): void {
  if (useSystemSoundsOnly()) {
    // On APK native, rely exclusively on Android notification channels.
    return;
  }

  if (_muted) {
    console.debug(LOG, `🔇 Muted — skip ${name}`);
    return;
  }

  // Même son déjà en lecture → skip
  if (_current && _currentName === name && !_current.paused) {
    console.debug(LOG, `▶ ${name} déjà en lecture, skip`);
    return;
  }

  // Stopper tout son précédent
  stopAll();

  try {
    const audio = new Audio(SOUNDS[name]);
    audio.loop = loop;
    audio.volume = volume;

    const p = audio.play();
    if (p) p.catch((e) => console.warn(LOG, `Autoplay bloqué (${name}):`, e.message));

    _current = audio;
    _currentName = name;
    console.debug(LOG, `▶ ${name}${loop ? " (boucle)" : ""}`);
  } catch (e) {
    console.error(LOG, `Erreur lecture ${name}:`, e);
  }
}

/**
 * Arrête tout son en cours et libère les ressources.
 */
export function stopAll(): void {
  if (_current) {
    console.debug(LOG, `⏹ Stop ${_currentName}`);
    try {
      _current.pause();
      _current.currentTime = 0;
      _current.src = "";
    } catch { /* ignore */ }
    _current = null;
    _currentName = null;
  }
}

/**
 * Retourne le nom du son actuellement en lecture, ou null.
 */
export function currentlyPlaying(): SoundName | null {
  if (_current && !_current.paused) return _currentName;
  return null;
}

/**
 * Active/désactive le mute global.
 */
export function setMuted(muted: boolean): void {
  _muted = muted;
  if (muted) stopAll();
  console.debug(LOG, muted ? "🔇 Muted" : "🔊 Unmuted");
}

export function isMuted(): boolean {
  return _muted;
}

/* ══════════════════════════════════════════════════════════
   Raccourcis — Sonneries (boucle)
   ══════════════════════════════════════════════════════════ */

export function playRingtone(direction: "incoming" | "outgoing"): void {
  playSound(direction, true);
}

export function stopRingtone(): void {
  if (_currentName === "incoming" || _currentName === "outgoing") {
    stopAll();
  }
}

/* ══════════════════════════════════════════════════════════
   Raccourcis — Tonalités d'événement (une seule lecture)
   ══════════════════════════════════════════════════════════ */

export function playConnectedTone(): void  { playSound("connected"); }
export function playEndedTone(): void      { playSound("ended"); }
export function playCancelledTone(): void  { stopAll(); }
export function playDeclinedTone(): void   { playSound("declined"); }
export function playUnansweredTone(): void { playSound("unanswered"); }
export function playOfflineTone(): void    { playSound("offline"); }

/* ══════════════════════════════════════════════════════════
   Raccourcis — Sons UI
   ══════════════════════════════════════════════════════════ */

export function playMessageSound(): void   { playSound("message", false, 0.6); }
export function playSuccessSound(): void   { playSound("success", false, 0.6); }
export function playErrorSound(): void     { playSound("error", false, 0.6); }
