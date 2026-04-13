/**
 * useCallSounds — Relie la machine d'état d'appel audio aux sons.
 *
 * Réagit aux transitions de `call.status` pour :
 * - Jouer la sonnerie en boucle pendant outgoing_ringing / incoming_ringing
 * - Couper la sonnerie dès qu'on quitte un état de sonnerie
 * - Jouer la tonalité appropriée sur chaque état terminal
 * - Jouer un bip de connexion quand l'appel passe en "connected"
 *
 * Ce hook est le SEUL point de gestion des sons d'appel.
 * Les composants n'ont pas besoin de gérer les sons eux-mêmes.
 */
import { useEffect, useRef } from "react";
import type { AudioCallStatus, CallDirection } from "./useAudioCallState";
import {
  playRingtone,
  stopRingtone,
  playConnectedTone,
  playEndedTone,
  playCancelledTone,
  playDeclinedTone,
  playUnansweredTone,
} from "../utils/call-sound-manager";

const RINGING_STATES: Set<AudioCallStatus> = new Set([
  "outgoing_ringing",
  "incoming_ringing",
]);

const TONE_MAP: Partial<Record<AudioCallStatus, () => void>> = {
  connected: playConnectedTone,
  ended: playEndedTone,
  cancelled: playCancelledTone,
  declined: playDeclinedTone,
  unanswered: playUnansweredTone,
};

export function useCallSounds(
  status: AudioCallStatus | null,
  direction: CallDirection | null,
): void {
  const prevStatusRef = useRef<AudioCallStatus | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // ── Sonnerie ──
    if (status && RINGING_STATES.has(status)) {
      playRingtone(direction ?? "outgoing");
      return () => { stopRingtone(); };
    }

    // Si on vient de quitter un état de sonnerie, stop
    if (prev && RINGING_STATES.has(prev)) {
      stopRingtone();
    }

    // ── Tonalité d'événement ──
    if (status && TONE_MAP[status] && prev !== status) {
      TONE_MAP[status]!();
    }

    // ── Idle — silence complet ──
    if (!status) {
      stopRingtone();
    }
  }, [status, direction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopRingtone(); };
  }, []);
}
