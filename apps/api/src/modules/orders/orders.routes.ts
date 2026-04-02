import { OrderStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { Role } from "../../types/roles.js";
import * as ordersService from "./orders.service.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { emitToUsers } from "../messaging/socket.js";
import * as momoService from "../mobile-money/mobile-money.service.js";

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
  notes: z.string().min(2).max(400).optional()
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
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await ordersService.getBuyerCart(request.auth!.userId);
    response.json(data);
  })
);

router.post(
  "/buyer/cart/items",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = addCartItemSchema.parse(request.body);
    const data = await ordersService.addCartItem(request.auth!.userId, payload);
    response.status(201).json(data);
  })
);

router.patch(
  "/buyer/cart/items/:itemId",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = updateCartItemSchema.parse(request.body);
    const data = await ordersService.updateCartItem(request.auth!.userId, request.params.itemId, payload);
    response.json(data);
  })
);

router.delete(
  "/buyer/cart/items/:itemId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await ordersService.removeCartItem(request.auth!.userId, request.params.itemId);
    response.json(data);
  })
);

router.post(
  "/buyer/checkout",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = checkoutSchema.parse(request.body ?? {});
    const data = await ordersService.checkoutBuyerCart(request.auth!.userId, payload.notes);
    // Push notify sellers about new orders
    for (const order of data.orders ?? []) {
      if (order.seller?.userId && order.seller.userId !== request.auth!.userId) {
        void sendPushToUser(order.seller.userId, {
          title: "🛒 Nouvelle commande !",
          body: `Vous avez reçu une nouvelle commande de ${order.itemsCount ?? 1} article(s)`,
          tag: `order-${order.id}`,
          data: { type: "order", orderId: order.id },
        });
      }
    }
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

      // Push notify sellers
      if (order.seller?.userId && order.seller.userId !== request.auth!.userId) {
        void sendPushToUser(order.seller.userId, {
          title: "🛒 Nouvelle commande !",
          body: `Vous avez reçu une nouvelle commande de ${order.itemsCount ?? 1} article(s)`,
          tag: `order-${order.id}`,
          data: { type: "order", orderId: order.id },
        });
      }
    }

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
    // Push notify buyer about order status change
    const statusLabels: Record<string, string> = { CONFIRMED: "confirmée", SHIPPED: "expédiée", DELIVERED: "livrée", CANCELED: "annulée" };
    const label = statusLabels[payload.status] ?? payload.status;
    if (data.buyer?.userId && data.buyer.userId !== request.auth!.userId) {
      void sendPushToUser(data.buyer.userId, {
        title: "📦 Commande " + label,
        body: `Votre commande #${data.id.slice(-6)} a été ${label}`,
        tag: `order-${data.id}`,
        data: { type: "order", orderId: data.id },
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
    response.json(data);
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
    if (data.seller?.userId && data.seller.userId !== request.auth!.userId) {
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
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getOrderAutoValidationDecision } = await import("./order-ai.service.js");
    const decision = await getOrderAutoValidationDecision(request.params.orderId);
    response.json(decision);
  })
);

export default router;
