/* usePWA — DISABLED (SW/PWA removed) */

type InstallState = "unavailable";

export function usePWA() {
  return {
    installState: "unavailable" as InstallState,
    triggerInstall: async () => "unavailable" as const,
    updateAvailable: false,
    applyUpdate: () => {},
  };
}

