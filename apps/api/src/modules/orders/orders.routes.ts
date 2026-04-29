import { OrderStatus } from "../../shared/db/prisma-enums.js";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { prisma } from "../../shared/db/prisma.js";
import { Role } from "../../types/roles.js";
import * as ordersService from "./orders.service.js";
import { sendPushToUser } from "../notifications/push.service.js";
import {
  emitOrderCreated,
  emitOrderStatusChanged,
} from "../notifications/notification.events.js";
import { emitToUsers, emitToUser, isUserOnline } from "../messaging/socket.js";
import * as momoService from "../mobile-money/mobile-money.service.js";
import { requireIa } from "../../shared/billing/subscription-guard.js";
import { spamGuard } from "../../shared/middleware/spam-guard.middleware.js";
import { logger } from "../../shared/logger.js";

/**
 * Défense anti-cache pour les endpoints panier/checkout :
 * - `Cache-Control: private, no-store` empêche tout proxy/CDN de cacher la réponse
 * - `Vary: Authorization, Cookie` garantit que même si un intermédiaire ignore no-store,
 *   il différenciera les réponses par session utilisateur
 * - `Pragma: no-cache` pour les proxies HTTP/1.0 legacy
 */
const noCacheHeaders = (_req: AuthenticatedRequest, res: import("express").Response, next: import("express").NextFunction) => {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Authorization, Cookie");
  next();
};

const pagingSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  inProgressOnly: z.coerce.boolean().optional(),
  status: z.nativeEnum(OrderStatus).optional()
});

const addCartItemSchema = z.object({
  listingId: z.string().min(8),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPriceUsdCents: z.coerce.number().int().min(0).optional()
});

const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).optional(),
  unitPriceUsdCents: z.coerce.number().int().min(0).optional()
}).refine((value) => value.quantity !== undefined || value.unitPriceUsdCents !== undefined, {
  message: "quantity ou unitPriceUsdCents est requis"
});

const checkoutSchema = z.object({
  notes: z.string().min(2).max(400).optional(),
  deliveryAddress: z.string().max(300).optional(),
  deliveryCity: z.string().max(80).optional(),
  deliveryCountry: z.string().max(80).optional(),
  deliveryLatitude: z.number().min(-90).max(90).optional(),
  deliveryLongitude: z.number().min(-180).max(180).optional(),
  deliveryPlaceId: z.string().max(300).optional(),
  deliveryFormattedAddress: z.string().max(300).optional(),
});

const momoCheckoutSchema = z.object({
  notes: z.string().min(2).max(400).optional(),
  provider: z.enum(["ORANGE_MONEY", "MPESA"]),
  phoneNumber: z.string().regex(/^243\d{9}$/, "Format: 243XXXXXXXXX"),
  amountCDF: z.number().int().min(100, "Montant minimum: 100 CDF")
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus)
});

const router = Router();

router.get(
  "/buyer/cart",
  noCacheHeaders,
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = request.auth!.userId;
    const data = await ordersService.getBuyerCart(userId);
    // Audit télémétrie : log userId + cartId + items pour détecter si 2 userIds différents
    // voient le même cartId (preuve d'une fuite serveur ou proxy cache)
    logger.info(
      {
        userId,
        cartId: (data as any)?.id,
        itemsCount: (data as any)?.items?.length ?? 0,
        listingIds: Array.isArray((data as any)?.items)
          ? (data as any).items.map((it: any) => it?.listingId).filter(Boolean)
          : []
      },
      "[CART_AUDIT] GET /buyer/cart"
    );
    response.json(data);
  })
);

router.post(
  "/buyer/cart/items",
  noCacheHeaders,
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  spamGuard("TRADE"),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = addCartItemSchema.parse(request.body);
    const data = await ordersService.addCartItem(request.auth!.userId, payload);
    emitToUser(request.auth!.userId, "cart:updated", { action: "item-added", cartId: data.id });
    response.status(201).json(data);
  })
);

router.patch(
  "/buyer/cart/items/:itemId",
  noCacheHeaders,
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = updateCartItemSchema.parse(request.body);
    const data = await ordersService.updateCartItem(request.auth!.userId, request.params.itemId, payload);
    emitToUser(request.auth!.userId, "cart:updated", { action: "item-updated", cartId: data.id });
    response.json(data);
  })
);

router.delete(
  "/buyer/cart/items/:itemId",
  noCacheHeaders,
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await ordersService.removeCartItem(request.auth!.userId, request.params.itemId);
    emitToUser(request.auth!.userId, "cart:updated", { action: "item-removed", cartId: data.id });
    response.json(data);
  })
);

router.post(
  "/buyer/checkout",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  spamGuard("TRADE"),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = checkoutSchema.parse(request.body ?? {});
    const data = await ordersService.checkoutBuyerCart(request.auth!.userId, payload.notes, {
      deliveryAddress: payload.deliveryAddress,
      deliveryCity: payload.deliveryCity,
      deliveryCountry: payload.deliveryCountry,
      deliveryLatitude: payload.deliveryLatitude,
      deliveryLongitude: payload.deliveryLongitude,
      deliveryPlaceId: payload.deliveryPlaceId,
      deliveryFormattedAddress: payload.deliveryFormattedAddress,
    });
    // Push + Socket notify sellers about new orders
    for (const order of data.orders ?? []) {
      if (order.seller?.userId && order.seller.userId !== request.auth!.userId) {
        // Notif unifiée (BD + push + email + socket-notif)
        void emitOrderCreated({
          orderId: order.id,
          buyerUserId: request.auth!.userId,
          sellerUserId: order.seller.userId,
          totalUsdCents: order.totalUsdCents ?? 0,
          itemsCount: order.itemsCount ?? 1,
          itemTitle: order.items?.[0]?.title,
        });
        emitToUser(order.seller.userId, "order:created", {
          type: "ORDER_CREATED",
          orderId: order.id,
          buyerUserId: request.auth!.userId,
          sellerUserId: order.seller.userId,
          itemsCount: order.itemsCount ?? 1,
          totalUsdCents: order.totalUsdCents ?? 0,
          createdAt: new Date().toISOString(),
        });
      }
    }
    // Ack to buyer: emit order:created for each order
    for (const order of data.orders ?? []) {
      emitToUser(request.auth!.userId, "order:created", {
        type: "ORDER_CREATED",
        orderId: order.id,
        buyerUserId: request.auth!.userId,
        sellerUserId: order.seller?.userId ?? "",
        itemsCount: order.itemsCount ?? 1,
        totalUsdCents: order.totalUsdCents ?? 0,
        createdAt: new Date().toISOString(),
      });
    }
    emitToUser(request.auth!.userId, "cart:updated", { action: "checked-out", cartId: "" });
    response.status(201).json(data);
  })
);

router.post(
  "/buyer/checkout/mobile-money",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = momoCheckoutSchema.parse(request.body);

    // Checkout classique → crée les commandes
    const data = await ordersService.checkoutBuyerCart(request.auth!.userId, payload.notes);

    // Initier le paiement Mobile Money pour chaque commande créée
    const momoPayments = [];
    for (const order of data.orders ?? []) {
      const momoResult = await momoService.initiatePayment(request.auth!.userId, {
        provider: payload.provider,
        phoneNumber: payload.phoneNumber,
        amountCDF: payload.amountCDF,
        purpose: "ORDER",
        targetId: order.id,
      });
      momoPayments.push(momoResult);

      // Push + Socket notify sellers
      if (order.seller?.userId && order.seller.userId !== request.auth!.userId) {
        void emitOrderCreated({
          orderId: order.id,
          buyerUserId: request.auth!.userId,
          sellerUserId: order.seller.userId,
          totalUsdCents: order.totalUsdCents ?? 0,
          itemsCount: order.itemsCount ?? 1,
          itemTitle: order.items?.[0]?.title,
        });
        emitToUser(order.seller.userId, "order:created", {
          type: "ORDER_CREATED",
          orderId: order.id,
          buyerUserId: request.auth!.userId,
          sellerUserId: order.seller.userId,
          itemsCount: order.itemsCount ?? 1,
          totalUsdCents: order.totalUsdCents ?? 0,
          createdAt: new Date().toISOString(),
        });
      }
      // Ack to buyer
      emitToUser(request.auth!.userId, "order:created", {
        type: "ORDER_CREATED",
        orderId: order.id,
        buyerUserId: request.auth!.userId,
        sellerUserId: order.seller?.userId ?? "",
        itemsCount: order.itemsCount ?? 1,
        totalUsdCents: order.totalUsdCents ?? 0,
        createdAt: new Date().toISOString(),
      });
    }

    emitToUser(request.auth!.userId, "cart:updated", { action: "checked-out", cartId: "" });
    response.status(201).json({ ...data, mobileMoneyPayments: momoPayments });
  })
);

router.get(
  "/buyer/orders",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const query = pagingSchema.parse(request.query);
    const data = await ordersService.listBuyerOrders(request.auth!.userId, query);
    response.json(data);
  })
);

router.get(
  "/seller/orders",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const query = pagingSchema.parse(request.query);
    const data = await ordersService.listSellerOrders(request.auth!.userId, query);
    response.json(data);
  })
);

router.get(
  "/:orderId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await ordersService.getOrderDetails(request.auth!.userId, request.params.orderId);
    response.json(data);
  })
);

router.patch(
  "/:orderId/status",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = updateStatusSchema.parse(request.body);
    const data = await ordersService.updateSellerOrderStatus(request.auth!.userId, request.params.orderId, payload.status);
    // Notif unifiée (BD + push + email + socket) acheteur
    if (data.buyer?.userId && data.buyer.userId !== request.auth!.userId) {
      void emitOrderStatusChanged({
        orderId: data.id,
        buyerUserId: data.buyer.userId,
        sellerUserId: data.seller.userId,
        totalUsdCents: data.totalUsdCents ?? 0,
        itemsCount: data.items?.length ?? 1,
        itemTitle: data.items?.[0]?.title,
        status: payload.status as any,
      });
    }
    emitToUsers([data.buyer.userId, data.seller.userId], "order:status-updated", {
      type: "ORDER_STATUS_UPDATED",
      orderId: data.id,
      status: data.status,
      buyerUserId: data.buyer.userId,
      sellerUserId: data.seller.userId,
      sourceUserId: request.auth!.userId,
      updatedAt: new Date().toISOString(),
    });

    // ── Notification stock épuisé au vendeur ──
    const exhausted = (data as any)._exhaustedListings as Array<{ id: string; title: string }> | undefined;
    if (exhausted && exhausted.length > 0) {
      const sellerUserId = data.seller.userId;
      for (const listing of exhausted) {
        void sendPushToUser(sellerUserId, {
          title: "⚠️ Stock épuisé",
          body: `Votre article "${listing.title}" est en rupture de stock`,
          tag: `stock-exhausted-${listing.id}`,
          data: { type: "stock", listingId: listing.id },
        });
      }
      emitToUser(sellerUserId, "listing:stock-exhausted", {
        type: "LISTING_STOCK_EXHAUSTED",
        listings: exhausted,
        orderId: data.id,
        updatedAt: new Date().toISOString(),
      });
    }

    // Remove internal field from response
    const { _exhaustedListings, ...responseData } = data as any;
    response.json(responseData);
  })
);

router.get(
  "/:orderId/validation-code",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await ordersService.getValidationCode(request.auth!.userId, request.params.orderId);
    response.json(data);
  })
);

const buyerConfirmSchema = z.object({
  code: z.string().min(1).max(20)
});

router.post(
  "/:orderId/buyer-confirm",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = buyerConfirmSchema.parse(request.body);
    const data = await ordersService.buyerConfirmDelivery(request.auth!.userId, request.params.orderId, payload.code);
    if (data.seller?.userId && data.seller.userId !== request.auth!.userId && !isUserOnline(data.seller.userId)) {
      void sendPushToUser(data.seller.userId, {
        title: "✅ Livraison confirmée",
        body: `La commande #${data.id.slice(-6)} a été validée par l'acheteur`,
        tag: `order-${data.id}`,
        data: { type: "order", orderId: data.id },
      });
    }
    emitToUsers([data.buyer.userId, data.seller.userId], "order:delivery-confirmed", {
      type: "ORDER_CONFIRMATION_COMPLETED",
      orderId: data.id,
      status: data.status,
      buyerUserId: data.buyer.userId,
      sellerUserId: data.seller.userId,
      sourceUserId: request.auth!.userId,
      updatedAt: new Date().toISOString(),
    });

    // ── AI Trigger: vente complétée → recommandations vendeur (fire-and-forget) ──
    import("../analytics/ai-trigger.service.js")
      .then((t) => t.onSaleCompleted(data.seller.userId, data.id))
      .catch(() => {});

    response.json(data);
  })
);

// ─────────────────────────────────────────────
// IA COMMANDE
// ─────────────────────────────────────────────

// ── Conseil checkout (bundle, discount, urgence, livraison) ──
router.get(
  "/ai/checkout-advice/:cartId",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_ORDER")(req, res, next); }),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getCheckoutAdvice } = await import("./order-ai.service.js");
    const advice = await getCheckoutAdvice(request.params.cartId, request.auth!.userId);
    response.json(advice);
  })
);

// ── Abandon panier (risque pour l'acheteur connecté) ──
router.get(
  "/ai/abandonment-risk",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_ORDER")(req, res, next); }),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { detectAbandonmentRisk } = await import("./order-ai.service.js");
    const report = await detectAbandonmentRisk(request.auth!.userId);
    response.json(report);
  })
);

// ── Auto-validation IA d'une commande ──
router.get(
  "/:orderId/ai/auto-validation",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_ORDER")(req, res, next); }),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getOrderAutoValidationDecision } = await import("./order-ai.service.js");
    const decision = await getOrderAutoValidationDecision(request.params.orderId);
    response.json(decision);
  })
);

// ── Détection anomalies IA d'une commande ──
router.get(
  "/:orderId/ai/anomalies",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS, Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_ORDER")(req, res, next); }),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = request.auth!.userId;
    const role = request.auth!.role;

    // Vérifier ownership : seul le vendeur, l'acheteur ou un admin peut voir les anomalies
    const order = await prisma.order.findUnique({
      where: { id: request.params.orderId },
      select: { buyerUserId: true, sellerUserId: true },
    });
    if (!order) {
      response.status(404).json({ error: "Commande introuvable" });
      return;
    }
    const isOwner = order.buyerUserId === userId || order.sellerUserId === userId;
    const isAdmin = role === Role.ADMIN || role === Role.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      response.status(403).json({ error: "Accès refusé — vous n'êtes pas concerné par cette commande" });
      return;
    }

    const { detectOrderAnomalies } = await import("./order-ai.service.js");
    const anomalyReport = await detectOrderAnomalies(request.params.orderId);
    response.json(anomalyReport);
  })
);

export default router;
