import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

interface SplashScreenProps {
  onDismiss: () => void;
}

const SPLASH_KEY = "ks-splash-seen";
const AUTO_DISMISS_MS = 3500;

export function SplashScreen({ onDismiss }: SplashScreenProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    if (fading) return;
    setFading(true);
    setTimeout(() => {
      sessionStorage.setItem(SPLASH_KEY, "1");
      onDismiss();
    }, 620);
  }

  return (
    <div
      className={`ks-splash${fading ? " ks-splash--fading" : ""}`}
      onClick={handleDismiss}
      role="presentation"
      aria-hidden="true"
    >
      {/*
        Un seul <picture> responsive remplace les deux <img> (desktop+mobile)
        précédemment toujours téléchargées. `<source media>` garantit qu'un
        seul fichier est réellement chargé par le navigateur, et on privilégie
        le WebP (plus léger) avec fallback PNG.
      */}
      <picture>
        <source
          media="(max-width: 767px)"
          srcSet="/assets/kin-sell/splash-mobile.webp"
          type="image/webp"
        />
        <source
          media="(max-width: 767px)"
          srcSet="/assets/kin-sell/splash-mobile.png"
        />
        <source
          srcSet="/assets/kin-sell/splash-desktop.webp"
          type="image/webp"
        />
        <img
          className="ks-splash__img"
          src="/assets/kin-sell/splash-desktop.png"
          alt=""
          draggable={false}
          fetchPriority="high"
          decoding="async"
        />
      </picture>

      {/* Barre de progression */}
      <span className="ks-splash__bar" />

      {/* Invitation à continuer */}
      <span className="ks-splash__hint">Appuyer pour continuer</span>
    </div>
  );
}

/** Retourne true si le splash doit s'afficher (une seule fois par session, web uniquement) */
export function shouldShowSplash(): boolean {
  // Sur APK/natif, le splash Android 12+ + Capacitor suffit — pas de web splash
  if (Capacitor.isNativePlatform()) return false;
  return !sessionStorage.getItem(SPLASH_KEY);
}
