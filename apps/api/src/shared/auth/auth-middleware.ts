import { NextFunction, Request, Response } from "express";
import { Role } from "../../types/roles.js";
import { HttpError } from "../errors/http-error.js";
import { verifyAccessToken } from "./jwt.js";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    role: Role;
    sessionId?: string;
  };
};

const getBearerToken = (request: Request): string | null => {
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
    throw new HttpError(401, "Authentification requise");
  }

  try {
    const payload = verifyAccessToken(token);
    request.auth = {
      userId: payload.sub,
      role: payload.role as Role,
      sessionId: payload.sid
    };
  } catch {
    throw new HttpError(401, "Token invalide ou expiré");
  }

  next();
};

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
