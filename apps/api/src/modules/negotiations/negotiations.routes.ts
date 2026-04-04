import { NegotiationStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { requireNoRestriction } from "../../shared/middleware/trust-guard.middleware.js";
import { Role } from "../../types/roles.js";
import * as negotiationsService from "./negotiations.service.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { emitToUsers, isUserOnline } from "../messaging/socket.js";

const emitNegotiationUpdated = (
  data: { id: string; buyerUserId: string; sellerUserId: string; updatedAt: string },
  action: "CREATED" | "RESPONDED" | "CANCELED" | "JOINED" | "BUNDLE_CREATED",
  sourceUserId: string
) => {
  emitToUsers([data.buyerUserId, data.sellerUserId], "negotiation:updated", {
    type: "NEGOTIATION_UPDATED",
    action,
    negotiationId: data.id,
    buyerUserId: data.buyerUserId,
    sellerUserId: data.sellerUserId,
    sourceUserId,
    updatedAt: data.updatedAt,
  });
};

const createSchema = z.object({
  listingId: z.string().min(8),
  proposedPriceUsdCents: z.coerce.number().int().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  message: z.string().max(500).optional(),
  type: z.enum(["SIMPLE", "QUANTITY", "GROUPED"]).default("SIMPLE"),
  minBuyers: z.coerce.number().int().min(2).max(50).optional()
});

const respondSchema = z.object({
  action: z.enum(["ACCEPT", "REFUSE", "COUNTER"]),
  counterPriceUsdCents: z.coerce.number().int().min(1).optional(),
  message: z.string().max(500).optional()
});

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.nativeEnum(NegotiationStatus).optional()
});

const router = Router();

// ── Créer une négociation (acheteur) ──
router.post(
  "/",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  requireNoRestriction("NEGOTIATION_BLOCK"),
  rateLimit(RateLimits.NEGOTIATION),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = createSchema.parse(request.body);
    const data = await negotiationsService.createNegotiation(request.auth!.userId, payload);
    // Push notify seller about new negotiation
    if (data.sellerUserId && data.sellerUserId !== request.auth!.userId && !isUserOnline(data.sellerUserId)) {
      void sendPushToUser(data.sellerUserId, {
        title: "🤝 Nouvelle offre de marchandage",
        body: `Un acheteur propose un prix pour ${data.listing?.title ?? "votre article"}`,
        tag: `nego-${data.id}`,
        data: { type: "negotiation", negotiationId: data.id },
      });
    }
    emitNegotiationUpdated(data, "CREATED", request.auth!.userId);
    response.status(201).json(data);
  })
);

// ── Mes négociations en tant qu'acheteur ──
router.get(
  "/buyer",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const query = listSchema.parse(request.query);
    const data = await negotiationsService.listMyNegotiations(request.auth!.userId, "buyer", query);
    response.json(data);
  })
);

// ── Mes négociations en tant que vendeur ──
router.get(
  "/seller",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const query = listSchema.parse(request.query);
    const data = await negotiationsService.listMyNegotiations(request.auth!.userId, "seller", query);
    response.json(data);
  })
);

// ── Créer une négociation multi-articles (bundle) ──
router.post(
  "/bundle",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  requireNoRestriction("NEGOTIATION_BLOCK"),
  rateLimit(RateLimits.NEGOTIATION),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = z.object({
      items: z.array(z.object({
        listingId: z.string().min(8),
        quantity: z.coerce.number().int().min(1).default(1)
      })).min(2).max(10),
      proposedTotalUsdCents: z.coerce.number().int().min(1),
      message: z.string().max(500).optional(),
      type: z.enum(["SIMPLE", "QUANTITY", "GROUPED"]).default("SIMPLE"),
      minBuyers: z.coerce.number().int().min(2).max(50).optional()
    }).parse(request.body);
    const data = await negotiationsService.createBundleNegotiation(request.auth!.userId, payload);
    if (data.sellerUserId && data.sellerUserId !== request.auth!.userId && !isUserOnline(data.sellerUserId)) {
      void sendPushToUser(data.sellerUserId, {
        title: "📦 Offre lot — Marchandage",
        body: `Un acheteur propose un prix groupé pour ${(data as any).bundle?.items?.length ?? 0} articles`,
        tag: `nego-bundle-${data.id}`,
        data: { type: "negotiation", negotiationId: data.id },
      });
    }
    emitNegotiationUpdated(data, "BUNDLE_CREATED", request.auth!.userId);
    response.status(201).json(data);
  })
);

// ── Détails d'un bundle ──
router.get(
  "/bundle/:bundleId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await negotiationsService.getBundleDetails(request.params.bundleId, request.auth!.userId);
    response.json(data);
  })
);

// ── Lister les groupes de négociation ouverts ──
router.get(
  "/groups",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const query = z.object({
      listingId: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20)
    }).parse(request.query);
    const data = await negotiationsService.listOpenGroups(query);
    response.json(data);
  })
);

// ── Détails d'un groupe ──
router.get(
  "/groups/:groupId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await negotiationsService.getGroupDetails(request.params.groupId);
    response.json(data);
  })
);

// ── Rejoindre une négociation groupée ──
router.post(
  "/groups/:groupId/join",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  requireNoRestriction("NEGOTIATION_BLOCK"),
  rateLimit(RateLimits.NEGOTIATION),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = z.object({
      proposedPriceUsdCents: z.coerce.number().int().min(1),
      quantity: z.coerce.number().int().min(1).default(1),
      message: z.string().max(500).optional()
    }).parse(request.body);
    const data = await negotiationsService.joinGroupNegotiation(request.auth!.userId, request.params.groupId, payload);
    // Push notify seller
    if (data.sellerUserId && data.sellerUserId !== request.auth!.userId && !isUserOnline(data.sellerUserId)) {
      void sendPushToUser(data.sellerUserId, {
        title: "👥 Nouveau membre — Marchandage groupé",
        body: `Un acheteur a rejoint le groupe pour ${data.listing?.title ?? "votre article"}`,
        tag: `nego-group-${request.params.groupId}`,
        data: { type: "negotiation", negotiationId: data.id },
      });
    }
    emitNegotiationUpdated(data, "JOINED", request.auth!.userId);
    response.status(201).json(data);
  })
);

// ── Détail d'une négociation ──
router.get(
  "/:negotiationId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await negotiationsService.getNegotiationDetails(request.auth!.userId, request.params.negotiationId);
    response.json(data);
  })
);

// ── Répondre à une négociation (accept/refuse/counter) ──
router.post(
  "/:negotiationId/respond",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = respondSchema.parse(request.body);
    const data = await negotiationsService.respondToNegotiation(request.auth!.userId, request.params.negotiationId, payload);
    // Push notify the other party
    const targetUserId = data.buyerUserId === request.auth!.userId ? data.sellerUserId : data.buyerUserId;
    if (targetUserId && !isUserOnline(targetUserId)) {
      const actionLabels: Record<string, string> = { ACCEPT: "acceptée ✅", REFUSE: "refusée ❌", COUNTER: "contre-offre 🔄" };
      void sendPushToUser(targetUserId, {
        title: "🤝 Marchandage — " + (actionLabels[payload.action] ?? payload.action),
        body: `Réponse sur ${data.listing?.title ?? "un article"}`,
        tag: `nego-${data.id}`,
        data: { type: "negotiation", negotiationId: data.id },
      });
    }
    emitNegotiationUpdated(data, "RESPONDED", request.auth!.userId);
    response.json(data);
  })
);

// ── Annuler une négociation (acheteur) ──
router.delete(
  "/:negotiationId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await negotiationsService.cancelNegotiation(request.auth!.userId, request.params.negotiationId);
    emitNegotiationUpdated(data, "CANCELED", request.auth!.userId);
    response.json(data);
  })
);

// ── IA MARCHAND — Conseil pré-négociation acheteur ──
router.get(
  "/ai/hint/:listingId",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { proposedPrice } = z.object({
      proposedPrice: z.coerce.number().int().min(1).optional(),
    }).parse(request.query);
    const { getBuyerNegotiationHint } = await import("./negotiation-ai.service.js");
    const hint = await getBuyerNegotiationHint(
      request.params.listingId,
      proposedPrice ?? 0
    );
    response.json(hint);
  })
);

// ── IA MARCHAND — Conseil vendeur sur une offre reçue ──
router.get(
  "/:negotiationId/ai-advice/seller",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getSellerNegotiationAdvice } = await import("./negotiation-ai.service.js");
    const advice = await getSellerNegotiationAdvice(
      request.params.negotiationId,
      request.auth!.userId
    );
    response.json(advice);
  })
);

// ── IA MARCHAND — Auto-négociation (simulation) ──
router.post(
  "/:negotiationId/ai-auto-respond",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const rulesSchema = z.object({
      enabled: z.boolean().default(true),
      minFloorPercent: z.coerce.number().min(50).max(95).default(75),
      maxAutoDiscountPercent: z.coerce.number().min(5).max(40).default(15),
      preferredCounterPercent: z.coerce.number().min(80).max(99).default(92),
      prioritizeSpeed: z.boolean().default(false),
      stockUrgencyBoost: z.boolean().default(true),
    });
    const rules = rulesSchema.parse(request.body);
    const { autoRespondToNegotiation } = await import("./negotiation-ai.service.js");
    const decision = await autoRespondToNegotiation(
      request.params.negotiationId,
      request.auth!.userId,
      rules
    );
    response.json(decision);
  })
);

// ── Expirer les négociations périmées (usage interne / cron) ──
router.post(
  "/admin/expire",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await negotiationsService.expireStaleNegotiations();
    response.json(data);
  })
);

export default router;
