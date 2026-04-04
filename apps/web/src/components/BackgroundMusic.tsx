import { useEffect, useRef, useState } from "react";
import { SK_MUSIC_STOPPED } from "../shared/constants/storage-keys";

const MUSIC_PREF_KEY = SK_MUSIC_STOPPED;

interface BackgroundMusicProps {
  playing: boolean;
}

export function BackgroundMusic({ playing }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  // Respecter le choix utilisateur : si explicitement stoppé, ne jamais relancer
  const [userStopped, setUserStopped] = useState(
    () => localStorage.getItem(MUSIC_PREF_KEY) === "1"
  );

  const tryPlay = () => {
    const el = audioRef.current;
    if (!el || userStopped) return;
    el.play().catch(() => { /* autoplay encore bloqué */ });
  };

  /** STOP complet : pause + reset position */
  const stopMusic = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  };

  /* Lancer la lecture dès que `playing` passe à true.
   * Si `userStopped` ou `!playing` → stop complet (pause + currentTime = 0).
   * Les navigateurs bloquent l'autoplay si aucun geste utilisateur n'a eu lieu. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.2;

    if (!playing || userStopped) {
      stopMusic();
      return;
    }

    // Tentative directe
    el.play().catch(() => {
      const unlock = () => {
        tryPlay();
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("touchstart",  unlock, true);
        document.removeEventListener("click",       unlock, true);
        document.removeEventListener("keydown",     unlock, true);
        document.removeEventListener("scroll",      unlock, true);
      };
      document.addEventListener("pointerdown", unlock, { once: true, capture: true, passive: true });
      document.addEventListener("touchstart",  unlock, { once: true, capture: true, passive: true });
      document.addEventListener("click",       unlock, { once: true, capture: true });
      document.addEventListener("keydown",     unlock, { once: true, capture: true });
      document.addEventListener("scroll",      unlock, { once: true, capture: true, passive: true });
    });
  }, [playing, userStopped]);

  /* Synchroniser le mute */
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  const handleToggle = () => {
    if (userStopped) {
      // Utilisateur veut relancer → supprimer la préférence
      setUserStopped(false);
      localStorage.removeItem(MUSIC_PREF_KEY);
      if (playing) tryPlay();
    } else if (muted) {
      setMuted(false);
    } else {
      // Premier clic : mute. Deuxième logique gérée par le bouton stop ci-dessous.
      setMuted(true);
    }
  };

  const handleStop = () => {
    stopMusic();
    setUserStopped(true);
    localStorage.setItem(MUSIC_PREF_KEY, "1");
  };

  const icon = userStopped ? "⏹" : muted ? "🔇" : "🔊";
  const label = userStopped
    ? "Relancer la musique"
    : muted
      ? "Activer le son"
      : "Couper le son";

  return (
    <>
      <audio
        ref={audioRef}
        src="/assets/kin-sell/coffee-and-books.mp3"
        loop
        preload="auto"
        aria-hidden="true"
      />
      <button
        className="ks-mute-btn"
        onClick={handleToggle}
        onDoubleClick={handleStop}
        aria-label={label}
        title={`${label} (double-clic = arrêter)`}
      >
        {icon}
      </button>
    </>
  );
}
