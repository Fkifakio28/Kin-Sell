import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type UpdateInfo = {
  version: string;
  build: number;
  apkUrl: string;
  forceUpdate: boolean;
  releaseNotes: string | null;
};

/**
 * Compare deux versions semver (ex: "2.0.1" vs "2.1.0").
 * Retourne true si remote > local.
 */
function isNewerVersion(local: string, remote: string): boolean {
  const lp = local.split(".").map(Number);
  const rp = remote.split(".").map(Number);
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    const l = lp[i] ?? 0;
    const r = rp[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

export function useAppUpdate() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const checking = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== "android") return;
    if (checking.current) return;
    checking.current = true;

    try {
      const appInfo = await App.getInfo();
      const localVersion = appInfo.version; // e.g. "2.0.0"

      const res = await fetch(`${API_BASE}/app-version/android`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      if (!data.version || !data.apkUrl) return;

      if (isNewerVersion(localVersion, data.version)) {
        setUpdate({
          version: data.version,
          build: data.build ?? 0,
          apkUrl: data.apkUrl,
          forceUpdate: data.forceUpdate ?? false,
          releaseNotes: data.releaseNotes ?? null,
        });
        setDismissed(false);
      }
    } catch {
      // Silently ignore — no update check is not critical
    } finally {
      checking.current = false;
    }
  }, []);

  // Check on mount
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Delay to let the app settle
    const timer = setTimeout(() => void checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  // Check on resume (foreground)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener("resume", () => void checkForUpdate());
    return () => { void listener.then((l) => l.remove()); };
  }, [checkForUpdate]);

  const openDownload = useCallback(async () => {
    if (!update?.apkUrl) return;
    await Browser.open({ url: update.apkUrl });
  }, [update]);

  const dismiss = useCallback(() => {
    if (update?.forceUpdate) return; // Can't dismiss forced updates
    setDismissed(true);
  }, [update]);

  return {
    showModal: update !== null && !dismissed,
    update,
    openDownload,
    dismiss,
  };
}
