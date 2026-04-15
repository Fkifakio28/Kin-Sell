import { AccountType, AuthProvider } from "../../shared/db/prisma-enums.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import { createSessionTokens, revokeSession, rotateSessionTokens } from "../../shared/auth/session.js";
import { normalizeEmail, slugifyUsername } from "../../shared/utils/identity-normalizers.js";
import { Role } from "../../types/roles.js";
import { logSecurityEvent, checkMultiAccount } from "../security/security.service.js";
import { sendWelcomeEmail } from "../../shared/email/mailer.js";
import { getRedis } from "../../shared/db/redis.js";
import { logger } from "../../shared/logger.js";

const LOGIN_LOCKOUT_MAX = 5;
const LOGIN_LOCKOUT_WINDOW = 15 * 60; // 15 minutes in seconds
const LOGIN_LOCKOUT_DURATION = 30 * 60; // 30 minutes lockout

async function checkLoginLockout(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const lockKey = `lockout:${email}`;
  const locked = await redis.get(lockKey);
  if (locked) {
    throw new HttpError(429, "Trop de tentatives. Réessayez dans 30 minutes.");
  }
}

async function recordFailedLogin(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const attemptsKey = `login_attempts:${email}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) {
    await redis.expire(attemptsKey, LOGIN_LOCKOUT_WINDOW);
  }
  if (attempts >= LOGIN_LOCKOUT_MAX) {
    const lockKey = `lockout:${email}`;
    await redis.set(lockKey, "1", "EX", LOGIN_LOCKOUT_DURATION);
    await redis.del(attemptsKey);
    logger.warn({ email }, "Account locked after too many failed login attempts");
    throw new HttpError(429, "Trop de tentatives. Réessayez dans 30 minutes.");
  }
}

async function clearFailedLogins(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`login_attempts:${email}`);
}

type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  role?: Role;
};

type LoginInput = {
  email: string;
  password: string;
};

const sanitizeRoleForRegister = (role?: Role): Role => {
  if (role === "BUSINESS") {
    return Role.BUSINESS;
  }
  return Role.USER;
};

const createUniqueUsername = async (seed: string): Promise<string> => {
  const base = slugifyUsername(seed) || `ks-${Math.random().toString(36).slice(2, 8)}`;
  let candidate = base;
  let index = 1;

  while (true) {
    const exists = await prisma.userProfile.findUnique({ where: { username: candidate } });
    if (!exists) {
      return candidate;
    }
    index += 1;
    candidate = `${base}-${index}`;
  }
};

export const register = async (input: RegisterInput) => {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: normalizedEmail
      }
    }
  });

  if (existing) {
    throw new HttpError(409, "Cet email est deja utilise");
  }

  const passwordHash = await hashPassword(input.password);
  const role = sanitizeRoleForRegister(input.role);
  const accountType = role === Role.BUSINESS ? AccountType.BUSINESS : AccountType.USER;
  const username = await createUniqueUsername(input.displayName || normalizedEmail.split("@")[0]);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role,
        preferredAccountType: accountType,
        profileCompleted: false,
        profile: {
          create: {
            displayName: input.displayName,
            username
          }
        },
        preferences: {
          create: {}
        }
      }
    });

    await tx.userIdentity.create({
      data: {
        userId: created.id,
        provider: AuthProvider.EMAIL,
        providerSubject: normalizedEmail,
        providerEmail: normalizedEmail,
        isVerified: false
      }
    });

    return tx.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { profile: true }
    });
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "AUTH_REGISTER",
      entityType: "USER",
      entityId: user.id
    }
  });

  sendWelcomeEmail(user.email ?? normalizedEmail, user.profile?.displayName ?? input.displayName).catch(() => {});

  const session = await createSessionTokens({
    userId: user.id,
    role: user.role as Role,
    deviceId: "legacy-auth"
  });

  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.profile?.displayName ?? input.displayName
    }
  };
};

export const login = async (input: LoginInput) => {
  const normalizedEmail = normalizeEmail(input.email);

  // Check lockout before any DB query
  await checkLoginLockout(normalizedEmail);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { profile: true }
  });

  if (!user) {
    await recordFailedLogin(normalizedEmail);
    throw new HttpError(401, "Email ou mot de passe invalide");
  }

  if (!user.passwordHash) {
    // Generic message — don't reveal that the account uses OAuth
    throw new HttpError(401, "Email ou mot de passe invalide");
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    await recordFailedLogin(normalizedEmail);
    throw new HttpError(401, "Email ou mot de passe invalide");
  }

  // Login success — clear failed attempts
  await clearFailedLogins(normalizedEmail);

  if (user.accountStatus === "PENDING_DELETION") {
    throw new HttpError(403, "Ce compte est en cours de suppression");
  }

  // SECURITY: block legacy login for accounts with 2FA enabled — use /account/entry instead
  if (user.totpEnabled) {
    throw new HttpError(403, "Ce compte utilise la 2FA. Veuillez utiliser la connexion sécurisée.");
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      entityType: "USER",
      entityId: user.id
    }
  });

  await prisma.userIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: normalizedEmail
      }
    },
    create: {
      userId: user.id,
      provider: AuthProvider.EMAIL,
      providerSubject: normalizedEmail,
      providerEmail: normalizedEmail,
      isVerified: user.emailVerified
    },
    update: {
      userId: user.id,
      providerEmail: normalizedEmail,
      lastUsedAt: new Date()
    }
  });

  const session = await createSessionTokens({
    userId: user.id,
    role: user.role as Role,
    deviceId: "legacy-auth"
  });

  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.profile?.displayName ?? ""
    }
  };
};

export const me = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });

  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    suspensionReason: user.suspensionReason ?? null,
    suspensionExpiresAt: user.suspensionExpiresAt?.toISOString() ?? null,
    displayName: user.profile?.displayName ?? "",
    avatarUrl: user.profile?.avatarUrl ?? null,
    city: user.profile?.city ?? null,
    country: user.profile?.country ?? null,
    verificationStatus: user.profile?.verificationStatus ?? "UNVERIFIED"
  };
};

export const refresh = async (refreshToken: string) => {
  try {
    const rotated = await rotateSessionTokens(refreshToken);
    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      sessionId: rotated.sessionId,
      user: rotated.user
    };
  } catch {
    throw new HttpError(401, "Refresh token invalide");
  }
};

export const logout = async (sessionId?: string) => {
  if (sessionId) {
    await revokeSession(sessionId);
  }

  return { success: true };
};
