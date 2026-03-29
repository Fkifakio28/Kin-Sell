import { useEffect, useRef, useState } from "react";

interface BackgroundMusicProps {
  playing: boolean;
}

export function BackgroundMusic({ playing }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);

  /* Lancer la lecture dès que `playing` passe à true.
   * Les navigateurs bloquent l'autoplay si aucun geste utilisateur n'a eu lieu.
   * Solution : on tente play() immédiatement ; si le navigateur refuse,
   * on inscrit des listeners sur les prochaines interactions (click / touch / keydown)
   * et on rejoue dès que l'utilisateur agit. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.2;

    if (!playing) {
      el.pause();
      return;
    }

    const tryPlay = () => {
      el.play().catch(() => { /* déjà en lecture ou toujours bloqué */ });
    };

    // Tentative directe
    el.play().catch(() => {
      // Navigateur bloque — on attend le prochain geste réel
      const unlock = () => {
        tryPlay();
        window.removeEventListener("click",      unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("keydown",    unlock);
      };
      window.addEventListener("click",      unlock, { once: true, passive: true });
      window.addEventListener("touchstart", unlock, { once: true, passive: true });
      window.addEventListener("keydown",    unlock, { once: true, passive: true });
    });
  }, [playing]);

  /* Synchroniser le mute */
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

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
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Activer le son" : "Couper le son"}
        title={muted ? "Activer le son" : "Couper le son"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
