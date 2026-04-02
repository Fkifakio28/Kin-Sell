import { useEffect, useRef, useState } from "react";

interface BackgroundMusicProps {
  playing: boolean;
}

export function BackgroundMusic({ playing }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);

  const tryPlay = () => {
    const el = audioRef.current;
    if (!el) return;
    el.play().catch(() => { /* autoplay encore bloqué */ });
  };

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

    // Tentative directe
    el.play().catch(() => {
      // Navigateur bloque — on attend le prochain geste réel.
      // On utilise document + capture:true pour intercepter les événements
      // AVANT tout stopPropagation dans l'arbre, et on écoute plusieurs
      // types de gestes (clic, touch, pointer, scroll, clavier).
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
        onClick={() => {
          setMuted((m) => !m);
          if (playing) tryPlay();
        }}
        aria-label={muted ? "Activer le son" : "Couper le son"}
        title={muted ? "Activer le son" : "Couper le son"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
