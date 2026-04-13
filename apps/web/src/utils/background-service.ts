import { Capacitor, registerPlugin } from "@capacitor/core";

interface KinSellBackgroundPlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  requestBatteryExemption(): Promise<{ launched: boolean }>;
  isBatteryOptimized(): Promise<{ optimized: boolean }>;
}

const KinSellBackground = registerPlugin<KinSellBackgroundPlugin>("KinSellBackground");

/**
 * Démarre le foreground service persistant (Android uniquement).
 * Comme WhatsApp — empêche Samsung/Xiaomi/etc. de tuer l'app en background.
 */
export async function startBackgroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await KinSellBackground.startService();
  } catch (e) {
    console.warn("[Background] Failed to start service:", e);
  }
}

/**
 * Arrête le foreground service (quand l'utilisateur se déconnecte).
 */
export async function stopBackgroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await KinSellBackground.stopService();
  } catch (e) {
    console.warn("[Background] Failed to stop service:", e);
  }
}

/**
 * Demande l'exemption batterie spécifique au fabricant (Samsung, Xiaomi, etc.).
 * Ouvre la bonne page de paramètres selon le fabricant.
 */
export async function requestBatteryExemption(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await KinSellBackground.requestBatteryExemption();
    return result.launched;
  } catch {
    return false;
  }
}

/**
 * Vérifie si l'app est soumise à l'optimisation batterie.
 */
export async function isBatteryOptimized(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await KinSellBackground.isBatteryOptimized();
    return result.optimized;
  } catch {
    return false;
  }
}
