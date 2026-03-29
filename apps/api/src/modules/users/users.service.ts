import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

type UpdateMeInput = {
  displayName?: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  bio?: string;
  domain?: string;
  qualification?: string;
  experience?: string;
  workHours?: string;
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });

  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  return {
    id: user.id,
    role: user.role,
    accountStatus: user.accountStatus,
    email: user.email,
    displayName: user.profile?.displayName ?? "",
    avatarUrl: user.profile?.avatarUrl ?? null,
    city: user.profile?.city ?? null,
    country: user.profile?.country ?? null,
    bio: user.profile?.bio ?? null,
    domain: user.profile?.domain ?? null,
    qualification: user.profile?.qualification ?? null,
    experience: user.profile?.experience ?? null,
    workHours: user.profile?.workHours ?? null,
    verificationStatus: user.profile?.verificationStatus ?? "UNVERIFIED"
  };
};

export const updateMe = async (userId: string, payload: UpdateMeInput) => {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      displayName: payload.displayName ?? "Utilisateur Kin-Sell",
      avatarUrl: payload.avatarUrl,
      city: payload.city,
      country: payload.country,
      bio: payload.bio,
      domain: payload.domain,
      qualification: payload.qualification,
      experience: payload.experience,
      workHours: payload.workHours
    },
    update: {
      ...(payload.displayName !== undefined && { displayName: payload.displayName }),
      ...(payload.avatarUrl !== undefined && { avatarUrl: payload.avatarUrl }),
      ...(payload.city !== undefined && { city: payload.city }),
      ...(payload.country !== undefined && { country: payload.country }),
      ...(payload.bio !== undefined && { bio: payload.bio }),
      ...(payload.domain !== undefined && { domain: payload.domain }),
      ...(payload.qualification !== undefined && { qualification: payload.qualification }),
      ...(payload.experience !== undefined && { experience: payload.experience }),
      ...(payload.workHours !== undefined && { workHours: payload.workHours })
    }
  });

  return {
    userId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    city: profile.city,
    country: profile.country,
    bio: profile.bio,
    domain: profile.domain,
    qualification: profile.qualification,
    experience: profile.experience,
    workHours: profile.workHours,
    verificationStatus: profile.verificationStatus
  };
};

export const getPublicProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });

  if (!user) {
    throw new HttpError(404, "Profil public introuvable");
  }

  return {
    id: user.id,
    role: user.role,
    displayName: user.profile?.displayName ?? "Utilisateur Kin-Sell",
    avatarUrl: user.profile?.avatarUrl ?? null,
    city: user.profile?.city ?? null,
    country: user.profile?.country ?? null,
    verificationStatus: user.profile?.verificationStatus ?? "UNVERIFIED"
  };
};

export const getPublicProfileByUsername = async (username: string) => {
  const normalizedUsername = username.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      profile: {
        username: normalizedUsername
      }
    },
    include: {
      profile: true,
      listings: {
        where: { isPublished: true, status: "ACTIVE" },
        take: 20,
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!user || !user.profile) {
    throw new HttpError(404, "Profil public introuvable");
  }

  return {
    id: user.id,
    username: user.profile.username,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    city: user.profile.city,
    country: user.profile.country,
    bio: user.profile.bio,
    domain: user.profile.domain,
    qualification: user.profile.qualification,
    experience: user.profile.experience,
    workHours: user.profile.workHours,
    verificationStatus: user.profile.verificationStatus,
    accountType: user.preferredAccountType,
    listings: user.listings.map((listing) => ({
      id: listing.id,
      type: listing.type,
      title: listing.title,
      category: listing.category,
      city: listing.city,
      imageUrl: listing.imageUrl,
      priceUsdCents: listing.priceUsdCents,
      createdAt: listing.createdAt
    }))
  };
};
