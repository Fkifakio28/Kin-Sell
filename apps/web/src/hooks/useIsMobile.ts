import { useEffect, useState } from "react";

/**
 * Détecte si l'appareil est un vrai téléphone (via user-agent + écran tactile).
 * Si oui, on verrouille la vue mobile quel que soit la largeur (même en paysage).
 */
function detectPhoneDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Vrai téléphone : UA mobile + écran tactile + petite dimension d'écran
  const mobileUA = /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const touchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  // Exclure les tablettes (iPad, grands écrans Android) via taille physique d'écran
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 820;
  return mobileUA && touchScreen && smallScreen;
}

const IS_PHONE = detectPhoneDevice();

/** Retourne true si la largeur d'écran est ≤ breakpoint (mobile), ou si c'est un téléphone (verrouillé mobile). */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => IS_PHONE || (typeof window !== "undefined" && window.innerWidth <= breakpoint)
  );

  useEffect(() => {
    // Sur un vrai téléphone, toujours mobile — pas besoin d'écouter les changements
    if (IS_PHONE) {
      setIsMobile(true);
      return;
    }
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
