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
      {/* Image PC (16:9) */}
      <img
        className="ks-splash__img ks-splash__img--desktop"
        src="/assets/kin-sell/splash-desktop.png"
        alt=""
        draggable={false}
      />
      {/* Image mobile (9:16) */}
      <img
        className="ks-splash__img ks-splash__img--mobile"
        src="/assets/kin-sell/splash-mobile.png"
        alt=""
        draggable={false}
      />

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
