import { NextFunction, Request, Response } from "express";
import { Role } from "../../types/roles.js";
import { HttpError } from "../errors/http-error.js";
import { verifyAccessToken } from "./jwt.js";
import { prisma } from "../db/prisma.js";
import { extractRequestContext } from "../http/request-context.js";
import { logger } from "../logger.js";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    role: Role;
    sessionId?: string;
  };
};

const getBearerToken = (request: Request): string | null => {
  // 1) httpOnly cookie (web)
  const cookieToken = (request as any).cookies?.kin_access;
  if (cookieToken && typeof cookieToken === "string") return cookieToken;

  // 2) Authorization header fallback (mobile / legacy)
  const authorization = request.header("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

export const requireAuth = (request: AuthenticatedRequest, _response: Response, next: NextFunction): void => {
  const token = getBearerToken(request);
  if (!token) {
    return next(new HttpError(401, "Authentification requise"));
  }

  try {
    const payload = verifyAccessToken(token);
    if (!payload?.sub || typeof payload.sub !== "string") {
      return next(new HttpError(401, "Token invalide"));
    }

    request.auth = {
      userId: payload.sub,
      role: payload.role as Role,
      sessionId: payload.sid
    };
  } catch {
    return next(new HttpError(401, "Token invalide ou expiré"));
  }

  // Routes allowed for suspended users (login, me, logout, appeal)
  const path = request.path;
  const skipSuspension = path === "/me" || path === "/appeal" || path.startsWith("/logout");

  // Verify user account is still active and session not revoked
  const ctx = extractRequestContext(request);
  _verifyAccountAndSession(request.auth!.userId, request.auth!.sessionId, skipSuspension, ctx)
    .then(({ freshRole }) => {
      if (freshRole) request.auth!.role = freshRole;
      next();
    })
    .catch((err) => next(err));
};

async function _verifyAccountAndSession(
  userId: string,
  sessionId?: string,
  skipSuspensionCheck = false,
  ctx?: { ipAddress?: string; userAgent?: string; deviceId?: string }
): Promise<{ freshRole?: Role }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true, role: true },
  });

  if (!user) throw new HttpError(401, "Compte introuvable");
  if (!skipSuspensionCheck && user.accountStatus === "SUSPENDED") throw new HttpError(403, "Votre compte est suspendu");
  if (user.accountStatus === "PENDING_DELETION") throw new HttpError(403, "Votre compte est en cours de suppression");

  if (sessionId) {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { status: true, ipAddress: true, userAgent: true, deviceId: true, lastSeenAt: true },
    });
    if (!session) return { freshRole: user.role as Role };
    if (session.status !== "ACTIVE") {
      throw new HttpError(401, "Session révoquée");
    }

    // Détection changement IP/device — signal fort de takeover
    if (ctx?.ipAddress && session.ipAddress && ctx.ipAddress !== session.ipAddress) {
      logger.warn(
        { userId, sessionId, oldIp: session.ipAddress, newIp: ctx.ipAddress, ua: ctx.userAgent?.slice(0, 80) },
        "[SECURITY] Session IP changed — potential takeover"
      );
    }

    // Throttle update : on ne met à jour lastSeenAt qu'une fois par minute pour éviter
    // de marteler la DB à chaque requête authentifiée.
    const now = Date.now();
    const shouldUpdate = !session.lastSeenAt || now - session.lastSeenAt.getTime() > 60_000;
    if (shouldUpdate) {
      void prisma.userSession
        .update({
          where: { id: sessionId },
          data: {
            lastSeenAt: new Date(now),
            ...(ctx?.ipAddress && !session.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
            ...(ctx?.userAgent && !session.userAgent ? { userAgent: ctx.userAgent } : {}),
            ...(ctx?.deviceId && !session.deviceId ? { deviceId: ctx.deviceId } : {})
          }
        })
        .catch(() => {});
    }
  }

  return { freshRole: user.role as Role };
}

export const requireRoles = (...roles: Role[]) => {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction): void => {
    if (!request.auth) {
      throw new HttpError(401, "Authentification requise");
    }

    if (!roles.includes(request.auth.role)) {
      throw new HttpError(403, "Acces refuse pour ce role");
    }

    next();
  };
};
