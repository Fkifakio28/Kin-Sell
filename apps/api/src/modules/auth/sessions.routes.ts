import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { prisma } from "../../shared/db/prisma.js";
import { SessionStatus } from "../../shared/db/prisma-enums.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logSecurityEvent } from "../security/security.service.js";
import { extractRequestContext, isPseudoDeviceId } from "../../shared/http/request-context.js";

const router = Router();

/**
 * GET /auth/sessions — liste des sessions actives du user courant.
 * Retourne pour chaque session : ID, device, IP, UA, timestamps, et un flag
 * `current` qui indique la session de la requête en cours.
 *
 * Utilisé par la page "Appareils connectés" côté web/mobile.
 */
router.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = request.auth!.userId;
    const currentSessionId = request.auth!.sessionId;

    const sessions = await prisma.userSession.findMany({
      where: { userId, status: SessionStatus.ACTIVE },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true
      }
    });

    response.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        current: s.id === currentSessionId,
        deviceLabel: formatDeviceLabel(s.userAgent, s.deviceId),
        pseudoDevice: s.deviceId ? isPseudoDeviceId(s.deviceId) : true,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt?.toISOString() ?? s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString()
      }))
    });
  })
);

/**
 * POST /auth/sessions/:id/revoke — révoque une session spécifique (non-courante).
 * L'utilisateur ne peut révoquer QUE ses propres sessions (check buyerUserId ≡ auth).
 */
router.post(
  "/sessions/:id/revoke",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = request.auth!.userId;
    const currentSessionId = request.auth!.sessionId;
    const targetId = request.params.id;

    if (targetId === currentSessionId) {
      throw new HttpError(400, "Utilisez /auth/logout pour la session courante");
    }

    const session = await prisma.userSession.findUnique({
      where: { id: targetId },
      select: { id: true, userId: true, status: true }
    });

    if (!session || session.userId !== userId) {
      throw new HttpError(404, "Session introuvable");
    }

    if (session.status !== SessionStatus.ACTIVE) {
      response.json({ success: true, alreadyRevoked: true });
      return;
    }

    await prisma.userSession.update({
      where: { id: targetId },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() }
    });

    const ctx = extractRequestContext(request);
    void logSecurityEvent({
      userId,
      eventType: "SESSION_REVOKED_BY_USER",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      riskLevel: 0,
      metadata: { revokedSessionId: targetId }
    });

    response.json({ success: true });
  })
);

/**
 * POST /auth/sessions/revoke-all-others — révoque toutes les sessions sauf la courante.
 * Utilisé quand l'utilisateur soupçonne un vol de compte ("Se déconnecter partout ailleurs").
 */
router.post(
  "/sessions/revoke-all-others",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = request.auth!.userId;
    const currentSessionId = request.auth!.sessionId;

    if (!currentSessionId) {
      throw new HttpError(400, "Session courante introuvable");
    }

    const result = await prisma.userSession.updateMany({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
        id: { not: currentSessionId }
      },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() }
    });

    const ctx = extractRequestContext(request);
    void logSecurityEvent({
      userId,
      eventType: "SESSIONS_ALL_REVOKED",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      riskLevel: 1,
      metadata: { revokedCount: result.count }
    });

    response.json({ success: true, revokedCount: result.count });
  })
);

/** Renvoie un label lisible pour l'UI : "Chrome sur Windows" / "Mobile app" / "Inconnu". */
function formatDeviceLabel(ua: string | null, deviceId: string | null): string {
  if (!ua) {
    if (deviceId && !isPseudoDeviceId(deviceId)) return "Application mobile";
    return "Appareil inconnu";
  }
  const u = ua.toLowerCase();
  const os = u.includes("windows") ? "Windows"
    : u.includes("android") ? "Android"
    : u.includes("iphone") || u.includes("ipad") || u.includes("ios") ? "iOS"
    : u.includes("mac os") || u.includes("macintosh") ? "macOS"
    : u.includes("linux") ? "Linux"
    : "Autre";
  const browser = u.includes("edg/") ? "Edge"
    : u.includes("chrome/") ? "Chrome"
    : u.includes("firefox/") ? "Firefox"
    : u.includes("safari/") ? "Safari"
    : "Navigateur";
  return `${browser} sur ${os}`;
}

export default router;
