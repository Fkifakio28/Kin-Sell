import type { Request } from "express";
import crypto from "node:crypto";

/**
 * Extrait le contexte de requête (IP / UA / deviceId) de manière sécurisée.
 *
 * - `ipAddress` : priorité à `X-Forwarded-For` (nginx met l'IP réelle), puis `req.ip`.
 *   On prend toujours le PREMIER segment de `X-Forwarded-For` (client d'origine),
 *   jamais les IPs intermédiaires qui peuvent être usurpées.
 * - `userAgent` : header brut, tronqué à 512 chars.
 * - `deviceId` : header custom `X-Device-Id` si fourni par le client mobile/web,
 *   sinon un hash SHA-256 déterministe `IP|UA` tronqué (pseudo-device stable tant
 *   que l'utilisateur reste sur le même device réseau).
 */
export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
  deviceId: string;
};

const PSEUDO_DEVICE_PREFIX = "pseudo-";

export const extractRequestContext = (req: Request): RequestContext => {
  // IP : on privilégie X-Forwarded-For (nginx) — premier segment = client réel
  const xff = req.header("x-forwarded-for");
  let ipAddress: string | undefined;
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) ipAddress = first;
  }
  if (!ipAddress) ipAddress = req.ip ?? undefined;

  // UA : trim à 512 chars pour éviter les buffer overflow côté DB
  const rawUa = req.header("user-agent") ?? "";
  const userAgent = rawUa.length > 0 ? rawUa.slice(0, 512) : undefined;

  // deviceId : client-fourni prioritaire, sinon hash stable IP|UA
  const clientDeviceId = req.header("x-device-id");
  let deviceId: string;
  if (typeof clientDeviceId === "string" && clientDeviceId.length >= 8 && clientDeviceId.length <= 128) {
    deviceId = clientDeviceId;
  } else {
    const hash = crypto
      .createHash("sha256")
      .update(`${ipAddress ?? "unknown"}|${userAgent ?? "unknown"}`)
      .digest("hex")
      .slice(0, 24);
    deviceId = `${PSEUDO_DEVICE_PREFIX}${hash}`;
  }

  return { ipAddress, userAgent, deviceId };
};

/** `true` si le deviceId a été généré côté serveur (pas fourni par le client). */
export const isPseudoDeviceId = (deviceId: string): boolean => deviceId.startsWith(PSEUDO_DEVICE_PREFIX);
