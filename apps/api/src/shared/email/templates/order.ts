/**
 * Templates emails — Commandes (Order)
 *
 * Couvre tous les statuts du cycle de vie d'une commande Kin-Sell :
 * créée, confirmée, en traitement, expédiée, livrée, annulée.
 *
 * Chaque helper renvoie `{ subject, html, text }` prêt à passer à `sendMail()`.
 */

import { renderEmailLayout, formatUsdCents, formatDate, publicUrl } from "./layout.js";

export interface OrderEmailContext {
  recipientName?: string; // ex: "Jean"
  recipientRole: "buyer" | "seller";
  orderId: string;
  orderNumber?: string; // numéro court affiché à l'utilisateur
  totalUsdCents: number;
  itemsCount?: number;
  itemTitle?: string;
  counterpartName?: string; // l'autre partie (vendeur si destinataire = acheteur, inverse sinon)
  validationCode?: string; // code de livraison (envoyé au vendeur uniquement à la création)
  trackingInfo?: string;
  reason?: string; // motif d'annulation
  createdAt?: Date | string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function orderUrl(orderId: string, role: "buyer" | "seller"): string {
  return publicUrl(`/account/orders/${orderId}?role=${role}`);
}

function commonRows(ctx: OrderEmailContext) {
  const rows = [
    { label: "N° commande", value: ctx.orderNumber ?? ctx.orderId.slice(-8).toUpperCase() },
    { label: "Montant", value: formatUsdCents(ctx.totalUsdCents), highlight: true },
  ];
  if (ctx.itemsCount) rows.push({ label: "Articles", value: String(ctx.itemsCount) });
  if (ctx.itemTitle) rows.push({ label: "Produit", value: ctx.itemTitle });
  if (ctx.counterpartName) {
    rows.push({
      label: ctx.recipientRole === "buyer" ? "Vendeur" : "Acheteur",
      value: ctx.counterpartName,
    });
  }
  if (ctx.createdAt) rows.push({ label: "Date", value: formatDate(ctx.createdAt) });
  return rows;
}

/* ── 1. Création de commande ───────────────────────────────────────────── */
export function renderOrderCreated(ctx: OrderEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Votre commande est confirmée" : "Vous avez reçu une nouvelle commande";
  const intro = isBuyer
    ? "Merci pour votre commande sur Kin-Sell ! Le vendeur a été notifié et préparera votre commande sous peu."
    : "Bonne nouvelle ! Un acheteur vient de valider une commande chez vous. Préparez-la pour expédition.";

  const rows = commonRows(ctx);
  if (!isBuyer && ctx.validationCode) {
    rows.push({ label: "Code de livraison", value: ctx.validationCode, highlight: true });
  }

  const body = !isBuyer && ctx.validationCode
    ? `<p style="margin:8px 0;">Conservez ce code : il sera demandé à l'acheteur au moment de la livraison pour valider la transaction.</p>`
    : undefined;

  const html = renderEmailLayout({
    preheader: isBuyer ? "Votre commande Kin-Sell est confirmée" : "Nouvelle commande reçue",
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows,
    body,
    buttons: [{ label: "Voir la commande", url: orderUrl(ctx.orderId, ctx.recipientRole) }],
    footerNote: isBuyer
      ? "Vous serez notifié à chaque étape : préparation, expédition, livraison."
      : "Vous pouvez communiquer avec l'acheteur via la messagerie Kin-Sell.",
  });

  return {
    subject: isBuyer ? `Commande confirmée — ${formatUsdCents(ctx.totalUsdCents)}` : `Nouvelle commande — ${formatUsdCents(ctx.totalUsdCents)}`,
    html,
    text: `${title}\n\n${intro}\n\nVoir la commande : ${orderUrl(ctx.orderId, ctx.recipientRole)}`,
  };
}

/* ── 2. Commande confirmée par le vendeur ─────────────────────────────── */
export function renderOrderConfirmed(ctx: OrderEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Votre commande est en préparation" : "Vous avez confirmé la commande";
  const intro = isBuyer
    ? "Le vendeur a confirmé votre commande. Elle est désormais en cours de préparation."
    : "Vous avez confirmé la commande. Préparez-la maintenant pour l'expédition.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: commonRows(ctx),
    buttons: [{ label: "Voir la commande", url: orderUrl(ctx.orderId, ctx.recipientRole) }],
  });

  return { subject: title, html, text: `${title}\n\n${intro}\n\n${orderUrl(ctx.orderId, ctx.recipientRole)}` };
}

/* ── 3. Commande expédiée ─────────────────────────────────────────────── */
export function renderOrderShipped(ctx: OrderEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Votre commande est en route" : "Commande marquée comme expédiée";
  const intro = isBuyer
    ? "Bonne nouvelle, votre commande a été expédiée par le vendeur ! Préparez-vous à la recevoir."
    : "Vous avez marqué la commande comme expédiée. L'acheteur en a été informé.";

  const rows = commonRows(ctx);
  if (ctx.trackingInfo) rows.push({ label: "Suivi", value: ctx.trackingInfo });

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows,
    buttons: [{ label: "Suivre la commande", url: orderUrl(ctx.orderId, ctx.recipientRole) }],
    footerNote: isBuyer
      ? "À la livraison, communiquez le code reçu par le vendeur pour valider la transaction."
      : undefined,
  });

  return { subject: title, html, text: `${title}\n\n${intro}\n\n${orderUrl(ctx.orderId, ctx.recipientRole)}` };
}

/* ── 4. Commande livrée ───────────────────────────────────────────────── */
export function renderOrderDelivered(ctx: OrderEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Votre commande a été livrée" : "Commande livrée — paiement débloqué";
  const intro = isBuyer
    ? "Votre commande a bien été marquée comme livrée. Merci pour votre confiance ! N'hésitez pas à laisser un avis."
    : "La livraison a été validée. Le paiement va être crédité sur votre wallet Kin-Sell selon les délais habituels.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: commonRows(ctx),
    buttons: isBuyer
      ? [
          { label: "Laisser un avis", url: publicUrl(`/account/orders/${ctx.orderId}/review`) },
          { label: "Voir la commande", url: orderUrl(ctx.orderId, "buyer"), variant: "secondary" },
        ]
      : [{ label: "Voir mon wallet", url: publicUrl("/account/wallet") }],
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}

/* ── 5. Commande annulée ──────────────────────────────────────────────── */
export function renderOrderCanceled(ctx: OrderEmailContext): RenderedEmail {
  const title = "Commande annulée";
  const intro = ctx.reason
    ? `La commande a été annulée. Motif : ${ctx.reason}.`
    : "La commande a été annulée.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: commonRows(ctx),
    buttons: [{ label: "Voir le détail", url: orderUrl(ctx.orderId, ctx.recipientRole) }],
    footerNote: "Si un paiement avait été initié, il sera automatiquement remboursé.",
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}
