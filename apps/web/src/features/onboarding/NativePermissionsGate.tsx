/**
 * NativePermissionsGate — Affiche l'écran d'onboarding des permissions
 * au premier lancement sur app native (Android/iOS).
 *
 * S'affiche par-dessus l'app en position fixed.
 * Une fois complété/ignoré, ne réapparaît plus (localStorage).
 */
import { useState, lazy, Suspense } from "react";
import { Capacitor } from "@capacitor/core";
import { SK_PERMISSIONS_DONE } from "../../shared/constants/storage-keys";

const PermissionsOnboarding = lazy(
  () => import("./PermissionsOnboarding").then((m) => ({ default: m.PermissionsOnboarding }))
);

export function NativePermissionsGate({ children }: { children: React.ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const alreadyDone = !!localStorage.getItem(SK_PERMISSIONS_DONE);

  const [showOnboarding, setShowOnboarding] = useState(isNative && !alreadyDone);

  return (
    <>
      {children}
      {showOnboarding && (
        <Suspense fallback={null}>
          <PermissionsOnboarding onComplete={() => setShowOnboarding(false)} />
        </Suspense>
      )}
    </>
  );
}
