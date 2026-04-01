import { AccountType, AuthProvider } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../shared/db/prisma.js";
import { createSessionTokens } from "../../shared/auth/session.js";
import { slugifyUsername } from "../../shared/utils/identity-normalizers.js";
import { Role } from "../../types/roles.js";
import { logger } from "../../shared/logger.js";
import { sendWelcomeEmail } from "../../shared/email/mailer.js";

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export const getGoogleAuthUrl = (): string => {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID non configuré");

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeCodeForTokens = async (code: string): Promise<GoogleTokenResponse> => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "[Google] Token exchange failed");
    throw new Error("Google token exchange failed");
  }

  return response.json() as Promise<GoogleTokenResponse>;
};

const fetchGoogleUser = async (accessToken: string): Promise<GoogleUserInfo> => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error("Google userinfo fetch failed");
  return response.json() as Promise<GoogleUserInfo>;
};

const createUniqueUsername = async (seed: string): Promise<string> => {
  const base = slugifyUsername(seed) || `ks-${Math.random().toString(36).slice(2, 8)}`;
  let candidate = base;
  let index = 1;

  while (true) {
    const exists = await prisma.userProfile.findUnique({ where: { username: candidate } });
    if (!exists) return candidate;
    index += 1;
    candidate = `${base}-${index}`;
  }
};

export const handleGoogleCallback = async (code: string) => {
  const tokens = await exchangeCodeForTokens(code);
  const googleUser = await fetchGoogleUser(tokens.access_token);

  // Check if identity already exists
  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.GOOGLE,
        providerSubject: googleUser.sub,
      },
    },
    include: { user: { include: { profile: true } } },
  });

  let userId: string;
  let isNewUser = false;

  if (existingIdentity) {
    // Existing Google user — update last used
    userId = existingIdentity.userId;
    await prisma.userIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        providerEmail: googleUser.email,
        isVerified: googleUser.email_verified,
        lastUsedAt: new Date(),
      },
    });
  } else {
    // Check if email already exists (user registered with email/password)
    const existingUser = await prisma.user.findUnique({
      where: { email: googleUser.email.toLowerCase() },
    });

    if (existingUser) {
      // Link Google to existing account
      userId = existingUser.id;
      await prisma.userIdentity.create({
        data: {
          userId: existingUser.id,
          provider: AuthProvider.GOOGLE,
          providerSubject: googleUser.sub,
          providerEmail: googleUser.email,
          isVerified: googleUser.email_verified,
        },
      });

      // Mark email as verified if Google says so
      if (googleUser.email_verified && !existingUser.emailVerified) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { emailVerified: true },
        });
      }
    } else {
      // Brand new user via Google
      isNewUser = true;
      const username = await createUniqueUsername(googleUser.name || googleUser.email.split("@")[0]);

      const newUser = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: googleUser.email.toLowerCase(),
            emailVerified: googleUser.email_verified,
            role: Role.USER,
            preferredAccountType: AccountType.USER,
            profileCompleted: false,
            profile: {
              create: {
                displayName: googleUser.name,
                username,
                avatarUrl: googleUser.picture,
              },
            },
            preferences: { create: {} },
          },
        });

        await tx.userIdentity.create({
          data: {
            userId: created.id,
            provider: AuthProvider.GOOGLE,
            providerSubject: googleUser.sub,
            providerEmail: googleUser.email,
            isVerified: googleUser.email_verified,
          },
        });

        return created;
      });

      userId = newUser.id;
    }
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: isNewUser ? "AUTH_REGISTER_GOOGLE" : "AUTH_LOGIN_GOOGLE",
      entityType: "USER",
      entityId: userId,
    },
  });

  // Send welcome email for new users
  if (isNewUser) {
    sendWelcomeEmail(googleUser.email, googleUser.name).catch(() => {});
  }

  // Create session — fetch user first to get actual role
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true },
  });

  const session = await createSessionTokens({
    userId,
    role: user.role,
    deviceId: "google-oauth",
  });

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.profile?.displayName ?? googleUser.name,
    },
    isNewUser,
  };
};
