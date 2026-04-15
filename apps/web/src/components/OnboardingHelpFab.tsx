/**
 * OnboardingHelpFab — Bouton flottant (🧭) positionné au-dessus du bouton tuto (?).
 * Réouvre le popup WelcomeOnboarding à la demande.
 * Affiché sur toutes les pages pour guider un utilisateur perdu.
 */
import { useState } from "react";
import { WelcomeOnboarding } from "../features/onboarding/WelcomeOnboarding";
import "./onboarding-help-fab.css";

export function OnboardingHelpFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="onboarding-help-fab"
        aria-label="Guide d'utilisation"
        title="Guide — Comment utiliser Kin-Sell"
        onClick={() => setOpen(true)}
      >
        🧭
      </button>
      {open && <WelcomeOnboarding onClose={() => setOpen(false)} />}
    </>
  );
}
