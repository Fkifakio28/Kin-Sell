/* usePwaInstall — DISABLED (SW/PWA removed) */

export type Platform = "other";
export type InstallState = "unavailable";

export interface PwaInstallControls {
  installState: InstallState;
  platform: Platform;
  canShow: boolean;
  triggerInstall: () => Promise<"unavailable">;
  dismissBanner: () => void;
  updateAvailable: boolean;
  applyUpdate: () => void;
}

export function usePwaInstall(): PwaInstallControls {
  return {
    installState: "unavailable",
    platform: "other",
    canShow: false,
    triggerInstall: async () => "unavailable" as const,
    dismissBanner: () => {},
    updateAvailable: false,
    applyUpdate: () => {},
  };
}
