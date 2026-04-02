import { prisma } from "../../shared/db/prisma.js";

type LiveFeaturedListing = {
  id: string;
  title: string;
  priceUsdCents: number;
  city: string;
  imageUrl: string | null;
  type: "PRODUIT" | "SERVICE";
};

async function attachFeaturedListing<T extends { featuredListingId: string | null }>(lives: T[]) {
  const listingIds = Array.from(new Set(lives.map((l) => l.featuredListingId).filter((id): id is string => Boolean(id))));
  if (listingIds.length === 0) {
    return lives.map((live) => ({ ...live, featuredListing: null }));
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      priceUsdCents: true,
      city: true,
      imageUrl: true,
      type: true,
    },
  });

  const map = new Map<string, LiveFeaturedListing>(listings.map((l) => [l.id, l]));
  return lives.map((live) => ({
    ...live,
    featuredListing: live.featuredListingId ? map.get(live.featuredListingId) ?? null : null,
  }));
}

/* ── Créer un live ── */
export async function createLive(
  hostId: string,
  data: { title: string; description?: string; aspect: "LANDSCAPE" | "PORTRAIT"; tags?: string[]; city?: string; thumbnailUrl?: string; featuredListingId?: string }
) {
  let featuredListingId: string | null = null;

  if (data.featuredListingId) {
    const listing = await prisma.listing.findFirst({
      where: {
        id: data.featuredListingId,
        ownerUserId: hostId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (!listing) {
      throw new Error("Article introuvable ou non autorisé");
    }

    featuredListingId = listing.id;
  }

  return prisma.soKinLive.create({
    data: {
      hostId,
      title: data.title,
      description: data.description ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      aspect: data.aspect,
      tags: data.tags ?? [],
      city: data.city ?? null,
      featuredListingId,
      status: "WAITING",
    },
    include: {
      host: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true, city: true } } } },
    },
  });
}

/* ── Démarrer le live (passer de WAITING -> LIVE) ── */
export async function startLive(liveId: string, hostId: string) {
  return prisma.soKinLive.update({
    where: { id: liveId, hostId },
    data: { status: "LIVE", startedAt: new Date() },
  });
}

/* ── Terminer le live ── */
export async function endLive(liveId: string, hostId: string) {
  return prisma.soKinLive.update({
    where: { id: liveId, hostId },
    data: { status: "ENDED", endedAt: new Date() },
  });
}

/* ── Obtenir un live par ID ── */
export async function getLiveById(liveId: string) {
  const live = await prisma.soKinLive.findUnique({
    where: { id: liveId },
    include: {
      host: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true, city: true } } } },
      participants: {
        where: { leftAt: null },
        include: {
          user: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
        },
        orderBy: { joinedAt: "desc" },
        take: 50,
      },
    },
  });
  if (!live) return null;
  const [withListing] = await attachFeaturedListing([live]);
  return withListing;
}

/* ── Lister les lives actifs (WAITING + LIVE) ── */
export async function getActiveLives(limit = 20) {
  const lives = await prisma.soKinLive.findMany({
    where: { status: { in: ["WAITING", "LIVE"] } },
    include: {
      host: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true, city: true } } } },
    },
    orderBy: [{ status: "asc" }, { viewerCount: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return attachFeaturedListing(lives);
}

/* ── Lister l'historique des lives terminés / annulés ── */
export async function getLiveHistory(limit = 20) {
  const lives = await prisma.soKinLive.findMany({
    where: { status: { in: ["ENDED", "CANCELED"] } },
    include: {
      host: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true, city: true } } } },
    },
    orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return attachFeaturedListing(lives);
}

export async function getHostLiveListings(liveId: string, hostId: string) {
  const live = await prisma.soKinLive.findUnique({ where: { id: liveId }, select: { id: true, hostId: true } });
  if (!live || live.hostId !== hostId) return [];

  return prisma.listing.findMany({
    where: { ownerUserId: hostId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      priceUsdCents: true,
      city: true,
      imageUrl: true,
      type: true,
    },
  });
}

export async function setLiveFeaturedListing(liveId: string, hostId: string, listingId: string | null) {
  const live = await prisma.soKinLive.findUnique({ where: { id: liveId }, select: { id: true, hostId: true } });
  if (!live || live.hostId !== hostId) {
    throw new Error("Live introuvable ou non autorisé");
  }

  if (listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ownerUserId: hostId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!listing) throw new Error("Article introuvable ou non autorisé");
  }

  await prisma.soKinLive.update({
    where: { id: liveId },
    data: { featuredListingId: listingId },
  });

  return getLiveById(liveId);
}

/* ── Rejoindre un live ── */
export async function joinLive(liveId: string, userId: string, role = "VIEWER") {
  const participant = await prisma.soKinLiveParticipant.upsert({
    where: { liveId_userId: { liveId, userId } },
    create: { liveId, userId, role },
    update: { leftAt: null, role },
  });

  // Incrémenter le compteur de viewers
  await prisma.soKinLive.update({
    where: { id: liveId },
    data: {
      viewerCount: { increment: 1 },
      peakViewers: {
        // Le peakViewers sera mis à jour si viewerCount > peakViewers via un trigger ou un check
        increment: 0,
      },
    },
  });

  // Mettre à jour le peakViewers si nécessaire
  const live = await prisma.soKinLive.findUnique({ where: { id: liveId }, select: { viewerCount: true, peakViewers: true } });
  if (live && live.viewerCount > live.peakViewers) {
    await prisma.soKinLive.update({
      where: { id: liveId },
      data: { peakViewers: live.viewerCount },
    });
  }

  return participant;
}

/* ── Quitter un live ── */
export async function leaveLive(liveId: string, userId: string) {
  await prisma.soKinLiveParticipant.updateMany({
    where: { liveId, userId, leftAt: null },
    data: { leftAt: new Date() },
  });

  await prisma.soKinLive.update({
    where: { id: liveId },
    data: { viewerCount: { decrement: 1 } },
  });
}

/* ── Demander à participer (monter sur le live) ── */
export async function requestJoinAsGuest(liveId: string, userId: string) {
  return prisma.soKinLiveParticipant.upsert({
    where: { liveId_userId: { liveId, userId } },
    create: { liveId, userId, role: "GUEST" },
    update: { role: "GUEST", leftAt: null },
    include: {
      user: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
    },
  });
}

/* ── Envoyer un message dans le chat live ── */
export async function sendLiveChatMessage(
  liveId: string,
  userId: string,
  text: string,
  isGift = false,
  giftType?: string
) {
  return prisma.soKinLiveChat.create({
    data: { liveId, userId, text, isGift, giftType: giftType ?? null },
    include: {
      user: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
    },
  });
}

/* ── Récupérer les messages du chat live ── */
export async function getLiveChatMessages(liveId: string, limit = 100) {
  return prisma.soKinLiveChat.findMany({
    where: { liveId },
    include: {
      user: { include: { profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/* ── Liker un live ── */
export async function likeLive(liveId: string) {
  return prisma.soKinLive.update({
    where: { id: liveId },
    data: { likesCount: { increment: 1 } },
  });
}
