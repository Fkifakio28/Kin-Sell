/**
 * Helpers haut-niveau pour les notifications transactionnelles Kin-Sell.
 *
 * Chacun :
 *   1) Récupère les infos utilisateur (email, nom, contrepartie)
 *   2) Génère le template email approprié
 *   3) Appelle notify() qui dispatche BD + Socket + Push + Email
 *
 * À utiliser depuis les services/routes métier au lieu des `sendPushToUser`
 * directs et des emails ad-hoc.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { notify } from "./notification.service.js";
import {
  renderOrderCreated,
  renderOrderConfirmed,
  renderOrderShipped,
  renderOrderDelivered,
  renderOrderCanceled,
  renderNegotiationReceived,
  renderNegotiationCountered,
  renderNegotiationAccepted,
  renderNegotiationRefused,
  renderNegotiationExpired,
  renderPaymentSucceeded,
  renderPaymentFailed,
  renderPaymentRefunded,
} from "../../shared/email/templates/index.js";

/* ── Helpers internes ─────────────────────────────────────────────────── */

interface UserInfo {
  id: string;
  email: string | null;
  displayName: string | null;
}

async function loadUsers(...userIds: string[]): Promise<Record<string, UserInfo>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, profile: { select: { displayName: true } } },
  });
  const map: Record<string, UserInfo> = {};
  for (const u of users) {
    map[u.id] = { id: u.id, email: u.email, displayName: u.profile?.displayName ?? null };
  }
  return map;
}

function safeNotify(...args: Parameters<typeof notify>) {
  return notify(...args).catch((err) =>
    logger.warn({ err, type: args[0]?.type }, "[NotifEvents] notify échoué"),
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * 1. ORDER EVENTS
 * ────────────────────────────────────────────────────────────────────── */

export interface OrderEventInput {
  orderId: string;
  buyerUserId: string;
  sellerUserId: string;
  totalUsdCents: number;
  itemsCount?: number;
  itemTitle?: string;
  validationCode?: string; // envoyé seulement à la création (vendeur)
  trackingInfo?: string;
  reason?: string;
}

export async function emitOrderCreated(input: OrderEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const buyer = users[input.buyerUserId];
  const seller = users[input.sellerUserId];
  if (!buyer || !seller) return;

  const buyerEmail = renderOrderCreated({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    orderId: input.orderId,
    totalUsdCents: input.totalUsdCents,
    itemsCount: input.itemsCount,
    itemTitle: input.itemTitle,
    counterpartName: seller.displayName ?? undefined,
  });
  const sellerEmail = renderOrderCreated({
    recipientName: seller.displayName ?? undefined,
    recipientRole: "seller",
    orderId: input.orderId,
    totalUsdCents: input.totalUsdCents,
    itemsCount: input.itemsCount,
    itemTitle: input.itemTitle,
    counterpartName: buyer.displayName ?? undefined,
    validationCode: input.validationCode,
  });

  await Promise.all([
    safeNotify({
      userId: buyer.id,
      category: "ORDER",
      type: "order.created",
      title: buyerEmail.subject,
      body: `Votre commande de ${(input.totalUsdCents / 100).toFixed(2)} USD est confirmée.`,
      data: { orderId: input.orderId, role: "buyer" },
      url: `/account/orders/${input.orderId}?role=buyer`,
      icon: "📦",
      emailSubject: buyerEmail.subject,
      emailHtml: buyerEmail.html,
    }),
    safeNotify({
      userId: seller.id,
      category: "ORDER",
      type: "order.created",
      title: "Nouvelle commande reçue",
      body: `${buyer.displayName ?? "Un acheteur"} vient de passer commande (${input.itemsCount ?? 1} article${(input.itemsCount ?? 1) > 1 ? "s" : ""}).`,
      data: { orderId: input.orderId, role: "seller", validationCode: input.validationCode },
      url: `/account/orders/${input.orderId}?role=seller`,
      icon: "🛒",
      emailSubject: sellerEmail.subject,
      emailHtml: sellerEmail.html,
    }),
  ]);
}

export async function emitOrderStatusChanged(
  input: OrderEventInput & { status: "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELED" },
): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const buyer = users[input.buyerUserId];
  const seller = users[input.sellerUserId];
  if (!buyer || !seller) return;

  let buyerTpl: ReturnType<typeof renderOrderConfirmed> | null = null;
  let sellerTpl: ReturnType<typeof renderOrderConfirmed> | null = null;
  let type = "order.updated";

  const baseBuyer = {
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer" as const,
    orderId: input.orderId,
    totalUsdCents: input.totalUsdCents,
    itemsCount: input.itemsCount,
    itemTitle: input.itemTitle,
    counterpartName: seller.displayName ?? undefined,
    trackingInfo: input.trackingInfo,
    reason: input.reason,
  };
  const baseSeller = {
    ...baseBuyer,
    recipientName: seller.displayName ?? undefined,
    recipientRole: "seller" as const,
    counterpartName: buyer.displayName ?? undefined,
  };

  switch (input.status) {
    case "CONFIRMED":
    case "PROCESSING":
      type = "order.confirmed";
      buyerTpl = renderOrderConfirmed(baseBuyer);
      sellerTpl = renderOrderConfirmed(baseSeller);
      break;
    case "SHIPPED":
      type = "order.shipped";
      buyerTpl = renderOrderShipped(baseBuyer);
      sellerTpl = renderOrderShipped(baseSeller);
      break;
    case "DELIVERED":
      type = "order.delivered";
      buyerTpl = renderOrderDelivered(baseBuyer);
      sellerTpl = renderOrderDelivered(baseSeller);
      break;
    case "CANCELED":
      type = "order.canceled";
      buyerTpl = renderOrderCanceled(baseBuyer);
      sellerTpl = renderOrderCanceled(baseSeller);
      break;
  }

  if (!buyerTpl || !sellerTpl) return;

  await Promise.all([
    safeNotify({
      userId: buyer.id,
      category: "ORDER",
      type,
      title: buyerTpl.subject,
      body: `Commande #${input.orderId.slice(-8).toUpperCase()} — statut : ${input.status}`,
      data: { orderId: input.orderId, status: input.status, role: "buyer" },
      url: `/account/orders/${input.orderId}?role=buyer`,
      icon: input.status === "DELIVERED" ? "✅" : input.status === "SHIPPED" ? "🚚" : input.status === "CANCELED" ? "❌" : "📦",
      emailSubject: buyerTpl.subject,
      emailHtml: buyerTpl.html,
    }),
    safeNotify({
      userId: seller.id,
      category: "ORDER",
      type,
      title: sellerTpl.subject,
      body: `Commande #${input.orderId.slice(-8).toUpperCase()} — statut : ${input.status}`,
      data: { orderId: input.orderId, status: input.status, role: "seller" },
      url: `/account/orders/${input.orderId}?role=seller`,
      icon: input.status === "DELIVERED" ? "💰" : input.status === "CANCELED" ? "❌" : "📦",
      emailSubject: sellerTpl.subject,
      emailHtml: sellerTpl.html,
    }),
  ]);
}

/* ──────────────────────────────────────────────────────────────────────
 * 2. NEGOTIATION EVENTS
 * ────────────────────────────────────────────────────────────────────── */

export interface NegotiationEventInput {
  negotiationId: string;
  buyerUserId: string;
  sellerUserId: string;
  listingTitle?: string;
  proposedPriceUsdCents?: number;
  previousPriceUsdCents?: number;
  finalPriceUsdCents?: number;
  quantity?: number;
  message?: string;
  reason?: string;
}

export async function emitNegotiationReceived(input: NegotiationEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const buyer = users[input.buyerUserId];
  const seller = users[input.sellerUserId];
  if (!seller) return;

  const tpl = renderNegotiationReceived({
    recipientName: seller.displayName ?? undefined,
    recipientRole: "seller",
    negotiationId: input.negotiationId,
    listingTitle: input.listingTitle,
    proposedPriceUsdCents: input.proposedPriceUsdCents,
    quantity: input.quantity,
    message: input.message,
    counterpartName: buyer?.displayName ?? undefined,
  });

  await safeNotify({
    userId: seller.id,
    category: "NEGOTIATION",
    type: "negotiation.received",
    title: "Nouvelle offre de marchandage",
    body: input.listingTitle
      ? `${buyer?.displayName ?? "Un acheteur"} vous propose un prix sur "${input.listingTitle}".`
      : "Vous avez reçu une nouvelle offre de marchandage.",
    data: { negotiationId: input.negotiationId },
    url: `/account/negotiations/${input.negotiationId}`,
    icon: "🤝",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}

export async function emitNegotiationCountered(
  input: NegotiationEventInput & { recipientUserId: string },
): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const recipient = users[input.recipientUserId];
  const otherId = input.recipientUserId === input.buyerUserId ? input.sellerUserId : input.buyerUserId;
  const other = users[otherId];
  if (!recipient) return;

  const role: "buyer" | "seller" = input.recipientUserId === input.buyerUserId ? "buyer" : "seller";
  const tpl = renderNegotiationCountered({
    recipientName: recipient.displayName ?? undefined,
    recipientRole: role,
    negotiationId: input.negotiationId,
    listingTitle: input.listingTitle,
    proposedPriceUsdCents: input.proposedPriceUsdCents,
    previousPriceUsdCents: input.previousPriceUsdCents,
    quantity: input.quantity,
    message: input.message,
    counterpartName: other?.displayName ?? undefined,
  });

  await safeNotify({
    userId: recipient.id,
    category: "NEGOTIATION",
    type: "negotiation.countered",
    title: "Contre-offre reçue",
    body: `${other?.displayName ?? "L'autre partie"} vous fait une nouvelle proposition de prix.`,
    data: { negotiationId: input.negotiationId },
    url: `/account/negotiations/${input.negotiationId}`,
    icon: "↔️",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}

export async function emitNegotiationAccepted(input: NegotiationEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const buyer = users[input.buyerUserId];
  const seller = users[input.sellerUserId];
  if (!buyer) return;

  const tpl = renderNegotiationAccepted({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    negotiationId: input.negotiationId,
    listingTitle: input.listingTitle,
    finalPriceUsdCents: input.finalPriceUsdCents,
    quantity: input.quantity,
    counterpartName: seller?.displayName ?? undefined,
  });

  await safeNotify({
    userId: buyer.id,
    category: "NEGOTIATION",
    type: "negotiation.accepted",
    title: "Votre offre a été acceptée 🎉",
    body: input.listingTitle
      ? `Le vendeur a accepté votre prix pour "${input.listingTitle}".`
      : "Votre offre a été acceptée. Une commande va être créée.",
    data: { negotiationId: input.negotiationId },
    url: `/account/negotiations/${input.negotiationId}`,
    icon: "✅",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}

export async function emitNegotiationRefused(input: NegotiationEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  const buyer = users[input.buyerUserId];
  if (!buyer) return;

  const tpl = renderNegotiationRefused({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    negotiationId: input.negotiationId,
    listingTitle: input.listingTitle,
    reason: input.reason,
  });

  await safeNotify({
    userId: buyer.id,
    category: "NEGOTIATION",
    type: "negotiation.refused",
    title: "Offre refusée",
    body: input.listingTitle
      ? `Le vendeur a refusé votre offre pour "${input.listingTitle}".`
      : "Votre offre a été refusée.",
    data: { negotiationId: input.negotiationId },
    url: `/account/negotiations/${input.negotiationId}`,
    icon: "🚫",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}

export async function emitNegotiationExpired(input: NegotiationEventInput): Promise<void> {
  // Notifier les deux parties
  const users = await loadUsers(input.buyerUserId, input.sellerUserId);
  await Promise.all(
    (["buyer", "seller"] as const).map(async (role) => {
      const u = role === "buyer" ? users[input.buyerUserId] : users[input.sellerUserId];
      if (!u) return;
      const tpl = renderNegotiationExpired({
        recipientName: u.displayName ?? undefined,
        recipientRole: role,
        negotiationId: input.negotiationId,
        listingTitle: input.listingTitle,
      });
      await safeNotify({
        userId: u.id,
        category: "NEGOTIATION",
        type: "negotiation.expired",
        title: "Négociation expirée",
        body: "Le délai de réponse a expiré.",
        data: { negotiationId: input.negotiationId },
        url: `/account/negotiations/${input.negotiationId}`,
        icon: "⏰",
        emailSubject: tpl.subject,
        emailHtml: tpl.html,
      });
    }),
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * 3. PAYMENT EVENTS
 * ────────────────────────────────────────────────────────────────────── */

export interface PaymentEventInput {
  paymentId: string;
  orderId?: string;
  buyerUserId: string;
  sellerUserId?: string;
  amountUsdCents: number;
  method?: string;
  reference?: string;
  reason?: string;
}

export async function emitPaymentSucceeded(input: PaymentEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId, input.sellerUserId ?? "");
  const buyer = users[input.buyerUserId];
  if (!buyer) return;

  const buyerTpl = renderPaymentSucceeded({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    paymentId: input.paymentId,
    orderId: input.orderId,
    amountUsdCents: input.amountUsdCents,
    method: input.method,
    reference: input.reference,
  });

  const tasks: Promise<unknown>[] = [
    safeNotify({
      userId: buyer.id,
      category: "PAYMENT",
      type: "payment.succeeded",
      title: "Paiement confirmé ✓",
      body: `Votre paiement de ${(input.amountUsdCents / 100).toFixed(2)} USD a été reçu.`,
      data: { paymentId: input.paymentId, orderId: input.orderId, role: "buyer" },
      url: input.orderId ? `/account/orders/${input.orderId}?role=buyer` : "/account/wallet",
      icon: "💳",
      emailSubject: buyerTpl.subject,
      emailHtml: buyerTpl.html,
    }),
  ];

  const seller = input.sellerUserId ? users[input.sellerUserId] : null;
  if (seller) {
    const sellerTpl = renderPaymentSucceeded({
      recipientName: seller.displayName ?? undefined,
      recipientRole: "seller",
      paymentId: input.paymentId,
      orderId: input.orderId,
      amountUsdCents: input.amountUsdCents,
      method: input.method,
      reference: input.reference,
    });
    tasks.push(
      safeNotify({
        userId: seller.id,
        category: "PAYMENT",
        type: "payment.succeeded",
        title: "Paiement reçu",
        body: `Un paiement de ${(input.amountUsdCents / 100).toFixed(2)} USD a été validé pour votre commande.`,
        data: { paymentId: input.paymentId, orderId: input.orderId, role: "seller" },
        url: input.orderId ? `/account/orders/${input.orderId}?role=seller` : "/account/wallet",
        icon: "💰",
        emailSubject: sellerTpl.subject,
        emailHtml: sellerTpl.html,
      }),
    );
  }

  await Promise.all(tasks);
}

export async function emitPaymentFailed(input: PaymentEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId);
  const buyer = users[input.buyerUserId];
  if (!buyer) return;

  const tpl = renderPaymentFailed({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    paymentId: input.paymentId,
    orderId: input.orderId,
    amountUsdCents: input.amountUsdCents,
    method: input.method,
    reference: input.reference,
    reason: input.reason,
  });

  await safeNotify({
    userId: buyer.id,
    category: "PAYMENT",
    type: "payment.failed",
    title: "Échec du paiement",
    body: input.reason ? `Motif : ${input.reason}` : "Votre paiement n'a pas pu aboutir.",
    data: { paymentId: input.paymentId, orderId: input.orderId },
    url: input.orderId ? `/account/orders/${input.orderId}/pay` : "/account/orders",
    icon: "⚠️",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}

export async function emitPaymentRefunded(input: PaymentEventInput): Promise<void> {
  const users = await loadUsers(input.buyerUserId);
  const buyer = users[input.buyerUserId];
  if (!buyer) return;

  const tpl = renderPaymentRefunded({
    recipientName: buyer.displayName ?? undefined,
    recipientRole: "buyer",
    paymentId: input.paymentId,
    orderId: input.orderId,
    amountUsdCents: input.amountUsdCents,
    method: input.method,
    reference: input.reference,
    reason: input.reason,
  });

  await safeNotify({
    userId: buyer.id,
    category: "PAYMENT",
    type: "payment.refunded",
    title: "Remboursement effectué",
    body: `Un remboursement de ${(input.amountUsdCents / 100).toFixed(2)} USD a été initié.`,
    data: { paymentId: input.paymentId, orderId: input.orderId },
    url: "/account/wallet",
    icon: "↩️",
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
  });
}
