import crypto from "crypto";
import jwt from "jsonwebtoken";
import { SessionStatus } from "../db/prisma-enums.js";
import type { Response } from "express";
import { env } from "../../config/env.js";
import { prisma } from "../db/prisma.js";

export type AccessTokenPayload = {
  sub: string;
  role: string;
  sid: string;
};

const hashValue = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

const parseDurationMs = (value: string): number => {
  const numeric = /^([0-9]+)([smhd])$/.exec(value.trim());
  if (!numeric) {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const amount = Number(numeric[1]);
  const unit = numeric[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * multipliers[unit];
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const accessExpiresIn = env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"];
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: accessExpiresIn
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
};

const signRefreshToken = (sessionId: string): string => {
  const refreshExpiresIn = env.REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"];
  return jwt.sign({ sid: sessionId }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: refreshExpiresIn
  });
};

const verifyRefreshToken = (token: string): { sid: string } => {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as { sid: string };
};

export const createSessionTokens = async (input: {
  userId: string;
  role: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}) => {
  const expiresAt = new Date(Date.now() + parseDurationMs(env.REFRESH_TOKEN_EXPIRES_IN));

  const session = await prisma.userSession.create({
    data: {
      userId: input.userId,
      refreshTokenHash: "pending",
      deviceId: input.deviceId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
      status: SessionStatus.ACTIVE
    }
  });

  const refreshToken = signRefreshToken(session.id);
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashValue(refreshToken) }
  });

  const accessToken = signAccessToken({
    sub: input.userId,
    role: input.role,
    sid: session.id
  });

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
    expiresAt
  };
};

export const rotateSessionTokens = async (refreshToken: string) => {
  const payload = verifyRefreshToken(refreshToken);
  const currentHash = hashValue(refreshToken);

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
    include: { user: true }
  });

  if (!session || session.status !== SessionStatus.ACTIVE) {
    throw new Error("Session invalide");
  }

  if (session.expiresAt <= new Date()) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.EXPIRED, revokedAt: new Date() }
    });
    throw new Error("Session expiree");
  }

  if (session.refreshTokenHash !== currentHash) {
    // Token reuse detected — possible theft; revoke entire session family
    await prisma.userSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() }
    });
    throw new Error("Refresh token invalide");
  }

  const newRefreshToken = signRefreshToken(session.id);
  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashValue(newRefreshToken),
      lastSeenAt: new Date()
    }
  });

  const accessToken = signAccessToken({
    sub: session.userId,
    role: session.user.role,
    sid: session.id
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role
    }
  };
};

export const revokeSession = async (sessionId: string) => {
  await prisma.userSession.updateMany({
    where: { id: sessionId, status: SessionStatus.ACTIVE },
    data: { status: SessionStatus.REVOKED, revokedAt: new Date() }
  });
};

export const revokeOtherSessions = async (userId: string, keepSessionId: string) => {
  await prisma.userSession.updateMany({
    where: {
      userId,
      status: SessionStatus.ACTIVE,
      id: { not: keepSessionId }
    },
    data: {
      status: SessionStatus.REVOKED,
      revokedAt: new Date()
    }
  });
};

// ── httpOnly Cookie Helpers ──────────────────────────────────────────────────

const COOKIE_ACCESS  = "kin_access";
const COOKIE_REFRESH = "kin_refresh";
const COOKIE_SID     = "kin_sid";

/**
 * Builds cookie options for cross-origin Android WebView compatibility.
 * Production: sameSite "none" + secure + domain ".kin-sell.com"
 *   → cookies are sent in cross-origin requests (kin-sell.com → api.kin-sell.com)
 * Dev: sameSite "lax" (no domain needed for localhost)
 */
function cookieOpts(maxAge: number): import("express").CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" as const : "lax" as const,
    path: "/",
    maxAge,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; sessionId: string },
) {
  res.cookie(COOKIE_ACCESS, tokens.accessToken, cookieOpts(parseDurationMs(env.JWT_EXPIRES_IN)));
  res.cookie(COOKIE_REFRESH, tokens.refreshToken, cookieOpts(parseDurationMs(env.REFRESH_TOKEN_EXPIRES_IN)));
  res.cookie(COOKIE_SID, tokens.sessionId, cookieOpts(parseDurationMs(env.REFRESH_TOKEN_EXPIRES_IN)));
}

export function clearAuthCookies(res: Response) {
  const opts = cookieOpts(0);
  res.clearCookie(COOKIE_ACCESS, opts);
  res.clearCookie(COOKIE_REFRESH, opts);
  res.clearCookie(COOKIE_SID, opts);
}
