/**
 * CallSoundManager — Kin-Sell V2
 *
 * Gestionnaire centralisé de tous les sons d'appel :
 *
 * 1. Sonneries (fichiers .wav existants, sélection par connectivité réseau)
 *    - outgoing_ringing : sonnerie en boucle (côté appelant)
 *    - incoming_ringing  : sonnerie en boucle (côté receveur)
 *
 * 2. Tonalités générées (Web Audio API — aucun fichier supplémentaire)
 *    - connected   : double bip ascendant court (confirmation de connexion)
 *    - ended       : bip descendant (appel terminé normalement)
 *    - cancelled   : bip simple court (appelant a annulé)
 *    - declined    : 3 bips courts rapides (appel refusé / occupé)
 *    - unanswered  : 3 bips espacés (pas de réponse — timeout)
 *
 * Ce module remplace call-sound.ts comme point d'entrée unique pour tous
 * les sons liés aux appels. Il réutilise la logique de détection réseau.
 */
import { checkRealNetworkStatus, getCallRingtoneByNetworkStatus } from "./call-sound";

const LOG = "[CallSoundMgr]";

// ── Singleton audio context (lazy) ───────────────────────────────────────────

let _ctx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  if (_ctx.state === "suspended") {
    void _ctx.resume();
  }
  return _ctx;
}

// ── Ringtone (file-based, looped) ────────────────────────────────────────────

let _ringtoneAudio: HTMLAudioElement | null = null;
let _ringtoneSrc: string | null = null;
let _networkListenerCleanup: (() => void) | null = null;

/**
 * Play the ringtone in loop. Selects online/offline variant based on real
 * network connectivity. Auto-switches if network status changes while ringing.
 */
export async function playRingtone(direction: "incoming" | "outgoing"): Promise<void> {
  const status = await checkRealNetworkStatus();
  const src = getCallRingtoneByNetworkStatus(status);
  console.debug(LOG, `▶ Ringtone ${direction} (réseau: ${status}) → ${src}`);

  // Already playing the same source
  if (_ringtoneAudio && _ringtoneSrc === src && !_ringtoneAudio.paused) return;

  stopRingtone();

  try {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.85;
    void audio.play().catch((e) => console.warn(LOG, "Autoplay bloqué:", e.message));
    _ringtoneAudio = audio;
    _ringtoneSrc = src;
  } catch (e) {
    console.error(LOG, "Erreur création Audio:", e);
  }

  // Listen for network changes and switch ringtone variant if needed
  const onNetChange = async () => {
    if (!_ringtoneAudio) return;
    const newStatus = await checkRealNetworkStatus();
    const newSrc = getCallRingtoneByNetworkStatus(newStatus);
    if (newSrc !== _ringtoneSrc) {
      console.debug(LOG, `🔄 Réseau changé → switch ${_ringtoneSrc} → ${newSrc}`);
      await playRingtone(direction);
    }
  };

  window.addEventListener("online", onNetChange);
  window.addEventListener("offline", onNetChange);
  _networkListenerCleanup = () => {
    window.removeEventListener("online", onNetChange);
    window.removeEventListener("offline", onNetChange);
  };
}

/**
 * Stop the ringtone and release resources.
 */
export function stopRingtone(): void {
  if (_ringtoneAudio) {
    console.debug(LOG, "⏹ Stop ringtone");
    try {
      _ringtoneAudio.pause();
      _ringtoneAudio.currentTime = 0;
      _ringtoneAudio.src = "";
    } catch { /* ignore */ }
    _ringtoneAudio = null;
    _ringtoneSrc = null;
  }
  if (_networkListenerCleanup) {
    _networkListenerCleanup();
    _networkListenerCleanup = null;
  }
}

// ── Tone generator (Web Audio API) ───────────────────────────────────────────

type ToneSpec = {
  frequency: number;
  duration: number;   // seconds
  type?: OscillatorType;
};

/**
 * Play a sequence of tones with optional gap between them.
 * Returns a promise that resolves when all tones have finished.
 */
function playToneSequence(
  tones: ToneSpec[],
  gap: number = 0.08, // seconds between tones
  volume: number = 0.35,
): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const ctx = getAudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);

      let offset = ctx.currentTime;
      for (const tone of tones) {
        const osc = ctx.createOscillator();
        osc.type = tone.type ?? "sine";
        osc.frequency.value = tone.frequency;
        osc.connect(gain);
        osc.start(offset);
        osc.stop(offset + tone.duration);
        offset += tone.duration + gap;
      }

      // Resolve after the full sequence + small buffer
      const totalDuration = (offset - ctx.currentTime + 0.05) * 1000;
      setTimeout(resolve, totalDuration);
    } catch (e) {
      console.warn(LOG, "Erreur Web Audio:", e);
      resolve();
    }
  });
}

// ── Call event tones ─────────────────────────────────────────────────────────

/**
 * Connected — double bip ascendant (480Hz → 620Hz), 150ms each.
 * Indique que l'appel est désormais actif.
 */
export function playConnectedTone(): Promise<void> {
  console.debug(LOG, "🔔 Tone: connected");
  return playToneSequence([
    { frequency: 480, duration: 0.15 },
    { frequency: 620, duration: 0.15 },
  ]);
}

/**
 * Ended — bip descendant (520Hz → 380Hz), 200ms each.
 * Appel terminé normalement.
 */
export function playEndedTone(): Promise<void> {
  console.debug(LOG, "🔔 Tone: ended");
  return playToneSequence([
    { frequency: 520, duration: 0.2 },
    { frequency: 380, duration: 0.25 },
  ]);
}

/**
 * Cancelled — bip simple court (440Hz, 200ms).
 * Appelant a annulé avant réponse.
 */
export function playCancelledTone(): Promise<void> {
  console.debug(LOG, "🔔 Tone: cancelled");
  return playToneSequence([
    { frequency: 440, duration: 0.2 },
  ]);
}

/**
 * Declined — 3 bips rapides (480Hz, 120ms × 3, gap 60ms).
 * Appel refusé par le receveur.
 */
export function playDeclinedTone(): Promise<void> {
  console.debug(LOG, "🔔 Tone: declined");
  return playToneSequence(
    [
      { frequency: 480, duration: 0.12 },
      { frequency: 480, duration: 0.12 },
      { frequency: 480, duration: 0.12 },
    ],
    0.06,
  );
}

/**
 * Unanswered — 3 bips espacés descendants (500→450→400Hz, 200ms × 3, gap 300ms).
 * Pas de réponse (timeout 30s côté serveur).
 */
export function playUnansweredTone(): Promise<void> {
  console.debug(LOG, "🔔 Tone: unanswered");
  return playToneSequence(
    [
      { frequency: 500, duration: 0.2 },
      { frequency: 450, duration: 0.2 },
      { frequency: 400, duration: 0.25 },
    ],
    0.3,
    0.3,
  );
}
