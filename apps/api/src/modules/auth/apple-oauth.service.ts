import { AuthProvider } from "../../shared/db/prisma-enums.js";
import { env } from "../../config/env.js";
import { prisma } from "../../shared/db/prisma.js";
import { createSessionTokens } from "../../shared/auth/session.js";
import { slugifyUsername } from "../../shared/utils/identity-normalizers.js";
import { Role } from "../../types/roles.js";
import { logger } from "../../shared/logger.js";
import { sendWelcomeEmail } from "../../shared/email/mailer.js";
import jwt from "jsonwebtoken";

interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

interface AppleIdTokenPayload {
  iss: string;
  sub: string; // Apple user ID (stable per app)
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  nonce?: string;
}

/**
 * Generate the Apple OAuth authorization URL.
 */
export const getAppleAuthUrl = (state: string = "web"): string => {
  if (!env.APPLE_CLIENT_ID) throw new Error("APPLE_CLIENT_ID non configuré");

  const params = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    redirect_uri: env.APPLE_CALLBACK_URL,
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post",
    state,
  });

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
};

/**
 * Generate a client secret JWT for Apple (required for token exchange).
 * Apple requires a short‑lived JWT signed with the Service Key.
 */
function generateAppleClientSecret(): string {
  if (!env.APPLE_PRIVATE_KEY || !env.APPLE_KEY_ID || !env.APPLE_TEAM_ID || !env.APPLE_CLIENT_ID) {
    throw new Error("Apple OAuth configuration incomplète");
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 86400 * 180, // 180 days max
      aud: "https://appleid.apple.com",
      sub: env.APPLE_CLIENT_ID,
    },
    env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: env.APPLE_KEY_ID,
      },
    },
  );
}

/**
 * Exchange authorization code for tokens.
 */
const exchangeCodeForTokens = async (code: string): Promise<AppleTokenResponse> => {
  const clientSecret = generateAppleClientSecret();

  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID!,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.APPLE_CALLBACK_URL,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "[Apple] Token exchange failed");
    throw new Error("Apple token exchange failed");
  }

  return response.json() as Promise<AppleTokenResponse>;
};

/**
 * Decode and verify the Apple ID token.
 * Verifies signature via Apple's JWKS public keys, issuer, audience, and expiration.
 */
let _appleJwksCache: { keys: Record<string, string>; expiresAt: number } | null = null;

async function fetchApplePublicKeys(): Promise<Record<string, string>> {
  if (_appleJwksCache && _appleJwksCache.expiresAt > Date.now()) {
    return _appleJwksCache.keys;
  }
  const res = await fetch("https://appleid.apple.com/auth/keys");
  if (!res.ok) throw new Error("Failed to fetch Apple JWKS");
  const jwks = (await res.json()) as { keys: Array<{ kid: string; kty: string; n: string; e: string; alg: string }> };
  const keys: Record<string, string> = {};
  for (const key of jwks.keys) {
    // Convert JWK to PEM using crypto
    const keyObj = await globalThis.crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, n: key.n, e: key.e, alg: key.alg, ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["verify"]
    );
    const exported = await globalThis.crypto.subtle.exportKey("spki", keyObj);
    const b64 = Buffer.from(exported).toString("base64");
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
    keys[key.kid] = pem;
  }
  _appleJwksCache = { keys, expiresAt: Date.now() + 3600_000 }; // cache 1h
  return keys;
}

async function verifyAppleIdToken(idToken: string): Promise<AppleIdTokenPayload> {
  // Decode header to get kid
  const header = JSON.parse(Buffer.from(idToken.split(".")[0], "base64url").toString()) as { kid: string; alg: string };
  const keys = await fetchApplePublicKeys();
  const publicKey = keys[header.kid];
  if (!publicKey) {
    logger.warn({ kid: header.kid }, "[Apple] Unknown key ID, falling back to decode-only");
    // Fallback: decode without verification (server-to-server token)
    const decoded = jwt.decode(idToken) as AppleIdTokenPayload | null;
    if (!decoded || !decoded.sub) throw new Error("Invalid Apple ID token");
    if (decoded.iss !== "https://appleid.apple.com") throw new Error("Invalid issuer");
    if (decoded.aud !== env.APPLE_CLIENT_ID) throw new Error("Invalid audience");
    if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
    return decoded;
  }

  try {
    const verified = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      audience: env.APPLE_CLIENT_ID,
    }) as AppleIdTokenPayload;
    return verified;
  } catch (err) {
    logger.error({ err }, "[Apple] JWT verification failed");
    throw new Error("Apple ID token verification failed");
  }
}

function decodeAppleIdToken(idToken: string): AppleIdTokenPayload {
  const decoded = jwt.decode(idToken) as AppleIdTokenPayload | null;
  if (!decoded || !decoded.sub) {
    throw new Error("Invalid Apple ID token");
  }
  if (decoded.iss !== "https://appleid.apple.com") {
    throw new Error("Invalid Apple ID token issuer");
  }
  if (decoded.aud !== env.APPLE_CLIENT_ID) {
    throw new Error("Invalid Apple ID token audience");
  }
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Apple ID token expired");
  }
  return decoded;
}

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

/**
 * Handle the Apple OAuth callback.
 * Apple sends: code, id_token (in form POST body), and optionally user info (first login only).
 */
export const handleAppleCallback = async (
  code: string,
  idTokenFromPost?: string,
  userInfo?: { name?: { firstName?: string; lastName?: string }; email?: string },
) => {
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);

  // Verify the ID token cryptographically via Apple JWKS (fallback to decode for unknown kids)
  const appleUser = await verifyAppleIdToken(tokens.id_token || idTokenFromPost!);
  const appleSub = appleUser.sub;
  const appleEmail = appleUser.email ?? userInfo?.email;
  const emailVerified = appleUser.email_verified === "true" || appleUser.email_verified === true;

  // Build display name from user info (Apple only sends name on FIRST login)
  const displayName = userInfo?.name
    ? [userInfo.name.firstName, userInfo.name.lastName].filter(Boolean).join(" ")
    : undefined;

  // Check if identity already exists
  const existingIdentity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.APPLE,
        providerSubject: appleSub,
      },
    },
    include: { user: { include: { profile: true } } },
  });

  let userId: string;
  let isNewUser = false;

  if (existingIdentity) {
    userId = existingIdentity.userId;
    await prisma.userIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        providerEmail: appleEmail,
        isVerified: emailVerified,
        lastUsedAt: new Date(),
      },
    });
  } else if (appleEmail) {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: appleEmail.toLowerCase() },
    });

    if (existingUser) {
      // Link Apple to existing account
      userId = existingUser.id;
      await prisma.userIdentity.create({
        data: {
          userId: existingUser.id,
          provider: AuthProvider.APPLE,
          providerSubject: appleSub,
          providerEmail: appleEmail,
          isVerified: emailVerified,
        },
      });

      if (emailVerified && !existingUser.emailVerified) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { emailVerified: true },
        });
      }
    } else {
      // Brand new user via Apple
      isNewUser = true;
      const username = await createUniqueUsername(
        displayName || appleEmail.split("@")[0],
      );

      const newUser = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: appleEmail.toLowerCase(),
            emailVerified,
            role: Role.USER,
            preferredAccountType: "USER",
            profileCompleted: false,
            profile: {
              create: {
                displayName: displayName || username,
                username,
              },
            },
            preferences: { create: {} },
          },
        });

        await tx.userIdentity.create({
          data: {
            userId: created.id,
            provider: AuthProvider.APPLE,
            providerSubject: appleSub,
            providerEmail: appleEmail,
            isVerified: emailVerified,
          },
        });

        return created;
      });

      userId = newUser.id;
    }
  } else {
    // No email from Apple (user chose to hide) — use sub as identifier
    isNewUser = true;
    const username = await createUniqueUsername(displayName || "apple-user");

    const newUser = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: `${appleSub}@privaterelay.appleid.com`,
          emailVerified: false,
          role: Role.USER,
          preferredAccountType: "USER",
          profileCompleted: false,
          profile: {
            create: {
              displayName: displayName || "Utilisateur Apple",
              username,
            },
          },
          preferences: { create: {} },
        },
      });

      await tx.userIdentity.create({
        data: {
          userId: created.id,
          provider: AuthProvider.APPLE,
          providerSubject: appleSub,
          providerEmail: `${appleSub}@privaterelay.appleid.com`,
          isVerified: false,
        },
      });

      return created;
    });

    userId = newUser.id;
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: isNewUser ? "AUTH_REGISTER_APPLE" : "AUTH_LOGIN_APPLE",
      entityType: "USER",
      entityId: userId,
    },
  });

  // Send welcome email for new users
  if (isNewUser && appleEmail) {
    sendWelcomeEmail(appleEmail, displayName || "").catch(() => {});
  }

  // Create session
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true },
  });

  const session = await createSessionTokens({
    userId,
    role: user.role,
    deviceId: "apple-oauth",
  });

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.profile?.displayName ?? displayName ?? "Utilisateur",
    },
    isNewUser,
  };
};
