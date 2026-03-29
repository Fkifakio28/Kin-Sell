import { AccountType, AuthProvider } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import { createSessionTokens, revokeSession, rotateSessionTokens } from "../../shared/auth/session.js";
import { normalizeEmail, slugifyUsername } from "../../shared/utils/identity-normalizers.js";
import { Role } from "../../types/roles.js";
import { logSecurityEvent, checkMultiAccount } from "../security/security.service.js";

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
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { profile: true }
  });

  if (!user) {
    throw new HttpError(401, "Email ou mot de passe invalide");
  }

  if (!user.passwordHash) {
    throw new HttpError(400, "Ce compte utilise une methode externe. Utilisez votre provider ou OTP.");
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new HttpError(401, "Email ou mot de passe invalide");
  }

  if (user.accountStatus !== "ACTIVE") {
    throw new HttpError(403, "Compte inactif ou suspendu");
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
