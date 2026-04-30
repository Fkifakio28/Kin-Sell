/* ═══════════════════════════════════════════════════════════
   WebRTC Configuration — Kin-Sell V2
   Shared config for video/audio calls (MessagingPage + DashboardMessaging)
   ═══════════════════════════════════════════════════════════ */

/* ── ICE Servers ── */
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME ?? "";
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL ?? "";

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // STUN (suffisant pour NAT traversal)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // TURN servers only if credentials are configured
  if (TURN_USERNAME && TURN_CREDENTIAL) {
    servers.push(
      { urls: "turn:a.relay.metered.ca:80", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
      { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
      { urls: "turn:a.relay.metered.ca:443", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
      { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    );
  }

  return servers;
}

export function getRtcConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 4,
  };
}

/* ── Video Profiles ── */
export type VideoProfile = "hd" | "balanced" | "data-saver";

export const VIDEO_CONSTRAINTS: Record<VideoProfile, { width: number; height: number; frameRate: number }> = {
  hd: { width: 1280, height: 720, frameRate: 30 },
  balanced: { width: 960, height: 540, frameRate: 24 },
  "data-saver": { width: 640, height: 360, frameRate: 15 },
};

export const VIDEO_BITRATE: Record<VideoProfile, number> = {
  hd: 2_000_000,
  balanced: 1_000_000,
  "data-saver": 400_000,
};

export const VIDEO_SCALE_DOWN: Record<VideoProfile, number> = {
  hd: 1,
  balanced: 1.2,
  "data-saver": 1.6,
};

/* ── Audio Config ── */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

// 48 kbps Opus — bon compromis clarté / bande passante pour réseaux Kinshasa
export const AUDIO_BITRATE = 48_000;

/* ── Quality Thresholds ── */
export const QUALITY_POOR = { lossRate: 0.12, minFps: 12, maxRtt: 0.8 } as const;
export const QUALITY_FAIR = { lossRate: 0.05, minFps: 20, maxRtt: 0.35 } as const;

// Nombre d'échantillons consécutifs avant changement de profil
export const UPGRADE_STREAK = 6;   // ~9s de bonne qualité → upgrade
export const DOWNGRADE_STREAK = 2; // ~3s de mauvaise qualité → downgrade

/* ── ICE Restart ── */
export const ICE_RESTART_DELAYS = [500, 1000, 2000, 3000, 5000] as const;
export const ICE_MAX_ATTEMPTS = 5;

/* ── Codec Preferences ── */
export function applyCodecPreferences(pc: RTCPeerConnection): void {
  for (const tr of pc.getTransceivers()) {
    try {
      const kind = tr.receiver?.track?.kind ?? tr.sender?.track?.kind;
      if (kind === "video") {
        const codecs = RTCRtpReceiver.getCapabilities?.("video")?.codecs;
        if (codecs) {
          // VP9 > VP8 > H264 (meilleure compression à bitrate équivalent)
          const sorted = [...codecs].sort((a, b) => {
            const prio = (c: { mimeType: string }) =>
              /vp9/i.test(c.mimeType) ? 0 : /vp8/i.test(c.mimeType) ? 1 : /h264/i.test(c.mimeType) ? 2 : 3;
            return prio(a) - prio(b);
          });
          tr.setCodecPreferences(sorted);
        }
      }
      if (kind === "audio") {
        const codecs = RTCRtpReceiver.getCapabilities?.("audio")?.codecs;
        if (codecs) {
          // Opus en priorité (supporte FEC, DTX, variable bitrate)
          const sorted = [...codecs].sort((a, b) => {
            const prio = (c: { mimeType: string }) => /opus/i.test(c.mimeType) ? 0 : 1;
            return prio(a) - prio(b);
          });
          tr.setCodecPreferences(sorted);
        }
      }
    } catch { /* codec prefs non supportées sur ce navigateur */ }
  }
}

/* ── Sender Optimization ── */
export async function optimizeSenders(pc: RTCPeerConnection, profile: VideoProfile = "hd"): Promise<void> {
  await Promise.all(pc.getSenders().map(async (sender) => {
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];

      if (sender.track?.kind === "video") {
        params.degradationPreference = "balanced";
        params.encodings = [{
          ...params.encodings[0],
          maxBitrate: VIDEO_BITRATE[profile],
          maxFramerate: VIDEO_CONSTRAINTS[profile].frameRate,
          scaleResolutionDownBy: VIDEO_SCALE_DOWN[profile],
        }];
      }
      if (sender.track?.kind === "audio") {
        params.encodings = [{
          ...params.encodings[0],
          maxBitrate: AUDIO_BITRATE,
        }];
      }
      await sender.setParameters(params);
    } catch { /* browser compat */ }
  }));
}

/* ── Apply Video Profile to running call ── */
export async function applyVideoProfileToPC(
  pc: RTCPeerConnection,
  stream: MediaStream,
  profile: VideoProfile,
): Promise<void> {
  // 1. Ajuster les contraintes de la piste locale
  const track = stream.getVideoTracks()[0];
  if (track) {
    const c = VIDEO_CONSTRAINTS[profile];
    try {
      await track.applyConstraints({
        width: { ideal: c.width, max: c.width },
        height: { ideal: c.height, max: c.height },
        frameRate: { ideal: c.frameRate, max: c.frameRate },
      });
    } catch { /* device constraints */ }
  }

  // 2. Ajuster le sender RTP
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings = [{
        ...params.encodings[0],
        maxBitrate: VIDEO_BITRATE[profile],
        maxFramerate: VIDEO_CONSTRAINTS[profile].frameRate,
        scaleResolutionDownBy: VIDEO_SCALE_DOWN[profile],
      }];
      await sender.setParameters(params);
    } catch { /* browser compat */ }
  }
}

/* ── Get Initial Profile from Network Info ── */
export function getInitialProfile(): VideoProfile {
  const net = (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType;
  if (net === "2g" || net === "slow-2g") return "data-saver";
  if (net === "3g") return "balanced";
  return "hd";
}

/* ── Get Media Constraints ── */
export function getMediaConstraints(
  callType: "audio" | "video",
  facingMode: "user" | "environment" = "user",
): MediaStreamConstraints {
  const isMob = /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const videoConstraints: MediaTrackConstraints | false = callType === "video"
    ? isMob
      ? { width: { ideal: 720, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode }
      : { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode }
    : false;
  return { audio: AUDIO_CONSTRAINTS, video: videoConstraints };
}
