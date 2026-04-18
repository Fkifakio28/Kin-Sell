import { CartStatus, NegotiationStatus, OrderStatus } from "../../shared/db/prisma-enums.js";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

type PagingInput = {
  page: number;
  limit: number;
  status?: OrderStatus;
  inProgressOnly?: boolean;
};

type CartItemPayload = {
  listingId: string;
  quantity: number;
  unitPriceUsdCents?: number;
};

type CartItemUpdatePayload = {
  quantity?: number;
  unitPriceUsdCents?: number;
};

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED
];

const toPaged = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit
});

const normalizePaging = (input: { page?: number; limit?: number }) => {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(50, Math.max(1, input.limit ?? 10));
  return { page, limit };
};

const resolveSellerBusinessIds = async (userId: string) => {
  const businesses = await prisma.businessAccount.findMany({
    where: { ownerUserId: userId },
    select: { id: true }
  });

  return businesses.map((business) => business.id);
};

const mapCart = (cart: {
  id: string;
  status: CartStatus;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    listingId: string;
    quantity: number;
    unitPriceUsdCents: number;
    negotiationId: string | null;
    negotiation: {
      id: string;
      status: NegotiationStatus;
      originalPriceUsdCents: number;
      finalPriceUsdCents: number | null;
      resolvedAt: Date | null;
    } | null;
    listing: {
      id: string;
      type: string;
      title: string;
      category: string;
      city: string;
      imageUrl: string | null;
      priceUsdCents: number;
      isNegotiable: boolean;
      ownerUserId: string;
      ownerUser: { id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } | null };
      business: { id: string; publicName: string; slug: string } | null;
    };
  }>;
  [key: string]: unknown;
}) => {
  const REFUSAL_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24h
  const now = Date.now();

  // Filtrer les items dont la négo refusée a expiré (> 24h)
  const validItems = cart.items.filter((item) => {
    if (item.negotiation?.status === "REFUSED" && item.negotiation.resolvedAt) {
      const deadline = new Date(item.negotiation.resolvedAt).getTime() + REFUSAL_DEADLINE_MS;
      if (now > deadline) return false; // expiré, sera nettoyé
    }
    return true;
  });

  const subtotalUsdCents = validItems.reduce((sum, item) => sum + item.unitPriceUsdCents * item.quantity, 0);

  return {
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    subtotalUsdCents,
    itemsCount: validItems.length,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
    items: validItems.map((item) => {
      const isNegotiating = !!item.negotiationId && item.negotiation
        && ["PENDING", "COUNTERED"].includes(item.negotiation.status);
      const isAccepted = !!item.negotiation && item.negotiation.status === "ACCEPTED";
      const isRefused = !!item.negotiation && item.negotiation.status === "REFUSED";
      const refusalDeadline = isRefused && item.negotiation?.resolvedAt
        ? new Date(new Date(item.negotiation.resolvedAt).getTime() + REFUSAL_DEADLINE_MS).toISOString()
        : null;

      return {
        id: item.id,
        listingId: item.listingId,
        quantity: item.quantity,
        unitPriceUsdCents: item.unitPriceUsdCents,
        lineTotalUsdCents: item.unitPriceUsdCents * item.quantity,
        negotiationId: item.negotiationId,
        negotiationStatus: item.negotiation?.status ?? null,
        originalPriceUsdCents: item.negotiation?.originalPriceUsdCents ?? item.listing.priceUsdCents,
        itemState: isNegotiating ? "MARCHANDAGE" as const : "COMMANDE" as const,
        refusalDeadline,
        listing: {
          id: item.listing.id,
          type: item.listing.type,
          title: item.listing.title,
          category: item.listing.category,
          city: item.listing.city,
          imageUrl: item.listing.imageUrl,
          isNegotiable: item.listing.isNegotiable,
          owner: {
            userId: item.listing.ownerUserId,
            displayName: item.listing.ownerUser.profile?.displayName ?? "Vendeur Kin-Sell",
            businessId: item.listing.business?.id ?? null,
            businessPublicName: item.listing.business?.publicName ?? null,
            businessSlug: item.listing.business?.slug ?? null
          }
        }
      };
    })
  };
};

const mapOrder = (order: {
  id: string;
  status: OrderStatus;
  currency: string;
  totalUsdCents: number;
  notes: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  canceledAt: Date | null;
  buyer: { id: string; profile: { displayName: string; username: string | null } | null };
  seller: { id: string; profile: { displayName: string; username: string | null } | null };
  sellerBusiness: { id: string; publicName: string; slug: string } | null;
  items: Array<{
    id: string;
    listingId: string | null;
    listingType: string;
    title: string;
    category: string;
    city: string;
    quantity: number;
    unitPriceUsdCents: number;
    lineTotalUsdCents: number;
    listing?: { imageUrl: string | null } | null;
  }>;
}) => {
  const ORDER_EXPIRY_DAYS = 30;
  const isActive = !(["DELIVERED", "CANCELED"] as string[]).includes(order.status);
  const autoExpireAt = isActive
    ? new Date(order.createdAt.getTime() + ORDER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
  id: order.id,
  status: order.status,
  currency: order.currency,
  totalUsdCents: order.totalUsdCents,
  notes: order.notes,
  createdAt: order.createdAt.toISOString(),
  confirmedAt: order.confirmedAt?.toISOString() ?? null,
  deliveredAt: order.deliveredAt?.toISOString() ?? null,
  canceledAt: order.canceledAt?.toISOString() ?? null,
  autoExpireAt,
  buyer: {
    userId: order.buyer.id,
    displayName: order.buyer.profile?.displayName ?? "Acheteur Kin-Sell",
    username: order.buyer.profile?.username ?? null
  },
  seller: {
    userId: order.seller.id,
    displayName: order.seller.profile?.displayName ?? "Vendeur Kin-Sell",
    username: order.seller.profile?.username ?? null,
    businessId: order.sellerBusiness?.id ?? null,
    businessPublicName: order.sellerBusiness?.publicName ?? null,
    businessSlug: order.sellerBusiness?.slug ?? null
  },
  itemsCount: order.items.length,
  items: order.items.map((item) => ({
    id: item.id,
    listingId: item.listingId,
    listingType: item.listingType,
    title: item.title,
    category: item.category,
    city: item.city,
    quantity: item.quantity,
    unitPriceUsdCents: item.unitPriceUsdCents,
    lineTotalUsdCents: item.lineTotalUsdCents,
    imageUrl: item.listing?.imageUrl ?? null
  }))
};
};

const getOpenCartId = async (userId: string) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cart.findFirst({
      where: { buyerUserId: userId, status: CartStatus.OPEN },
      select: { id: true },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return existing.id;
    }

    const created = await tx.cart.create({
      data: { buyerUserId: userId, status: CartStatus.OPEN }
    });

    return created.id;
  });
};

const getOpenCartOrThrowItem = async (userId: string, itemId: string) => {
  const cart = await prisma.cart.findFirst({
    where: { buyerUserId: userId, status: CartStatus.OPEN },
    select: { id: true }
  });

  if (!cart) {
    throw new HttpError(404, "Panier introuvable");
  }

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    select: { id: true, cartId: true }
  });

  if (!item) {
    throw new HttpError(404, "Article panier introuvable");
  }

  return { cartId: cart.id, itemId: item.id };
};

export const getBuyerCart = async (userId: string) => {
  const cartId = await getOpenCartId(userId);

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          listing: {
            include: {
              ownerUser: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true, city: true } } } },
              business: { select: { id: true, publicName: true, slug: true } }
            }
          },
          negotiation: {
            select: { id: true, status: true, originalPriceUsdCents: true, finalPriceUsdCents: true, resolvedAt: true }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!cart) {
    throw new HttpError(404, "Panier introuvable");
  }

  // Nettoyer les items dont la négo refusée a dépassé 24h
  const REFUSAL_DEADLINE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const invalidItemIds = cart.items
    .filter((item) => {
      const listing = item.listing as typeof item.listing | null | undefined;
      return !listing
        || !listing.id
        || !listing.ownerUserId
        || !listing.title
        || !listing.type
        || !listing.category
        || !listing.city;
    })
    .map((item) => item.id);
  const expiredItemIds = cart.items
    .filter((item) =>
      item.negotiation?.status === "REFUSED"
      && item.negotiation.resolvedAt
      && now > new Date(item.negotiation.resolvedAt).getTime() + REFUSAL_DEADLINE_MS
    )
    .map((item) => item.id);

  const itemIdsToDelete = Array.from(new Set([...expiredItemIds, ...invalidItemIds]));

  if (itemIdsToDelete.length > 0) {
    await prisma.cartItem.deleteMany({ where: { id: { in: itemIdsToDelete } } });
    // Filtrer en mémoire au lieu de re-requêter la DB
    cart.items = cart.items.filter((item) => !itemIdsToDelete.includes(item.id));
    return mapCart(cart);
  }

  return mapCart(cart);
};

export const addCartItem = async (userId: string, payload: CartItemPayload) => {
  const listing = await prisma.listing.findUnique({
    where: { id: payload.listingId },
    select: { id: true, ownerUserId: true, isPublished: true, priceUsdCents: true, promoActive: true, promoPriceUsdCents: true }
  });

  if (!listing || !listing.isPublished) {
    throw new HttpError(404, "Article introuvable ou non publié");
  }

  if (listing.ownerUserId === userId) {
    throw new HttpError(400, "Impossible d'ajouter votre propre article au panier");
  }

  const cartId = await getOpenCartId(userId);
  const quantity = Math.max(1, payload.quantity);
  // Use promo price if active, otherwise base price
  const effectivePrice = listing.promoActive && listing.promoPriceUsdCents != null
    ? listing.promoPriceUsdCents
    : listing.priceUsdCents;
  const unitPrice = payload.unitPriceUsdCents ?? effectivePrice;

  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_listingId: {
        cartId,
        listingId: payload.listingId
      }
    },
    select: { id: true, quantity: true, unitPriceUsdCents: true }
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + quantity,
        unitPriceUsdCents: payload.unitPriceUsdCents ?? existing.unitPriceUsdCents
      }
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId,
        listingId: payload.listingId,
        quantity,
        unitPriceUsdCents: Math.max(0, unitPrice)
      }
    });
  }

  return getBuyerCart(userId);
};

export const updateCartItem = async (userId: string, itemId: string, payload: CartItemUpdatePayload) => {
  const { itemId: targetItemId } = await getOpenCartOrThrowItem(userId, itemId);

  const nextQuantity = payload.quantity === undefined ? undefined : Math.max(1, payload.quantity);
  const nextPrice = payload.unitPriceUsdCents === undefined ? undefined : Math.max(0, payload.unitPriceUsdCents);

  await prisma.cartItem.update({
    where: { id: targetItemId },
    data: {
      quantity: nextQuantity,
      unitPriceUsdCents: nextPrice
    }
  });

  return getBuyerCart(userId);
};

export const removeCartItem = async (userId: string, itemId: string) => {
  const { itemId: targetItemId } = await getOpenCartOrThrowItem(userId, itemId);

  // Si l'article a une négociation active, l'annuler
  const item = await prisma.cartItem.findUnique({
    where: { id: targetItemId },
    select: { negotiationId: true, negotiation: { select: { status: true } } }
  });
  if (item?.negotiationId && item.negotiation
    && ["PENDING", "COUNTERED"].includes(item.negotiation.status)) {
    await prisma.negotiation.update({
      where: { id: item.negotiationId },
      data: { status: NegotiationStatus.REFUSED, resolvedAt: new Date() }
    });
  }

  await prisma.cartItem.delete({ where: { id: targetItemId } });
  return getBuyerCart(userId);
};

export const checkoutBuyerCart = async (userId: string, notes?: string, delivery?: {
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryCountry?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryPlaceId?: string;
  deliveryFormattedAddress?: string;
}) => {
  const cart = await prisma.cart.findFirst({
    where: { buyerUserId: userId, status: CartStatus.OPEN },
    include: {
      items: {
        include: {
          listing: true,
          negotiation: { select: { id: true, status: true, resolvedAt: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!cart) {
    throw new HttpError(404, "Panier introuvable");
  }

  if (cart.items.length === 0) {
    throw new HttpError(400, "Le panier est vide");
  }

  // ── Séparer les articles COMMANDE vs MARCHANDAGE ──
  const negotiatingItems = cart.items.filter(
    (item) => item.negotiation
      && (item.negotiation.status === NegotiationStatus.PENDING
        || item.negotiation.status === NegotiationStatus.COUNTERED)
  );
  const readyItems = cart.items.filter(
    (item) => !item.negotiation
      || (item.negotiation.status !== NegotiationStatus.PENDING
        && item.negotiation.status !== NegotiationStatus.COUNTERED)
  );

  if (readyItems.length === 0) {
    throw new HttpError(400, "Tous les articles sont en cours de négociation. Attendez la résolution ou annulez les négociations.");
  }

  // ── Retirer les items dont la négo refusée dépasse 24h ──
  const REFUSAL_DEADLINE_MS = 24 * 60 * 60 * 1000;
  const checkoutNow = Date.now();
  const expiredRefusalItems = readyItems.filter(
    (item) => item.negotiation?.status === NegotiationStatus.REFUSED
      && item.negotiation.resolvedAt
      && checkoutNow > new Date(item.negotiation.resolvedAt).getTime() + REFUSAL_DEADLINE_MS
  );
  if (expiredRefusalItems.length > 0) {
    // Supprimer les articles expirés du panier
    await prisma.cartItem.deleteMany({ where: { id: { in: expiredRefusalItems.map((i) => i.id) } } });
    throw new HttpError(400, `Le délai de 24h pour commander après refus de négociation a expiré pour ${expiredRefusalItems.length} article(s). Ils ont été retirés du panier.`);
  }

  const itemWithoutPrice = readyItems.find((item) => item.unitPriceUsdCents <= 0);
  if (itemWithoutPrice) {
    throw new HttpError(400, "Renseignez un prix (> 0) pour chaque article avant validation");
  }

  // ── Vérifier que tous les articles sont encore publiés ──
  const unpublishedItem = readyItems.find((item) => !item.listing.isPublished);
  if (unpublishedItem) {
    throw new HttpError(400, `L'article "${unpublishedItem.listing.title}" n'est plus disponible. Retirez-le du panier.`);
  }

  // ── Vérifier le stock disponible ──
  for (const item of readyItems) {
    const stock = item.listing.stockQuantity;
    if (stock !== null && stock !== undefined) {
      if (stock <= 0) {
        throw new HttpError(400, `L'article "${item.listing.title}" est en rupture de stock.`);
      }
      if (item.quantity > stock) {
        throw new HttpError(400, `Stock insuffisant pour "${item.listing.title}" (demandé: ${item.quantity}, disponible: ${stock}).`);
      }
    }
  }

  // ── Grouper les articles prêts par vendeur ──
  const grouped = new Map<string, typeof cart.items>();
  for (const item of readyItems) {
    const key = `${item.listing.ownerUserId}:${item.listing.businessId ?? "none"}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const isPartial = negotiatingItems.length > 0;

  const createdOrders = await prisma.$transaction(async (tx) => {
    const orders: Array<{ id: string }> = [];

    for (const [key, groupItems] of grouped.entries()) {
      const [sellerUserId, sellerBusinessIdRaw] = key.split(":");
      const sellerBusinessId = sellerBusinessIdRaw === "none" ? null : sellerBusinessIdRaw;
      const totalUsdCents = groupItems.reduce((sum, item) => sum + item.unitPriceUsdCents * item.quantity, 0);

      const validationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const createdOrder = await tx.order.create({
        data: {
          buyerUserId: userId,
          sellerUserId,
          sellerBusinessId,
          cartId: cart.id,
          status: OrderStatus.PENDING,
          currency: cart.currency,
          totalUsdCents,
          notes,
          validationCode,
          deliveryAddress: delivery?.deliveryAddress,
          deliveryCity: delivery?.deliveryCity,
          deliveryCountry: delivery?.deliveryCountry,
          deliveryLatitude: delivery?.deliveryLatitude,
          deliveryLongitude: delivery?.deliveryLongitude,
          deliveryPlaceId: delivery?.deliveryPlaceId,
          deliveryFormattedAddress: delivery?.deliveryFormattedAddress,
          items: {
            create: groupItems.map((item) => ({
              listingId: item.listing.id,
              listingType: item.listing.type,
              title: item.listing.title,
              category: item.listing.category,
              city: item.listing.city,
              quantity: item.quantity,
              unitPriceUsdCents: item.unitPriceUsdCents,
              lineTotalUsdCents: item.quantity * item.unitPriceUsdCents
            }))
          }
        },
        select: { id: true }
      });

      orders.push(createdOrder);
    }

    if (isPartial) {
      // ── Checkout partiel : supprimer les articles validés, garder les MARCHANDAGE ──
      await tx.cartItem.deleteMany({
        where: { id: { in: readyItems.map((i) => i.id) } }
      });
    } else {
      // ── Checkout total : marquer le panier comme finalisé, créer un nouveau ──
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          status: CartStatus.CHECKED_OUT,
          checkedOutAt: new Date()
        }
      });

      await tx.cart.create({
        data: {
          buyerUserId: userId,
          status: CartStatus.OPEN,
          currency: cart.currency
        }
      });
    }

    return orders;
  });

  const fullOrders = await prisma.order.findMany({
    where: { id: { in: createdOrders.map((order) => order.id) } },
    include: {
      buyer: { include: { profile: true } },
      seller: { include: { profile: true } },
      sellerBusiness: true,
      items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });

  const partialMsg = isPartial
    ? ` (${negotiatingItems.length} article${negotiatingItems.length > 1 ? "s" : ""} en marchandage reste${negotiatingItems.length > 1 ? "nt" : ""} dans le panier)`
    : "";

  return {
    message: `Commande validée avec succès${partialMsg}`,
    orders: fullOrders.map(mapOrder)
  };
};

const buildBuyerWhere = (userId: string, filters: PagingInput): Prisma.OrderWhereInput => {
  if (filters.inProgressOnly) {
    return {
      buyerUserId: userId,
      status: { in: ACTIVE_ORDER_STATUSES }
    };
  }

  if (filters.status) {
    return {
      buyerUserId: userId,
      status: filters.status
    };
  }

  return { buyerUserId: userId };
};

export const listBuyerOrders = async (
  userId: string,
  input: { status?: OrderStatus; inProgressOnly?: boolean; page?: number; limit?: number }
) => {
  const { page, limit } = normalizePaging(input);
  const where = buildBuyerWhere(userId, { ...input, page, limit });
  const { skip, take } = toPaged(page, limit);

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        sellerBusiness: true,
        items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true } } } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take
    })
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    orders: rows.map(mapOrder)
  };
};

const buildSellerWhere = (
  userId: string,
  businessIds: string[],
  filters: PagingInput
): Prisma.OrderWhereInput => {
  const ownership: Prisma.OrderWhereInput = {
    OR: [
      { sellerUserId: userId },
      ...(businessIds.length > 0 ? [{ sellerBusinessId: { in: businessIds } }] : [])
    ]
  };

  if (filters.inProgressOnly) {
    return {
      AND: [ownership, { status: { in: ACTIVE_ORDER_STATUSES } }]
    };
  }

  if (filters.status) {
    return {
      AND: [ownership, { status: filters.status }]
    };
  }

  return ownership;
};

export const listSellerOrders = async (
  userId: string,
  input: { status?: OrderStatus; inProgressOnly?: boolean; page?: number; limit?: number }
) => {
  const { page, limit } = normalizePaging(input);
  const businessIds = await resolveSellerBusinessIds(userId);
  const where = buildSellerWhere(userId, businessIds, { ...input, page, limit });
  const { skip, take } = toPaged(page, limit);

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        sellerBusiness: true,
        items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true } } } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take
    })
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    orders: rows.map(mapOrder)
  };
};

export const getOrderDetails = async (userId: string, orderId: string) => {
  const businessIds = await resolveSellerBusinessIds(userId);

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [
        { buyerUserId: userId },
        { sellerUserId: userId },
        ...(businessIds.length > 0 ? [{ sellerBusinessId: { in: businessIds } }] : [])
      ]
    },
    include: {
      buyer: { include: { profile: true } },
      seller: { include: { profile: true } },
      sellerBusiness: true,
      items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true } } } }
    }
  });

  if (!order) {
    throw new HttpError(404, "Commande introuvable");
  }

  return mapOrder(order);
};

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELED],
  // Delivery is finalized only by buyer confirmation (code/QR), not by seller status update.
  [OrderStatus.SHIPPED]: [],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELED]: []
};

export const getValidationCode = async (userId: string, orderId: string) => {
  const businessIds = await resolveSellerBusinessIds(userId);

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [
        { sellerUserId: userId },
        ...(businessIds.length > 0 ? [{ sellerBusinessId: { in: businessIds } }] : [])
      ]
    },
    select: { id: true, status: true, validationCode: true }
  });

  if (!order) {
    throw new HttpError(404, "Commande introuvable");
  }

  if (order.status !== OrderStatus.PROCESSING && order.status !== OrderStatus.SHIPPED) {
    throw new HttpError(400, "Le code de validation est disponible uniquement pendant la livraison");
  }

  // Rotate code at each seller reveal to reduce reuse/exfiltration risk.
  const rotatedCode = randomBytes(3).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.order.update({
    where: { id: order.id },
    data: { validationCode: rotatedCode, validationCodeExpiresAt: expiresAt }
  });

  // Audit trail: who revealed/regenerated a validation code and for which order.
  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "ORDER_VALIDATION_CODE_REGENERATED",
      entityType: "ORDER",
      entityId: order.id,
      metadata: {
        orderStatus: order.status,
        source: "seller",
        previousCodeHint: order.validationCode ? order.validationCode.slice(-2) : null,
        newCodeHint: rotatedCode.slice(-2)
      }
    }
  });

  return { validationCode: rotatedCode, expiresAt: expiresAt.toISOString() };
};

export const buyerConfirmDelivery = async (userId: string, orderId: string, code: string) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerUserId: userId },
    select: { id: true, status: true, validationCode: true, validationCodeExpiresAt: true }
  });

  if (!order) {
    throw new HttpError(404, "Commande introuvable");
  }

  if (order.status !== OrderStatus.PROCESSING && order.status !== OrderStatus.SHIPPED) {
    throw new HttpError(400, "La commande n'est pas dans un état confirmable");
  }

  if (!order.validationCode || order.validationCode.toUpperCase() !== code.trim().toUpperCase()) {
    throw new HttpError(400, "Code de validation incorrect");
  }

  if (order.validationCodeExpiresAt && order.validationCodeExpiresAt < new Date()) {
    throw new HttpError(410, "Ce code de validation a expiré. Demandez un nouveau code au vendeur.");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
      validationCode: null,
      validationCodeExpiresAt: null,
    },
    include: {
      buyer: { include: { profile: true } },
      seller: { include: { profile: true } },
      sellerBusiness: true,
      items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true } } } }
    }
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "ORDER_DELIVERY_CONFIRMED_BY_BUYER",
      entityType: "ORDER",
      entityId: order.id,
      metadata: {
        source: "buyer",
        method: "validation_code_or_qr",
        previousStatus: order.status,
        nextStatus: OrderStatus.DELIVERED
      }
    }
  });

  // Emit CPA growth grant to seller on successful delivery
  try {
    const { emitGrowthGrant } = await import("../incentives/incentive.service.js");
    const sellerId = updated.seller?.id ?? updated.sellerBusiness?.ownerUserId;
    if (sellerId) {
      await emitGrowthGrant(sellerId, "CPA", {
        metadata: { orderId: order.id, source: "order_delivered" },
      });
    }
  } catch { /* non-blocking */ }

  return mapOrder(updated);
};

export const updateSellerOrderStatus = async (userId: string, orderId: string, nextStatus: OrderStatus) => {
  if (nextStatus === OrderStatus.DELIVERED) {
    throw new HttpError(400, "La livraison doit etre confirmee par l'acheteur via code ou QR");
  }

  const businessIds = await resolveSellerBusinessIds(userId);

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [
        { sellerUserId: userId },
        ...(businessIds.length > 0 ? [{ sellerBusinessId: { in: businessIds } }] : [])
      ]
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!order) {
    throw new HttpError(404, "Commande introuvable");
  }

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(nextStatus)) {
    throw new HttpError(400, `Transition invalide: ${order.status} -> ${nextStatus}`);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: nextStatus,
      confirmedAt: nextStatus === OrderStatus.CONFIRMED ? new Date() : undefined,
      canceledAt: nextStatus === OrderStatus.CANCELED ? new Date() : undefined
    },
    include: {
      buyer: { include: { profile: true } },
      seller: { include: { profile: true } },
      sellerBusiness: true,
      items: { orderBy: { createdAt: "asc" }, include: { listing: { select: { imageUrl: true, stockQuantity: true } } } }
    }
  });

  // ── Décrémenter le stock quand le vendeur confirme la commande ──
  const exhaustedListings: Array<{ id: string; title: string }> = [];
  if (nextStatus === OrderStatus.CONFIRMED) {
    for (const item of updated.items) {
      if (!item.listingId) continue;
      const listing = await prisma.listing.findUnique({
        where: { id: item.listingId },
        select: { id: true, title: true, stockQuantity: true }
      });
      if (!listing || listing.stockQuantity === null) continue;

      const newStock = Math.max(0, listing.stockQuantity - item.quantity);
      await prisma.listing.update({
        where: { id: listing.id },
        data: { stockQuantity: newStock }
      });

      if (newStock === 0) {
        exhaustedListings.push({ id: listing.id, title: listing.title });
      }
    }
  }

  const mapped = mapOrder(updated);
  return { ...mapped, _exhaustedListings: exhaustedListings };
};

// ── Auto-annulation des commandes sans validation depuis 30 jours ──
const ORDER_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export const cancelExpiredOrders = async (): Promise<{ canceled: number }> => {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MS);

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED] },
      createdAt: { lt: cutoff },
    },
    select: { id: true, buyerUserId: true, sellerUserId: true, status: true, totalUsdCents: true },
    take: 200,
  });

  if (expiredOrders.length === 0) return { canceled: 0 };

  const ids = expiredOrders.map((o) => o.id);
  await prisma.order.updateMany({
    where: { id: { in: ids } },
    data: { status: OrderStatus.CANCELED, canceledAt: new Date() },
  });

  // Audit + notifications
  for (const order of expiredOrders) {
    await prisma.auditLog.create({
      data: {
        actorUserId: "SYSTEM",
        action: "ORDER_AUTO_CANCELED_30_DAYS",
        entityType: "ORDER",
        entityId: order.id,
        metadata: {
          reason: "Validation code not entered within 30 days",
          previousStatus: order.status,
          totalUsdCents: order.totalUsdCents,
        },
      },
    }).catch(() => {});
  }

  return { canceled: expiredOrders.length };
};
