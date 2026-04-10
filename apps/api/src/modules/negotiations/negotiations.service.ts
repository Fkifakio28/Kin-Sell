import { NegotiationStatus, NegotiationType, CartStatus, OrderStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { randomBytes } from "crypto";
import { sendPushToUser } from "../notifications/push.service.js";
import { emitToUsers, emitToUser, isUserOnline } from "../messaging/socket.js";

const NEGOTIATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 heures
const GROUPED_TTL_MS = 72 * 60 * 60 * 1000; // 72 heures pour groupé

type CreateNegotiationPayload = {
  listingId: string;
  proposedPriceUsdCents: number;
  quantity: number;
  message?: string;
  type?: "SIMPLE" | "QUANTITY" | "GROUPED";
  minBuyers?: number;
};

type CreateBundleNegotiationPayload = {
  items: { listingId: string; quantity: number }[];
  proposedTotalUsdCents: number;
  message?: string;
  type?: "SIMPLE" | "QUANTITY" | "GROUPED";
  minBuyers?: number;
};

type RespondPayload = {
  action: "ACCEPT" | "REFUSE" | "COUNTER";
  counterPriceUsdCents?: number;
  message?: string;
};

const resolveSellerBusinessIds = async (userId: string) => {
  const businesses = await prisma.businessAccount.findMany({
    where: { ownerUserId: userId },
    select: { id: true }
  });
  return businesses.map((b) => b.id);
};

const mapNegotiation = (neg: any) => ({
  id: neg.id,
  buyerUserId: neg.buyerUserId,
  sellerUserId: neg.sellerUserId,
  listingId: neg.listingId,
  type: neg.type,
  status: neg.status,
  originalPriceUsdCents: neg.originalPriceUsdCents,
  finalPriceUsdCents: neg.finalPriceUsdCents,
  quantity: neg.quantity,
  groupId: neg.groupId ?? null,
  minBuyers: neg.minBuyers ?? null,
  bundleId: neg.bundleId ?? null,
  expiresAt: neg.expiresAt.toISOString(),
  resolvedAt: neg.resolvedAt?.toISOString() ?? null,
  createdAt: neg.createdAt.toISOString(),
  updatedAt: neg.updatedAt.toISOString(),
  listing: neg.listing
    ? {
        id: neg.listing.id,
        type: neg.listing.type,
        title: neg.listing.title,
        category: neg.listing.category,
        city: neg.listing.city,
        imageUrl: neg.listing.imageUrl,
        priceUsdCents: neg.listing.priceUsdCents
      }
    : null,
  buyer: neg.buyer?.profile
    ? { userId: neg.buyer.id, displayName: neg.buyer.profile.displayName }
    : { userId: neg.buyerUserId, displayName: "Acheteur" },
  seller: neg.seller?.profile
    ? { userId: neg.seller.id, displayName: neg.seller.profile.displayName }
    : { userId: neg.sellerUserId, displayName: "Vendeur" },
  offers: (neg.offers ?? []).map((o: any) => ({
    id: o.id,
    fromUserId: o.fromUserId,
    priceUsdCents: o.priceUsdCents,
    quantity: o.quantity,
    message: o.message,
    createdAt: o.createdAt.toISOString(),
    fromDisplayName: o.fromUser?.profile?.displayName ?? "Utilisateur"
  }))
});

const negotiationInclude = {
  listing: {
    select: { id: true, type: true, title: true, category: true, city: true, imageUrl: true, priceUsdCents: true }
  },
  buyer: { include: { profile: { select: { displayName: true } } } },
  seller: { include: { profile: { select: { displayName: true } } } },
  offers: {
    include: { fromUser: { include: { profile: { select: { displayName: true } } } } },
    orderBy: { createdAt: "asc" as const }
  }
};

// ── Créer une négociation (acheteur) ──
export const createNegotiation = async (buyerUserId: string, payload: CreateNegotiationPayload) => {
  const listing = await prisma.listing.findUnique({
    where: { id: payload.listingId },
    select: { id: true, ownerUserId: true, isPublished: true, priceUsdCents: true, isNegotiable: true, category: true }
  });

  if (!listing || !listing.isPublished) {
    throw new HttpError(404, "Article introuvable ou non publié");
  }

  if (!listing.isNegotiable) {
    throw new HttpError(400, "Cet article n'est pas ouvert à la négociation");
  }

  // Vérifier le verrouillage catégorie (admin)
  const catRule = await prisma.categoryNegotiationRule.findUnique({
    where: { category: listing.category.toLowerCase() },
  });
  if (catRule?.negotiationLocked) {
    throw new HttpError(400, "La négociation est désactivée pour cette catégorie par l'administration");
  }

  if (listing.ownerUserId === buyerUserId) {
    throw new HttpError(400, "Impossible de négocier votre propre article");
  }

  if (payload.proposedPriceUsdCents <= 0) {
    throw new HttpError(400, "Le prix proposé doit être supérieur à 0");
  }

  // Vérifier qu'il n'y a pas déjà une négo PENDING sur ce listing pour cet acheteur
  const existing = await prisma.negotiation.findFirst({
    where: {
      buyerUserId,
      listingId: payload.listingId,
      status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] }
    }
  });

  if (existing) {
    throw new HttpError(409, "Vous avez déjà une négociation en cours pour cet article");
  }

  const quantity = Math.max(1, payload.quantity);
  const negoType: NegotiationType = payload.type === "QUANTITY"
    ? NegotiationType.QUANTITY
    : payload.type === "GROUPED"
      ? NegotiationType.GROUPED
      : NegotiationType.SIMPLE;

  const isGrouped = negoType === NegotiationType.GROUPED;
  const groupId = isGrouped ? randomBytes(8).toString("hex") : null;
  const minBuyers = isGrouped ? Math.max(2, payload.minBuyers ?? 2) : null;
  const ttl = isGrouped ? GROUPED_TTL_MS : NEGOTIATION_TTL_MS;

  const negotiation = await prisma.negotiation.create({
    data: {
      buyerUserId,
      sellerUserId: listing.ownerUserId,
      listingId: payload.listingId,
      type: negoType,
      status: NegotiationStatus.PENDING,
      originalPriceUsdCents: listing.priceUsdCents,
      quantity,
      groupId,
      minBuyers,
      expiresAt: new Date(Date.now() + ttl),
      offers: {
        create: {
          fromUserId: buyerUserId,
          priceUsdCents: payload.proposedPriceUsdCents,
          quantity,
          message: payload.message ?? null
        }
      }
    },
    include: negotiationInclude
  });

  // Ajouter au panier avec negotiationId pour marquer l'état MARCHANDAGE
  const cartId = await getOrCreateOpenCartId(buyerUserId);
  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_listingId: { cartId, listingId: payload.listingId } }
  });

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { negotiationId: negotiation.id, quantity, unitPriceUsdCents: payload.proposedPriceUsdCents }
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId,
        listingId: payload.listingId,
        quantity,
        unitPriceUsdCents: payload.proposedPriceUsdCents,
        negotiationId: negotiation.id
      }
    });
  }

  return mapNegotiation(negotiation);
};

// ── Répondre à une négociation (vendeur: ACCEPT/REFUSE/COUNTER) ──
export const respondToNegotiation = async (userId: string, negotiationId: string, payload: RespondPayload) => {
  const businessIds = await resolveSellerBusinessIds(userId);

  const negotiation = await prisma.negotiation.findFirst({
    where: {
      id: negotiationId,
      status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] },
      OR: [
        { sellerUserId: userId },
        { buyerUserId: userId }
      ]
    },
    include: { offers: { orderBy: { createdAt: "desc" }, take: 1 } }
  });

  if (!negotiation) {
    throw new HttpError(404, "Négociation introuvable ou déjà résolue");
  }

  // Vérifier que ce n'est pas la même personne qui a fait la dernière offre
  const lastOffer = negotiation.offers[0];
  if (lastOffer && lastOffer.fromUserId === userId) {
    throw new HttpError(400, "C'est à l'autre partie de répondre");
  }

  // Vérifier l'expiration
  if (negotiation.expiresAt < new Date()) {
    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { status: NegotiationStatus.EXPIRED, resolvedAt: new Date() }
    });
    throw new HttpError(410, "Cette négociation a expiré");
  }

  const now = new Date();

  if (payload.action === "ACCEPT") {
    const acceptedPrice = lastOffer?.priceUsdCents ?? negotiation.originalPriceUsdCents;
    const isBundle = !!negotiation.bundleId;

    const updated = await prisma.negotiation.update({
      where: { id: negotiationId },
      data: {
        status: NegotiationStatus.ACCEPTED,
        finalPriceUsdCents: acceptedPrice,
        resolvedAt: now,
        offers: {
          create: {
            fromUserId: userId,
            priceUsdCents: acceptedPrice,
            quantity: negotiation.quantity,
            message: payload.message ?? "Offre acceptée"
          }
        }
      },
      include: negotiationInclude
    });

    // ── Auto-création de commande à partir de la négo acceptée ──
    try {
      if (isBundle) {
        // ── BUNDLE: charger TOUS les items du panier liés à cette négo ──
        const cartItems = await prisma.cartItem.findMany({
          where: { negotiationId: negotiationId },
          include: {
            cart: true,
            listing: { select: { id: true, title: true, type: true, category: true, city: true, ownerUserId: true, businessId: true, priceUsdCents: true } },
          },
        });

        if (cartItems.length > 0) {
          // Allocation proportionnelle du prix bundle par item
          const totalOriginal = cartItems.reduce((s, ci) => s + ci.listing.priceUsdCents * ci.quantity, 0);
          let allocated = 0;
          const allocatedItems = cartItems.map((ci, idx) => {
            let itemPrice: number;
            if (idx === cartItems.length - 1) {
              // Dernier item reçoit le reste pour éviter l'erreur d'arrondi
              itemPrice = acceptedPrice - allocated;
            } else {
              const ratio = totalOriginal > 0
                ? (ci.listing.priceUsdCents * ci.quantity) / totalOriginal
                : 1 / cartItems.length;
              itemPrice = Math.round(acceptedPrice * ratio);
            }
            allocated += itemPrice;
            const unitPrice = Math.round(itemPrice / ci.quantity);
            return { ...ci, allocatedTotal: itemPrice, allocatedUnit: unitPrice };
          });

          // Mettre à jour les prix unitaires dans le panier (prix alloué, pas le total bundle)
          for (const ai of allocatedItems) {
            await prisma.cartItem.update({
              where: { id: ai.id },
              data: { unitPriceUsdCents: ai.allocatedUnit },
            });
          }

          const validationCode = randomBytes(3).toString("hex").toUpperCase();
          const order = await prisma.order.create({
            data: {
              buyerUserId: negotiation.buyerUserId,
              sellerUserId: cartItems[0].listing.ownerUserId,
              sellerBusinessId: cartItems[0].listing.businessId,
              status: OrderStatus.PENDING,
              totalUsdCents: acceptedPrice,
              validationCode,
              notes: `Commande auto — lot #${negotiationId.slice(-6)} accepté (${cartItems.length} articles)`,
              items: {
                create: allocatedItems.map((ai) => ({
                  listingId: ai.listing.id,
                  listingType: ai.listing.type,
                  title: ai.listing.title,
                  category: ai.listing.category,
                  city: ai.listing.city ?? "—",
                  quantity: ai.quantity,
                  unitPriceUsdCents: ai.allocatedUnit,
                  lineTotalUsdCents: ai.allocatedTotal,
                })),
              },
            },
          });

          // Retirer TOUS les articles du panier
          await prisma.cartItem.deleteMany({
            where: { id: { in: cartItems.map((ci) => ci.id) } },
          });

          // Notifications
          if (!isUserOnline(negotiation.buyerUserId)) {
            void sendPushToUser(negotiation.buyerUserId, {
              title: "✅ Lot accepté !",
              body: `Votre offre groupée pour ${cartItems.length} articles a été acceptée. Commande #${order.id.slice(-6)} créée.`,
              tag: `nego-accepted-${negotiationId}`,
              data: { type: "order", orderId: order.id, negotiationId },
            });
          }
          if (!isUserOnline(cartItems[0].listing.ownerUserId)) {
            void sendPushToUser(cartItems[0].listing.ownerUserId, {
              title: "🛒 Commande lot créée",
              body: `Commande #${order.id.slice(-6)} créée — ${cartItems.length} articles, marchandage lot accepté.`,
              tag: `order-${order.id}`,
              data: { type: "order", orderId: order.id },
            });
          }
          const orderCreatedPayload = {
            type: "ORDER_CREATED" as const,
            orderId: order.id,
            buyerUserId: negotiation.buyerUserId,
            sellerUserId: cartItems[0].listing.ownerUserId,
            itemsCount: cartItems.length,
            totalUsdCents: acceptedPrice,
            fromNegotiation: true,
            negotiationId,
            createdAt: new Date().toISOString(),
          };
          emitToUser(negotiation.buyerUserId, "order:created", orderCreatedPayload);
          emitToUser(cartItems[0].listing.ownerUserId, "order:created", orderCreatedPayload);
        }
      } else {
        // ── SINGLE ITEM ──
        // Mettre à jour le prix dans le panier avec le prix final
        await prisma.cartItem.updateMany({
          where: { negotiationId: negotiationId },
          data: { unitPriceUsdCents: acceptedPrice }
        });

        const cartItem = await prisma.cartItem.findFirst({
          where: { negotiationId: negotiationId },
          include: {
            cart: true,
            listing: { select: { id: true, title: true, type: true, category: true, city: true, ownerUserId: true, businessId: true } },
          },
        });

        if (cartItem) {
          const validationCode = randomBytes(3).toString("hex").toUpperCase();
          const lineTotalUsdCents = acceptedPrice * negotiation.quantity;
          const order = await prisma.order.create({
            data: {
              buyerUserId: negotiation.buyerUserId,
              sellerUserId: cartItem.listing.ownerUserId,
              sellerBusinessId: cartItem.listing.businessId,
              status: OrderStatus.PENDING,
              totalUsdCents: lineTotalUsdCents,
              validationCode,
              notes: `Commande auto — marchandage #${negotiationId.slice(-6)} accepté`,
              items: {
                create: {
                  listingId: cartItem.listing.id,
                  listingType: cartItem.listing.type,
                  title: cartItem.listing.title,
                  category: cartItem.listing.category,
                  city: cartItem.listing.city ?? "—",
                  quantity: negotiation.quantity,
                  unitPriceUsdCents: acceptedPrice,
                  lineTotalUsdCents,
                },
              },
            },
          });

          await prisma.cartItem.delete({ where: { id: cartItem.id } });

          if (!isUserOnline(negotiation.buyerUserId)) {
            void sendPushToUser(negotiation.buyerUserId, {
              title: "✅ Marchandage accepté !",
              body: `Votre offre pour "${cartItem.listing.title}" a été acceptée. Commande #${order.id.slice(-6)} créée.`,
              tag: `nego-accepted-${negotiationId}`,
              data: { type: "order", orderId: order.id, negotiationId },
            });
          }
          if (!isUserOnline(cartItem.listing.ownerUserId)) {
            void sendPushToUser(cartItem.listing.ownerUserId, {
              title: "🛒 Commande créée automatiquement",
              body: `Commande #${order.id.slice(-6)} créée suite au marchandage accepté.`,
              tag: `order-${order.id}`,
              data: { type: "order", orderId: order.id },
            });
          }
          const orderCreatedPayload = {
            type: "ORDER_CREATED" as const,
            orderId: order.id,
            buyerUserId: negotiation.buyerUserId,
            sellerUserId: cartItem.listing.ownerUserId,
            itemsCount: 1,
            totalUsdCents: lineTotalUsdCents,
            fromNegotiation: true,
            negotiationId,
            createdAt: new Date().toISOString(),
          };
          emitToUser(negotiation.buyerUserId, "order:created", orderCreatedPayload);
          emitToUser(cartItem.listing.ownerUserId, "order:created", orderCreatedPayload);
        }
      }
    } catch {
      // Silently continue — the negotiation is still accepted even if auto-order fails
    }

    return mapNegotiation(updated);
  }

  if (payload.action === "REFUSE") {
    const updated = await prisma.negotiation.update({
      where: { id: negotiationId },
      data: {
        status: NegotiationStatus.REFUSED,
        resolvedAt: now,
        offers: {
          create: {
            fromUserId: userId,
            priceUsdCents: lastOffer?.priceUsdCents ?? 0,
            quantity: negotiation.quantity,
            message: payload.message ?? "Offre refusée"
          }
        }
      },
      include: negotiationInclude
    });

    // Décrocher la négo du panier et restaurer les prix originaux
    if (negotiation.bundleId) {
      // Bundle: restaurer le vrai prix unitaire de chaque item
      const cartItems = await prisma.cartItem.findMany({
        where: { negotiationId: negotiationId },
        include: { listing: { select: { priceUsdCents: true } } },
      });
      for (const ci of cartItems) {
        await prisma.cartItem.update({
          where: { id: ci.id },
          data: { negotiationId: null, unitPriceUsdCents: ci.listing.priceUsdCents },
        });
      }
    } else {
      await prisma.cartItem.updateMany({
        where: { negotiationId: negotiationId },
        data: { negotiationId: null, unitPriceUsdCents: negotiation.originalPriceUsdCents }
      });
    }

    return mapNegotiation(updated);
  }

  if (payload.action === "COUNTER") {
    if (!payload.counterPriceUsdCents || payload.counterPriceUsdCents <= 0) {
      throw new HttpError(400, "Prix de contre-offre requis et > 0");
    }

    const updated = await prisma.negotiation.update({
      where: { id: negotiationId },
      data: {
        status: NegotiationStatus.COUNTERED,
        expiresAt: new Date(Date.now() + NEGOTIATION_TTL_MS),
        offers: {
          create: {
            fromUserId: userId,
            priceUsdCents: payload.counterPriceUsdCents,
            quantity: negotiation.quantity,
            message: payload.message ?? null
          }
        }
      },
      include: negotiationInclude
    });

    // Mettre à jour le prix dans le panier du buyer
    if (negotiation.bundleId) {
      // Bundle: allocation proportionnelle du nouveau prix
      const cartItems = await prisma.cartItem.findMany({
        where: { negotiationId: negotiationId },
        include: { listing: { select: { priceUsdCents: true } } },
      });
      const totalOriginal = cartItems.reduce((s, ci) => s + ci.listing.priceUsdCents * ci.quantity, 0);
      let allocated = 0;
      for (let i = 0; i < cartItems.length; i++) {
        const ci = cartItems[i];
        let itemTotal: number;
        if (i === cartItems.length - 1) {
          itemTotal = payload.counterPriceUsdCents - allocated;
        } else {
          const ratio = totalOriginal > 0 ? (ci.listing.priceUsdCents * ci.quantity) / totalOriginal : 1 / cartItems.length;
          itemTotal = Math.round(payload.counterPriceUsdCents * ratio);
        }
        allocated += itemTotal;
        await prisma.cartItem.update({
          where: { id: ci.id },
          data: { unitPriceUsdCents: Math.round(itemTotal / ci.quantity) },
        });
      }
    } else {
      await prisma.cartItem.updateMany({
        where: { negotiationId: negotiationId },
        data: { unitPriceUsdCents: payload.counterPriceUsdCents }
      });
    }

    return mapNegotiation(updated);
  }

  throw new HttpError(400, "Action invalide");
};

// ── Lister mes négociations (buyer ou seller) ──
export const listMyNegotiations = async (
  userId: string,
  role: "buyer" | "seller",
  filters?: { status?: NegotiationStatus; page?: number; limit?: number }
) => {
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters?.limit ?? 20));
  const skip = (page - 1) * limit;

  const businessIds = await resolveSellerBusinessIds(userId);

  const where = role === "buyer"
    ? { buyerUserId: userId, ...(filters?.status ? { status: filters.status } : {}) }
    : {
        OR: [
          { sellerUserId: userId },
          ...(businessIds.length > 0
            ? [{ listing: { businessId: { in: businessIds } } }]
            : [])
        ],
        ...(filters?.status ? { status: filters.status } : {})
      };

  const [total, rows] = await Promise.all([
    prisma.negotiation.count({ where }),
    prisma.negotiation.findMany({
      where,
      include: negotiationInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit
    })
  ]);

  const mappedNegs = rows.map(mapNegotiation);

  // For grouped negotiations, add current buyer count per groupId
  const groupIds = [...new Set(rows.filter((r) => r.groupId).map((r) => r.groupId!))];
  let groupCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const counts = await prisma.negotiation.groupBy({
      by: ["groupId"],
      where: { groupId: { in: groupIds }, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
      _count: { buyerUserId: true }
    });
    groupCounts = Object.fromEntries(counts.map((c) => [c.groupId!, c._count.buyerUserId]));
  }

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    negotiations: mappedNegs.map((n) => ({
      ...n,
      groupCurrentBuyers: n.groupId ? (groupCounts[n.groupId] ?? 1) : null
    }))
  };
};

// ── Détail d'une négociation ──
export const getNegotiationDetails = async (userId: string, negotiationId: string) => {
  const businessIds = await resolveSellerBusinessIds(userId);

  const negotiation = await prisma.negotiation.findFirst({
    where: {
      id: negotiationId,
      OR: [
        { buyerUserId: userId },
        { sellerUserId: userId },
        ...(businessIds.length > 0
          ? [{ listing: { businessId: { in: businessIds } } }]
          : [])
      ]
    },
    include: negotiationInclude
  });

  if (!negotiation) {
    throw new HttpError(404, "Négociation introuvable");
  }

  return mapNegotiation(negotiation);
};

// ── Expirer les négociations périmées ──
export const expireStaleNegotiations = async () => {
  // Trouver les négociations à expirer AVANT de les update (pour restaurer les prix)
  const staleNegotiations = await prisma.negotiation.findMany({
    where: {
      status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] },
      expiresAt: { lt: new Date() }
    },
    select: { id: true, originalPriceUsdCents: true, buyerUserId: true, sellerUserId: true }
  });

  if (staleNegotiations.length === 0) return { expired: 0 };

  const staleIds = staleNegotiations.map((n) => n.id);

  // Marquer comme expirées
  const result = await prisma.negotiation.updateMany({
    where: { id: { in: staleIds } },
    data: {
      status: NegotiationStatus.EXPIRED,
      resolvedAt: new Date()
    }
  });

  // Décrocher du panier et restaurer le prix original pour chaque négo
  for (const neg of staleNegotiations) {
    await prisma.cartItem.updateMany({
      where: { negotiationId: neg.id },
      data: { negotiationId: null, unitPriceUsdCents: neg.originalPriceUsdCents }
    });

    // Socket: notify both parties of expiration
    emitToUsers([neg.buyerUserId, neg.sellerUserId], "negotiation:expired", {
      type: "NEGOTIATION_EXPIRED",
      negotiationId: neg.id,
      buyerUserId: neg.buyerUserId,
      sellerUserId: neg.sellerUserId,
      expiredAt: new Date().toISOString(),
    });

    // Push notification for offline users
    for (const uid of [neg.buyerUserId, neg.sellerUserId]) {
      if (!isUserOnline(uid)) {
        void sendPushToUser(uid, {
          title: "⏰ Marchandage expiré",
          body: `Marchandage #${neg.id.slice(-6)} a expiré`,
          tag: `nego-expired-${neg.id}`,
          data: { type: "negotiation", negotiationId: neg.id },
        });
      }
    }
  }

  return { expired: result.count };
};

// ── Annuler une négociation (acheteur uniquement) ──
export const cancelNegotiation = async (userId: string, negotiationId: string) => {
  const negotiation = await prisma.negotiation.findFirst({
    where: {
      id: negotiationId,
      buyerUserId: userId,
      status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] }
    }
  });

  if (!negotiation) {
    throw new HttpError(404, "Négociation introuvable ou déjà résolue");
  }

  const updated = await prisma.negotiation.update({
    where: { id: negotiationId },
    data: {
      status: NegotiationStatus.REFUSED,
      resolvedAt: new Date()
    },
    include: negotiationInclude
  });

  // Décrocher du panier
  await prisma.cartItem.updateMany({
    where: { negotiationId: negotiationId },
    data: { negotiationId: null }
  });

  return mapNegotiation(updated);
};

// ── Rejoindre une négociation groupée ──
export const joinGroupNegotiation = async (buyerUserId: string, groupId: string, payload: { proposedPriceUsdCents: number; quantity: number; message?: string }) => {
  // Trouver la négo "leader" du groupe
  const leader = await prisma.negotiation.findFirst({
    where: { groupId, type: NegotiationType.GROUPED },
    select: {
      id: true, listingId: true, sellerUserId: true, originalPriceUsdCents: true,
      status: true, expiresAt: true, minBuyers: true,
      listing: { select: { id: true, ownerUserId: true, isPublished: true, priceUsdCents: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!leader) throw new HttpError(404, "Groupe de négociation introuvable");
  if (leader.status !== NegotiationStatus.PENDING && leader.status !== NegotiationStatus.COUNTERED) {
    throw new HttpError(410, "Ce groupe de négociation est clôturé");
  }
  if (leader.expiresAt < new Date()) {
    throw new HttpError(410, "Ce groupe de négociation a expiré");
  }
  if (leader.listing?.ownerUserId === buyerUserId) {
    throw new HttpError(400, "Impossible de rejoindre votre propre négociation");
  }

  // Vérifier que l'acheteur n'est pas déjà dans ce groupe
  const alreadyIn = await prisma.negotiation.findFirst({
    where: { groupId, buyerUserId, type: NegotiationType.GROUPED }
  });
  if (alreadyIn) throw new HttpError(409, "Vous êtes déjà dans ce groupe");

  const quantity = Math.max(1, payload.quantity);

  const negotiation = await prisma.negotiation.create({
    data: {
      buyerUserId,
      sellerUserId: leader.sellerUserId,
      listingId: leader.listingId,
      type: NegotiationType.GROUPED,
      status: NegotiationStatus.PENDING,
      originalPriceUsdCents: leader.originalPriceUsdCents,
      quantity,
      groupId,
      minBuyers: leader.minBuyers,
      expiresAt: leader.expiresAt,
      offers: {
        create: {
          fromUserId: buyerUserId,
          priceUsdCents: payload.proposedPriceUsdCents,
          quantity,
          message: payload.message ?? null
        }
      }
    },
    include: negotiationInclude
  });

  // Ajouter au panier
  const cartId = await getOrCreateOpenCartId(buyerUserId);
  await prisma.cartItem.create({
    data: {
      cartId,
      listingId: leader.listingId,
      quantity,
      unitPriceUsdCents: payload.proposedPriceUsdCents,
      negotiationId: negotiation.id
    }
  });

  return mapNegotiation(negotiation);
};

// ── Lister les groupes ouverts (optionnellement filtrés par listing) ──
export const listOpenGroups = async (filters?: { listingId?: string; page?: number; limit?: number }) => {
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters?.limit ?? 20));
  const skip = (page - 1) * limit;

  // Trouver les groupIds distincts qui ont au moins 1 négo PENDING/COUNTERED
  const where: any = {
    type: NegotiationType.GROUPED,
    status: { in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTERED] },
    expiresAt: { gt: new Date() },
    groupId: { not: null }
  };
  if (filters?.listingId) where.listingId = filters.listingId;

  const rows = await prisma.negotiation.findMany({
    where,
    include: {
      listing: { select: { id: true, type: true, title: true, category: true, city: true, imageUrl: true, priceUsdCents: true } },
      buyer: { include: { profile: { select: { displayName: true } } } }
    },
    orderBy: { createdAt: "asc" }
  });

  // Grouper par groupId
  const groupsMap = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.groupId) continue;
    const arr = groupsMap.get(row.groupId) ?? [];
    arr.push(row);
    groupsMap.set(row.groupId, arr);
  }

  const allGroups = Array.from(groupsMap.entries()).map(([gId, members]) => {
    const leader = members[0];
    return {
      groupId: gId,
      listingId: leader.listingId,
      listing: leader.listing ? {
        id: leader.listing.id,
        type: leader.listing.type,
        title: leader.listing.title,
        category: leader.listing.category,
        city: leader.listing.city,
        imageUrl: leader.listing.imageUrl,
        priceUsdCents: leader.listing.priceUsdCents
      } : null,
      minBuyers: leader.minBuyers ?? 2,
      currentBuyers: members.length,
      expiresAt: leader.expiresAt.toISOString(),
      createdBy: leader.buyer?.profile?.displayName ?? "Acheteur",
      createdAt: leader.createdAt.toISOString()
    };
  });

  const total = allGroups.length;
  const paginated = allGroups.slice(skip, skip + limit);

  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), groups: paginated };
};

// ── Détails d'un groupe ──
export const getGroupDetails = async (groupId: string) => {
  const negotiations = await prisma.negotiation.findMany({
    where: { groupId, type: NegotiationType.GROUPED },
    include: negotiationInclude,
    orderBy: { createdAt: "asc" }
  });

  if (negotiations.length === 0) {
    throw new HttpError(404, "Groupe introuvable");
  }

  const leader = negotiations[0];
  return {
    groupId,
    listingId: leader.listingId,
    minBuyers: leader.minBuyers ?? 2,
    currentBuyers: negotiations.length,
    expiresAt: leader.expiresAt.toISOString(),
    status: leader.status,
    participants: negotiations.map(mapNegotiation)
  };
};

// ── Créer une négociation multi-articles (bundle) ──
export const createBundleNegotiation = async (buyerUserId: string, payload: CreateBundleNegotiationPayload) => {
  if (!payload.items || payload.items.length < 2) {
    throw new HttpError(400, "Un lot doit contenir au moins 2 articles");
  }
  if (payload.items.length > 10) {
    throw new HttpError(400, "Un lot ne peut contenir plus de 10 articles");
  }
  if (payload.proposedTotalUsdCents <= 0) {
    throw new HttpError(400, "Le prix total proposé doit être supérieur à 0");
  }

  // Charger toutes les annonces
  const listingIds = payload.items.map((i) => i.listingId);
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, isPublished: true },
    select: { id: true, ownerUserId: true, priceUsdCents: true, title: true, isNegotiable: true, category: true }
  });

  if (listings.length !== listingIds.length) {
    throw new HttpError(404, "Un ou plusieurs articles sont introuvables ou non publiés");
  }

  // Vérifier que TOUS les articles sont négociables
  const nonNegotiable = listings.filter((l) => !l.isNegotiable);
  if (nonNegotiable.length > 0) {
    throw new HttpError(400, `Article(s) non négociable(s) : ${nonNegotiable.map((l) => l.title).join(", ")}`);
  }

  // Vérifier les catégories verrouillées
  const categories = [...new Set(listings.map((l) => l.category.toLowerCase()))];
  const lockedCats = await prisma.categoryNegotiationRule.findMany({
    where: { category: { in: categories }, negotiationLocked: true },
  });
  if (lockedCats.length > 0) {
    throw new HttpError(400, `Catégorie(s) verrouillée(s) : ${lockedCats.map((c) => c.category).join(", ")}`);
  }

  // Vérifier que tous les articles appartiennent au même vendeur
  const sellerIds = new Set(listings.map((l) => l.ownerUserId));
  if (sellerIds.size > 1) {
    throw new HttpError(400, "Tous les articles d'un lot doivent appartenir au même vendeur");
  }
  const sellerUserId = listings[0].ownerUserId;

  if (sellerUserId === buyerUserId) {
    throw new HttpError(400, "Impossible de négocier vos propres articles");
  }

  // Calculer le prix original total
  const itemsWithPrice = payload.items.map((item) => {
    const listing = listings.find((l) => l.id === item.listingId)!;
    return { ...item, priceUsdCents: listing.priceUsdCents, quantity: Math.max(1, item.quantity) };
  });
  const totalOriginalUsdCents = itemsWithPrice.reduce((sum, i) => sum + i.priceUsdCents * i.quantity, 0);

  const negoType: NegotiationType = payload.type === "QUANTITY"
    ? NegotiationType.QUANTITY
    : payload.type === "GROUPED"
      ? NegotiationType.GROUPED
      : NegotiationType.SIMPLE;

  const isGrouped = negoType === NegotiationType.GROUPED;
  const groupId = isGrouped ? randomBytes(8).toString("hex") : null;
  const minBuyers = isGrouped ? Math.max(2, payload.minBuyers ?? 2) : null;
  const ttl = isGrouped ? GROUPED_TTL_MS : NEGOTIATION_TTL_MS;

  // Créer le bundle + les items + l'article principal (premier listing) comme negotiation de référence
  const bundle = await prisma.negotiationBundle.create({
    data: {
      creatorUserId: buyerUserId,
      sellerUserId,
      totalOriginalUsdCents,
      items: {
        create: itemsWithPrice.map((i) => ({
          listingId: i.listingId,
          quantity: i.quantity
        }))
      }
    },
    include: {
      items: { include: { listing: { select: { id: true, type: true, title: true, category: true, city: true, imageUrl: true, priceUsdCents: true } } } }
    }
  });

  // Créer une négociation pour le premier article comme référence
  const primaryListing = listings[0];
  const negotiation = await prisma.negotiation.create({
    data: {
      buyerUserId,
      sellerUserId,
      listingId: primaryListing.id,
      bundleId: bundle.id,
      type: negoType,
      status: NegotiationStatus.PENDING,
      originalPriceUsdCents: totalOriginalUsdCents,
      quantity: 1,
      groupId,
      minBuyers,
      expiresAt: new Date(Date.now() + ttl),
      offers: {
        create: {
          fromUserId: buyerUserId,
          priceUsdCents: payload.proposedTotalUsdCents,
          quantity: 1,
          message: payload.message ?? null
        }
      }
    },
    include: negotiationInclude
  });

  // Ajouter chaque article au panier
  const cartId = await getOrCreateOpenCartId(buyerUserId);
  for (const item of itemsWithPrice) {
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_listingId: { cartId, listingId: item.listingId } }
    });
    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { negotiationId: negotiation.id, quantity: item.quantity, unitPriceUsdCents: item.priceUsdCents }
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId, listingId: item.listingId, quantity: item.quantity, unitPriceUsdCents: item.priceUsdCents, negotiationId: negotiation.id }
      });
    }
  }

  const mapped = mapNegotiation(negotiation);
  return {
    ...mapped,
    bundle: {
      id: bundle.id,
      totalOriginalUsdCents: bundle.totalOriginalUsdCents,
      items: bundle.items.map((bi) => ({
        listingId: bi.listingId,
        quantity: bi.quantity,
        listing: bi.listing ? {
          id: bi.listing.id, type: bi.listing.type, title: bi.listing.title,
          category: bi.listing.category, city: bi.listing.city,
          imageUrl: bi.listing.imageUrl, priceUsdCents: bi.listing.priceUsdCents
        } : null
      }))
    }
  };
};

// ── Détails d'un bundle ──
export const getBundleDetails = async (bundleId: string, userId: string) => {
  const bundle = await prisma.negotiationBundle.findUnique({
    where: { id: bundleId },
    include: {
      items: { include: { listing: { select: { id: true, type: true, title: true, category: true, city: true, imageUrl: true, priceUsdCents: true } } } },
      creator: { include: { profile: { select: { displayName: true } } } },
      seller: { include: { profile: { select: { displayName: true } } } },
      negotiations: { include: negotiationInclude, orderBy: { createdAt: "asc" } }
    }
  });

  if (!bundle) throw new HttpError(404, "Lot introuvable");

  // Authorization: only the bundle creator or seller can view
  const isCreator = bundle.creatorUserId === userId;
  const isSeller = bundle.sellerUserId === userId;
  const businessIds = await resolveSellerBusinessIds(userId);
  const isBusinessSeller = businessIds.length > 0 && bundle.sellerUserId === bundle.sellerUserId; // reserved for future business-linked bundles
  void isBusinessSeller;
  if (!isCreator && !isSeller) {
    throw new HttpError(403, "Accès refusé à ce lot");
  }

  return {
    id: bundle.id,
    totalOriginalUsdCents: bundle.totalOriginalUsdCents,
    createdAt: bundle.createdAt.toISOString(),
    creator: bundle.creator?.profile?.displayName ?? "Acheteur",
    seller: bundle.seller?.profile?.displayName ?? "Vendeur",
    items: bundle.items.map((bi) => ({
      listingId: bi.listingId,
      quantity: bi.quantity,
      listing: bi.listing ? {
        id: bi.listing.id, type: bi.listing.type, title: bi.listing.title,
        category: bi.listing.category, city: bi.listing.city,
        imageUrl: bi.listing.imageUrl, priceUsdCents: bi.listing.priceUsdCents
      } : null
    })),
    negotiations: bundle.negotiations.map(mapNegotiation)
  };
};

// ── Helper: obtenir ou créer un panier ouvert ──
const getOrCreateOpenCartId = async (userId: string): Promise<string> => {
  const existing = await prisma.cart.findFirst({
    where: { buyerUserId: userId, status: CartStatus.OPEN },
    select: { id: true },
    orderBy: { createdAt: "desc" }
  });

  if (existing) return existing.id;

  const created = await prisma.cart.create({
    data: { buyerUserId: userId, status: CartStatus.OPEN }
  });

  return created.id;
};
