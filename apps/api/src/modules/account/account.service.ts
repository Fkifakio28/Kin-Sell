import crypto from "crypto";
import jwt from "jsonwebtoken";
import { generateSecret, generateURI, verify as totpVerify } from "otplib";
import {
  AccountType,
  AuthProvider,
  SessionStatus,
  VerificationPurpose,
  type Prisma
} from "@prisma/client";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import { createSessionTokens, revokeOtherSessions, revokeSession, rotateSessionTokens } from "../../shared/auth/session.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { sendOtpEmail } from "../../shared/email/mailer.js";
import { normalizeEmail, normalizePhone, slugifyUsername } from "../../shared/utils/identity-normalizers.js";
import { normalizeImageInput } from "../../shared/utils/media-storage.js";

type EntryEmailInput = {
  method: "email";
  email: string;
  password: string;
  displayName?: string;
  accountType?: AccountType;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
};

type EntryProviderInput = {
  method: "provider";
  provider: "GOOGLE" | "FACEBOOK" | "APPLE";
  providerSubject: string;
  providerEmail?: string;
  displayName?: string;
  avatarUrl?: string;
  accountType?: AccountType;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
};

type OtpRequestInput = {
  phone: string;
  purpose: VerificationPurpose;
  userId?: string;
};

type OtpVerifyInput = {
  verificationId: string;
  code: string;
  phone?: string;
  accountType?: AccountType;
  displayName?: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
};

const phoneCooldown = new Map<string, number>();

const hashCode = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

const randomOtp = (): string => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const randomUsernameFallback = (): string => {
  return `ks-${Math.random().toString(36).slice(2, 8)}`;
};

const createUniqueUsername = async (seed: string): Promise<string> => {
  const base = slugifyUsername(seed) || randomUsernameFallback();
  let candidate = base;
  let index = 1;

  while (true) {
    const existing = await prisma.userProfile.findUnique({ where: { username: candidate } });
    if (!existing) {
      return candidate;
    }
    index += 1;
    candidate = `${base}-${index}`;
  }
};

const accountTypeToRole = (accountType: AccountType | undefined): "BUSINESS" | "USER" => {
  return accountType === AccountType.BUSINESS ? "BUSINESS" : "USER";
};

const userPayload = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      preferences: true
    }
  });

  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    suspensionReason: user.suspensionReason ?? null,
    suspensionExpiresAt: user.suspensionExpiresAt?.toISOString() ?? null,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    profileCompleted: user.profileCompleted,
    profile: {
      username: user.profile?.username ?? null,
      displayName: user.profile?.displayName ?? "",
      avatarUrl: user.profile?.avatarUrl ?? null,
      birthDate: user.profile?.birthDate ?? null,
      city: user.profile?.city ?? null,
      country: user.profile?.country ?? null,
      addressLine1: user.profile?.addressLine1 ?? null
    },
    preferences: user.preferences
  };
};

const issueUserSession = async (input: {
  userId: string;
  role: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}) => {
  const tokens = await createSessionTokens(input);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    user: await userPayload(input.userId)
  };
};

export const getCurrentAccount = async (userId: string) => {
  return userPayload(userId);
};

const ensurePhoneCooldown = (destination: string) => {
  const now = Date.now();
  const nextAllowedAt = phoneCooldown.get(destination) ?? 0;
  if (now < nextAllowedAt) {
    const wait = Math.ceil((nextAllowedAt - now) / 1000);
    throw new HttpError(429, `Attendez ${wait}s avant un nouveau code OTP.`);
  }
  phoneCooldown.set(destination, now + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);
};

export const authEntry = async (input: EntryEmailInput | EntryProviderInput) => {
  if (input.method === "email") {
    const identifier = input.email.trim();
    const isEmail = identifier.includes("@");

    type IdentityWithUser = Prisma.UserIdentityGetPayload<{ include: { user: true } }>;
    let identity: IdentityWithUser | null = null;

    if (isEmail) {
      const email = normalizeEmail(identifier);
      identity = await prisma.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthProvider.EMAIL,
            providerSubject: email
          }
        },
        include: { user: true }
      });
    } else {
      // Lookup by username or user ID
      const userByUsername = await prisma.userProfile.findFirst({
        where: { username: { equals: identifier, mode: "insensitive" } },
        include: { user: { include: { identities: true } } }
      });

      if (userByUsername) {
        const emailIdentity = userByUsername.user.identities.find(i => i.provider === AuthProvider.EMAIL);
        if (emailIdentity) {
          identity = { ...emailIdentity, user: userByUsername.user } as IdentityWithUser;
        }
      }

      if (!identity) {
        const userById = await prisma.user.findUnique({
          where: { id: identifier },
          include: { identities: true }
        });
        if (userById) {
          const emailId = userById.identities.find(i => i.provider === AuthProvider.EMAIL);
          if (emailId) {
            identity = { ...emailId, user: userById } as IdentityWithUser;
          }
        }
      }
    }

    if (identity) {
      if (!identity.user.passwordHash) {
        throw new HttpError(400, "Ce compte utilise une methode externe. Utilisez Google/Facebook/Apple ou OTP telephone.");
      }

      const valid = await verifyPassword(input.password, identity.user.passwordHash);
      if (!valid) {
        throw new HttpError(401, "Email ou mot de passe invalide");
      }

      if (identity.user.accountStatus !== "ACTIVE") {
        throw new HttpError(403, "Compte inactif ou suspendu");
      }

      await prisma.userIdentity.update({
        where: { id: identity.id },
        data: { lastUsedAt: new Date() }
      });

      await prisma.auditLog.create({
        data: {
          actorUserId: identity.userId,
          action: "AUTH_SIGNIN_EMAIL",
          entityType: "USER",
          entityId: identity.userId
        }
      });

      // Si TOTP activé → challenge intermédiaire, pas de session complète
      if (identity.user.totpEnabled) {
        const challengeToken = jwt.sign(
          { sub: identity.userId, type: "totp-challenge" },
          env.JWT_SECRET,
          { expiresIn: "5m" }
        );
        return { totpRequired: true as const, challengeToken };
      }

      return issueUserSession({
        userId: identity.userId,
        role: identity.user.role,
        deviceId: input.deviceId,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress
      });
    }

    // Cannot register with a username or ID — only email
    if (!isEmail) {
      throw new HttpError(401, "Identifiant ou mot de passe invalide");
    }

    const email = normalizeEmail(identifier);
    const passwordHash = await hashPassword(input.password);
    const accountType = input.accountType ?? AccountType.USER;
    const role = accountTypeToRole(accountType);
    const displayName = input.displayName?.trim() || email.split("@")[0] || "Utilisateur Kin-Sell";

    const username = await createUniqueUsername(displayName);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          emailVerified: false,
          passwordHash,
          role,
          preferredAccountType: accountType,
          profileCompleted: false,
          profile: {
            create: {
              displayName,
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
          userId: user.id,
          provider: AuthProvider.EMAIL,
          providerSubject: email,
          providerEmail: email,
          isVerified: false
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "AUTH_SIGNUP_EMAIL",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            accountType
          }
        }
      });

      return user;
    });

    return issueUserSession({
      userId: created.id,
      role: created.role,
      deviceId: input.deviceId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress
    });
  }

  // Provider flow assumes providerSubject comes from a trusted OAuth callback.
  const providerEmail = input.providerEmail ? normalizeEmail(input.providerEmail) : undefined;
  const accountType = input.accountType ?? AccountType.USER;

  let identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: input.provider,
        providerSubject: input.providerSubject
      }
    },
    include: { user: true }
  });

  if (!identity && providerEmail) {
    const emailIdentity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.EMAIL,
          providerSubject: providerEmail
        }
      }
    });

    if (emailIdentity) {
      identity = await prisma.userIdentity.create({
        data: {
          userId: emailIdentity.userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          providerEmail,
          isVerified: true
        },
        include: { user: true }
      });
    }
  }

  if (!identity) {
    const displayName = input.displayName?.trim() || (providerEmail ? providerEmail.split("@")[0] : "Utilisateur Kin-Sell");
    const username = await createUniqueUsername(displayName);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: providerEmail,
          emailVerified: Boolean(providerEmail),
          role: accountTypeToRole(accountType),
          preferredAccountType: accountType,
          profileCompleted: false,
          profile: {
            create: {
              displayName,
              username,
              avatarUrl: input.avatarUrl
            }
          },
          preferences: {
            create: {}
          }
        }
      });

      const providerIdentity = await tx.userIdentity.create({
        data: {
          userId: user.id,
          provider: input.provider,
          providerSubject: input.providerSubject,
          providerEmail,
          isVerified: true
        }
      });

      if (providerEmail) {
        await tx.userIdentity.upsert({
          where: {
            provider_providerSubject: {
              provider: AuthProvider.EMAIL,
              providerSubject: providerEmail
            }
          },
          create: {
            userId: user.id,
            provider: AuthProvider.EMAIL,
            providerSubject: providerEmail,
            providerEmail,
            isVerified: true
          },
          update: {
            userId: user.id,
            providerEmail,
            isVerified: true,
            lastUsedAt: new Date()
          }
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "AUTH_SIGNIN_PROVIDER",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            provider: input.provider
          }
        }
      });

      return { user, providerIdentity };
    });

    return issueUserSession({
      userId: created.user.id,
      role: created.user.role,
      deviceId: input.deviceId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress
    });
  }

  if (identity.user.accountStatus !== "ACTIVE") {
    throw new HttpError(403, "Compte inactif ou suspendu");
  }

  await prisma.userIdentity.update({
    where: { id: identity.id },
    data: {
      providerEmail,
      isVerified: true,
      lastUsedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: identity.userId,
      action: "AUTH_SIGNIN_PROVIDER",
      entityType: "USER",
      entityId: identity.userId,
      metadata: { provider: input.provider }
    }
  });

  return issueUserSession({
    userId: identity.userId,
    role: identity.user.role,
    deviceId: input.deviceId,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress
  });
};

export const requestPhoneOtp = async (input: OtpRequestInput) => {
  const phone = normalizePhone(input.phone);
  ensurePhoneCooldown(phone);

  const otpCode = randomOtp();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  const verification = await prisma.verificationCode.create({
    data: {
      userId: input.userId,
      destination: phone,
      provider: AuthProvider.PHONE,
      purpose: input.purpose,
      codeHash: hashCode(otpCode),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt
    }
  });

  // In production this should enqueue an SMS provider job.
  const previewCode = env.NODE_ENV === "development" ? otpCode : undefined;

  return {
    verificationId: verification.id,
    expiresAt,
    resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    previewCode
  };
};

export const verifyPhoneOtpAndSignIn = async (input: OtpVerifyInput) => {
  const verification = await prisma.verificationCode.findUnique({ where: { id: input.verificationId } });
  if (!verification) {
    throw new HttpError(404, "Verification introuvable");
  }

  if (verification.provider !== AuthProvider.PHONE) {
    throw new HttpError(400, "Type de verification invalide");
  }

  if (verification.consumedAt) {
    throw new HttpError(400, "Code OTP deja utilise");
  }

  if (verification.expiresAt <= new Date()) {
    throw new HttpError(400, "Code OTP expire");
  }

  if (verification.attempts >= verification.maxAttempts) {
    throw new HttpError(429, "Trop de tentatives OTP");
  }

  const expectedHash = hashCode(input.code);
  if (expectedHash !== verification.codeHash) {
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } }
    });
    throw new HttpError(401, "Code OTP invalide");
  }

  const destination = input.phone ? normalizePhone(input.phone) : verification.destination;
  if (destination !== verification.destination) {
    throw new HttpError(400, "Numero incoherent pour ce code OTP");
  }

  await prisma.verificationCode.update({
    where: { id: verification.id },
    data: { consumedAt: new Date() }
  });

  let identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.PHONE,
        providerSubject: destination
      }
    },
    include: { user: true }
  });

  if (!identity) {
    const accountType = input.accountType ?? AccountType.USER;
    const displayName = input.displayName?.trim() || "Utilisateur Kin-Sell";
    const username = await createUniqueUsername(displayName);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: destination,
          phoneVerified: true,
          role: accountTypeToRole(accountType),
          preferredAccountType: accountType,
          profileCompleted: false,
          profile: {
            create: {
              displayName,
              username
            }
          },
          preferences: {
            create: {}
          }
        }
      });

      const createdIdentity = await tx.userIdentity.create({
        data: {
          userId: user.id,
          provider: AuthProvider.PHONE,
          providerSubject: destination,
          providerPhone: destination,
          isVerified: true
        },
        include: { user: true }
      });

      return createdIdentity;
    });

    identity = created;
  } else {
    await prisma.user.update({
      where: { id: identity.userId },
      data: {
        phone: destination,
        phoneVerified: true
      }
    });

    await prisma.userIdentity.update({
      where: { id: identity.id },
      data: {
        providerPhone: destination,
        isVerified: true,
        lastUsedAt: new Date()
      }
    });
  }

  return issueUserSession({
    userId: identity.userId,
    role: identity.user.role,
    deviceId: input.deviceId,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress
  });
};

export const completeProfile = async (userId: string, payload: {
  username?: string;
  birthDate?: Date;
  country?: string;
  city?: string;
  addressLine1?: string;
  avatarUrl?: string;
  displayName?: string;
  onlineStatusVisible?: boolean;
  accountType?: AccountType;
  email?: string;
  phone?: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });

  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  const normalizedEmail = payload.email ? normalizeEmail(payload.email) : undefined;
  const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : undefined;
  const avatarUrl = await normalizeImageInput(payload.avatarUrl, { folder: "avatars" });

  let username = payload.username ? slugifyUsername(payload.username) : user.profile?.username ?? undefined;
  if (!username) {
    username = await createUniqueUsername(payload.displayName || user.profile?.displayName || "kinsell");
  } else {
    const existing = await prisma.userProfile.findUnique({ where: { username } });
    if (existing && existing.userId !== userId) {
      throw new HttpError(409, "Pseudo deja utilise");
    }
  }

  const role = accountTypeToRole(payload.accountType ?? user.preferredAccountType);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: normalizedEmail ?? user.email,
        phone: normalizedPhone ?? user.phone,
        preferredAccountType: payload.accountType ?? user.preferredAccountType,
        role,
        profileCompleted: Boolean(
          username &&
          (payload.birthDate ?? user.profile?.birthDate) &&
          (payload.country ?? user.profile?.country) &&
          (payload.city ?? user.profile?.city) &&
          ((normalizedEmail ?? user.email) || (normalizedPhone ?? user.phone))
        )
      }
    });

    await tx.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        username,
        displayName: payload.displayName ?? user.profile?.displayName ?? "Utilisateur Kin-Sell",
        avatarUrl,
        birthDate: payload.birthDate,
        city: payload.city,
        country: payload.country,
        addressLine1: payload.addressLine1
      },
      update: {
        username,
        displayName: payload.displayName,
        avatarUrl,
        birthDate: payload.birthDate,
        city: payload.city,
        country: payload.country,
        addressLine1: payload.addressLine1
      }
    });

    if (payload.onlineStatusVisible !== undefined) {
      await tx.userPreference.upsert({
        where: { userId },
        create: {
          userId,
          onlineStatusVisible: payload.onlineStatusVisible,
        },
        update: {
          onlineStatusVisible: payload.onlineStatusVisible,
        },
      });
    }

    if (normalizedEmail) {
      // Delete old email identity if email is changing
      if (user.email && normalizedEmail !== normalizeEmail(user.email)) {
        await tx.userIdentity.deleteMany({
          where: {
            userId,
            provider: AuthProvider.EMAIL,
            providerSubject: { not: normalizedEmail },
          },
        });
        // Reset email verification since email changed
        await tx.user.update({
          where: { id: userId },
          data: { emailVerified: false },
        });
      }
      await tx.userIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: AuthProvider.EMAIL,
            providerSubject: normalizedEmail
          }
        },
        create: {
          userId,
          provider: AuthProvider.EMAIL,
          providerSubject: normalizedEmail,
          providerEmail: normalizedEmail,
          isVerified: false
        },
        update: {
          userId,
          providerEmail: normalizedEmail,
          lastUsedAt: new Date()
        }
      });
    }

    if (normalizedPhone) {
      await tx.userIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: AuthProvider.PHONE,
            providerSubject: normalizedPhone
          }
        },
        create: {
          userId,
          provider: AuthProvider.PHONE,
          providerSubject: normalizedPhone,
          providerPhone: normalizedPhone,
          isVerified: user.phoneVerified
        },
        update: {
          userId,
          providerPhone: normalizedPhone,
          lastUsedAt: new Date()
        }
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "ACCOUNT_PROFILE_COMPLETED",
        entityType: "USER",
        entityId: userId
      }
    });
  });

  return userPayload(userId);
};

export const refreshAuth = async (refreshToken: string) => {
  const rotated = await rotateSessionTokens(refreshToken);
  return {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    sessionId: rotated.sessionId,
    user: await userPayload(rotated.user.id)
  };
};

export const logoutCurrentSession = async (sessionId?: string) => {
  if (!sessionId) {
    return { success: true };
  }

  await revokeSession(sessionId);
  return { success: true };
};

export const listSessions = async (userId: string, currentSessionId?: string) => {
  const sessions = await prisma.userSession.findMany({
    where: {
      userId,
      status: SessionStatus.ACTIVE,
      expiresAt: { gt: new Date() }
    },
    orderBy: { lastSeenAt: "desc" }
  });

  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      isCurrent: session.id === currentSessionId
    }))
  };
};

export const revokeSessionById = async (userId: string, sessionId: string) => {
  await prisma.userSession.updateMany({
    where: {
      id: sessionId,
      userId,
      status: SessionStatus.ACTIVE
    },
    data: {
      status: SessionStatus.REVOKED,
      revokedAt: new Date()
    }
  });

  return { success: true };
};

export const revokeAllOtherUserSessions = async (userId: string, currentSessionId?: string) => {
  if (!currentSessionId) {
    throw new HttpError(400, "Session courante introuvable");
  }

  await revokeOtherSessions(userId, currentSessionId);
  return { success: true };
};

export const requestEmailVerification = async (userId: string, email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const code = randomOtp();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  const verification = await prisma.verificationCode.create({
    data: {
      userId,
      destination: normalizedEmail,
      provider: AuthProvider.EMAIL,
      purpose: VerificationPurpose.VERIFY_EMAIL,
      codeHash: hashCode(code),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt
    }
  });

  await sendOtpEmail(normalizedEmail, code);

  return {
    verificationId: verification.id,
    expiresAt,
    previewCode: env.NODE_ENV === "development" ? code : undefined
  };
};

export const confirmEmailVerification = async (userId: string, verificationId: string, code: string) => {
  const verification = await prisma.verificationCode.findUnique({ where: { id: verificationId } });

  if (!verification || verification.userId !== userId) {
    throw new HttpError(404, "Verification introuvable");
  }

  if (verification.provider !== AuthProvider.EMAIL || verification.purpose !== VerificationPurpose.VERIFY_EMAIL) {
    throw new HttpError(400, "Type de verification invalide");
  }

  if (verification.expiresAt <= new Date()) {
    throw new HttpError(400, "Code expire");
  }

  if (verification.consumedAt) {
    throw new HttpError(400, "Code deja utilise");
  }

  if (verification.attempts >= verification.maxAttempts) {
    throw new HttpError(429, "Trop de tentatives");
  }

  if (hashCode(code) !== verification.codeHash) {
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } }
    });
    throw new HttpError(401, "Code invalide");
  }

  await prisma.$transaction(async (tx) => {
    await tx.verificationCode.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() }
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        email: verification.destination,
        emailVerified: true
      }
    });

    await tx.userIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.EMAIL,
          providerSubject: verification.destination
        }
      },
      create: {
        userId,
        provider: AuthProvider.EMAIL,
        providerSubject: verification.destination,
        providerEmail: verification.destination,
        isVerified: true
      },
      update: {
        userId,
        providerEmail: verification.destination,
        isVerified: true,
        lastUsedAt: new Date()
      }
    });
  });

  return { success: true };
};

// ═══════════════════════════════════════════════════════════════
// 2FA — TOTP (Google Authenticator, Microsoft Authenticator, etc.)
// ═══════════════════════════════════════════════════════════════

/** Génère un secret TOTP et retourne l'URI pour le QR code */
export const setupTotp = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true, totpEnabled: true, profile: { select: { username: true, displayName: true } } }
  });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (user.totpEnabled) throw new HttpError(400, "L'authentification TOTP est déjà activée.");

  const secret = generateSecret({ length: 20 });
  const label = user.profile?.username || user.profile?.displayName || user.email || "Utilisateur";
  const uri = generateURI({ label: `Kin-Sell:${label}`, issuer: "Kin-Sell", secret });

  // Stocker le secret (non encore activé)
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });

  return { secret, uri };
};

/** Vérifie le premier code TOTP et active la 2FA */
export const enableTotp = async (userId: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabled: true } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (user.totpEnabled) throw new HttpError(400, "TOTP déjà activé.");
  if (!user.totpSecret) throw new HttpError(400, "Configurez d'abord l'authentificator (étape setup).");

  const valid = totpVerify({ token: code.replace(/\s/g, ""), secret: user.totpSecret });
  if (!valid) throw new HttpError(401, "Code invalide. Réessayez.");

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await prisma.auditLog.create({ data: { actorUserId: userId, action: "AUTH_TOTP_ENABLED", entityType: "USER", entityId: userId } });

  return { success: true };
};

/** Désactive la 2FA TOTP après vérification du mot de passe */
export const disableTotp = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true, passwordHash: true } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (!user.totpEnabled) throw new HttpError(400, "TOTP non activé.");
  if (!user.passwordHash) throw new HttpError(400, "Compte sans mot de passe. Contactez le support.");

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Mot de passe incorrect.");

  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
  await prisma.auditLog.create({ data: { actorUserId: userId, action: "AUTH_TOTP_DISABLED", entityType: "USER", entityId: userId } });

  return { success: true };
};

/** Vérifie le code TOTP lors du challenge de connexion et émet une session complète */
export const verifyTotpChallenge = async (challengeToken: string, code: string, deviceId?: string, userAgent?: string, ipAddress?: string) => {
  let payload: { sub: string; type: string };
  try {
    payload = jwt.verify(challengeToken, env.JWT_SECRET) as { sub: string; type: string };
  } catch {
    throw new HttpError(401, "Challenge TOTP expiré ou invalide. Reconnectez-vous.");
  }

  if (payload.type !== "totp-challenge") throw new HttpError(401, "Token invalide.");

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, accountStatus: true, totpEnabled: true, totpSecret: true } });
  if (!user) throw new HttpError(404, "Compte introuvable.");
  if (!user.totpEnabled || !user.totpSecret) throw new HttpError(400, "TOTP non configuré sur ce compte.");
  if (user.accountStatus !== "ACTIVE") throw new HttpError(403, "Compte inactif ou suspendu.");

  const valid = totpVerify({ token: code.replace(/\s/g, ""), secret: user.totpSecret });
  if (!valid) throw new HttpError(401, "Code invalide ou expiré.");

  await prisma.auditLog.create({ data: { actorUserId: user.id, action: "AUTH_TOTP_VERIFIED", entityType: "USER", entityId: user.id } });

  return issueUserSession({ userId: user.id, role: user.role, deviceId, userAgent, ipAddress });
};

/** Renvoie le statut TOTP de l'utilisateur courant */
export const getTotpStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  return { totpEnabled: user.totpEnabled };
};

// ═══════════════════════════════════════════════════════
// SUPPRESSION DE COMPTE (grâce 30 jours)
// ═══════════════════════════════════════════════════════

export const requestAccountDeletion = async (userId: string, reason: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, accountStatus: true } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (user.accountStatus === "PENDING_DELETION") {
    throw new HttpError(409, "Une demande de suppression est déjà en cours pour ce compte.");
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: "PENDING_DELETION",
      deletionRequestedAt: now,
      deletionReason: reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "ACCOUNT_DELETION_REQUESTED",
      entityType: "USER",
      entityId: userId,
      metadata: { reason, requestedAt: now.toISOString() },
    },
  });

  return { ok: true, scheduledDeletionAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() };
};

// ═══════════════════════════════════════════════════════
// APPEL DE SUSPENSION
// ═══════════════════════════════════════════════════════

export const submitSuspensionAppeal = async (userId: string, message: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, accountStatus: true } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (user.accountStatus !== "SUSPENDED") {
    throw new HttpError(400, "Votre compte n'est pas suspendu. Aucun appel n'est nécessaire.");
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "SUSPENSION_APPEAL_SUBMITTED",
      entityType: "USER",
      entityId: userId,
      metadata: { message, submittedAt: new Date().toISOString() },
    },
  });

  return { ok: true };
};

// ═══════════════════════════════════════════════════════════════
// PASSWORD RECOVERY (reset via email OTP)
// ═══════════════════════════════════════════════════════════════

export const requestPasswordReset = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);

  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: normalizedEmail,
      },
    },
    include: { user: true },
  });

  if (!identity) {
    // Ne pas révéler si l'email existe ou non
    return { ok: true, message: "Si ce compte existe, un code a été envoyé." };
  }

  if (!identity.user.passwordHash) {
    return { ok: true, message: "Si ce compte existe, un code a été envoyé." };
  }

  const code = randomOtp();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  const verification = await prisma.verificationCode.create({
    data: {
      userId: identity.userId,
      destination: normalizedEmail,
      provider: AuthProvider.EMAIL,
      purpose: VerificationPurpose.PASSWORD_RESET,
      codeHash: hashCode(code),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt,
    },
  });

  await sendOtpEmail(normalizedEmail, code);

  return {
    ok: true,
    verificationId: verification.id,
    message: "Si ce compte existe, un code a été envoyé.",
    previewCode: env.NODE_ENV === "development" ? code : undefined,
  };
};

export const confirmPasswordReset = async (
  verificationId: string,
  code: string,
  newPassword: string
) => {
  const verification = await prisma.verificationCode.findUnique({
    where: { id: verificationId },
  });

  if (!verification) throw new HttpError(404, "Vérification introuvable");
  if (verification.purpose !== VerificationPurpose.PASSWORD_RESET) {
    throw new HttpError(400, "Type de vérification invalide");
  }
  if (verification.consumedAt) throw new HttpError(400, "Code déjà utilisé");
  if (verification.expiresAt <= new Date()) throw new HttpError(400, "Code expiré");
  if (verification.attempts >= verification.maxAttempts) {
    throw new HttpError(429, "Trop de tentatives");
  }

  if (hashCode(code) !== verification.codeHash) {
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    throw new HttpError(401, "Code invalide");
  }

  const userId = verification.userId;
  if (!userId) throw new HttpError(400, "Vérification non liée à un compte");

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.verificationCode.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });

    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "AUTH_PASSWORD_RESET",
        entityType: "USER",
        entityId: userId,
      },
    });
  });

  return { ok: true };
};

/* ── Change password (logged-in user) ── */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (!user.passwordHash) throw new HttpError(400, "Ce compte n'a pas de mot de passe (connexion via réseau social)");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(401, "Mot de passe actuel incorrect");

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "AUTH_PASSWORD_CHANGE",
        entityType: "USER",
        entityId: userId,
      },
    });
  });

  return { ok: true };
};
