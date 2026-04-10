import { NextFunction, Request, Response } from "express";
import { Role } from "../../types/roles.js";
import { HttpError } from "../errors/http-error.js";
import { verifyAccessToken } from "./jwt.js";
import { prisma } from "../db/prisma.js";

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
  _verifyAccountAndSession(request.auth!.userId, request.auth!.sessionId, skipSuspension)
    .then(({ freshRole }) => {
      if (freshRole) request.auth!.role = freshRole;
      next();
    })
    .catch((err) => next(err));
};

async function _verifyAccountAndSession(userId: string, sessionId?: string, skipSuspensionCheck = false): Promise<{ freshRole?: Role }> {
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
      select: { status: true },
    });
    if (session && session.status !== "ACTIVE") {
      throw new HttpError(401, "Session révoquée");
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
