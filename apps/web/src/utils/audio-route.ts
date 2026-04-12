import { Capacitor, registerPlugin } from "@capacitor/core";

interface AudioRoutePlugin {
  setEarpiece(): Promise<{ mode: string }>;
  setSpeaker(): Promise<{ mode: string }>;
  getRoute(): Promise<{ mode: string; speakerOn: boolean }>;
  reset(): Promise<{ mode: string }>;
}

const AudioRoute = registerPlugin<AudioRoutePlugin>("AudioRoute");

const isNative = Capacitor.isNativePlatform();

/** Route audio to earpiece + activate proximity sensor */
export async function setEarpiece(): Promise<void> {
  if (!isNative) return;
  await AudioRoute.setEarpiece();
}

/** Route audio to loudspeaker */
export async function setSpeaker(): Promise<void> {
  if (!isNative) return;
  await AudioRoute.setSpeaker();
}

/** Get current audio route */
export async function getAudioRoute(): Promise<"earpiece" | "speaker"> {
  if (!isNative) return "speaker";
  const r = await AudioRoute.getRoute();
  return r.mode as "earpiece" | "speaker";
}

/** Reset audio to normal (call ended) */
export async function resetAudioRoute(): Promise<void> {
  if (!isNative) return;
  await AudioRoute.reset();
}
