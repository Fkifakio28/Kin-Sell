/**
 * Templates emails — Négociations (marchandage, offres, contre-offres)
 */

import { renderEmailLayout, formatUsdCents, publicUrl } from "./layout.js";

export interface NegotiationEmailContext {
  recipientName?: string;
  recipientRole: "buyer" | "seller";
  negotiationId: string;
  listingTitle?: string;
  proposedPriceUsdCents?: number;
  previousPriceUsdCents?: number;
  finalPriceUsdCents?: number;
  quantity?: number;
  message?: string;
  counterpartName?: string;
  expiresAt?: Date | string;
  reason?: string; // motif refus
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function negoUrl(id: string): string {
  return publicUrl(`/account/negotiations/${id}`);
}

function baseRows(ctx: NegotiationEmailContext) {
  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [];
  if (ctx.listingTitle) rows.push({ label: "Annonce", value: ctx.listingTitle });
  if (ctx.counterpartName) {
    rows.push({
      label: ctx.recipientRole === "buyer" ? "Vendeur" : "Acheteur",
      value: ctx.counterpartName,
    });
  }
  if (ctx.quantity) rows.push({ label: "Quantité", value: String(ctx.quantity) });
  return rows;
}

/* ── 1. Nouvelle offre reçue (côté vendeur) ────────────────────────────── */
export function renderNegotiationReceived(ctx: NegotiationEmailContext): RenderedEmail {
  const title = "Nouvelle offre de marchandage";
  const intro = `Vous avez reçu une nouvelle proposition${ctx.counterpartName ? ` de ${ctx.counterpartName}` : ""} sur l'une de vos annonces.`;
  const rows = baseRows(ctx);
  if (ctx.proposedPriceUsdCents !== undefined) {
    rows.push({ label: "Prix proposé", value: formatUsdCents(ctx.proposedPriceUsdCents), highlight: true });
  }

  const body = ctx.message
    ? `<blockquote style="border-left:3px solid #6f58ff;padding:8px 12px;margin:12px 0;color:#cfc8e8;font-style:italic;">${ctx.message}</blockquote>`
    : undefined;

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows,
    body,
    buttons: [
      { label: "Accepter ou contre-proposer", url: negoUrl(ctx.negotiationId) },
    ],
    footerNote: "Vous pouvez accepter, refuser ou faire une contre-offre depuis votre tableau de bord.",
  });

  return { subject: title, html, text: `${title}\n\n${intro}\n\n${negoUrl(ctx.negotiationId)}` };
}

/* ── 2. Contre-offre ──────────────────────────────────────────────────── */
export function renderNegotiationCountered(ctx: NegotiationEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Contre-offre du vendeur" : "Contre-offre de l'acheteur";
  const intro = `${ctx.counterpartName ?? "L'autre partie"} vous fait une nouvelle proposition de prix.`;

  const rows = baseRows(ctx);
  if (ctx.previousPriceUsdCents !== undefined) {
    rows.push({ label: "Prix précédent", value: formatUsdCents(ctx.previousPriceUsdCents) });
  }
  if (ctx.proposedPriceUsdCents !== undefined) {
    rows.push({ label: "Nouvelle offre", value: formatUsdCents(ctx.proposedPriceUsdCents), highlight: true });
  }

  const body = ctx.message
    ? `<blockquote style="border-left:3px solid #6f58ff;padding:8px 12px;margin:12px 0;color:#cfc8e8;font-style:italic;">${ctx.message}</blockquote>`
    : undefined;

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows,
    body,
    buttons: [{ label: "Voir la contre-offre", url: negoUrl(ctx.negotiationId) }],
  });

  return { subject: title, html, text: `${title}\n\n${intro}\n\n${negoUrl(ctx.negotiationId)}` };
}

/* ── 3. Acceptation ───────────────────────────────────────────────────── */
export function renderNegotiationAccepted(ctx: NegotiationEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Votre offre a été acceptée 🎉" : "Vous avez accepté l'offre";
  const intro = isBuyer
    ? "Excellente nouvelle ! Le vendeur a accepté votre proposition. Une commande va être créée."
    : "Vous avez accepté la proposition. Une commande a été créée et l'acheteur a été notifié.";

  const rows = baseRows(ctx);
  if (ctx.finalPriceUsdCents !== undefined) {
    rows.push({ label: "Prix final", value: formatUsdCents(ctx.finalPriceUsdCents), highlight: true });
  }

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows,
    buttons: [{ label: "Voir la commande", url: publicUrl("/account/orders") }],
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}

/* ── 4. Refus ─────────────────────────────────────────────────────────── */
export function renderNegotiationRefused(ctx: NegotiationEmailContext): RenderedEmail {
  const title = "Offre refusée";
  const intro = ctx.reason
    ? `Votre offre a été refusée. Motif : ${ctx.reason}.`
    : "Votre offre n'a pas été retenue.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: baseRows(ctx),
    buttons: [{ label: "Faire une nouvelle offre", url: negoUrl(ctx.negotiationId) }],
    footerNote: "Vous pouvez tenter une nouvelle proposition ou explorer d'autres annonces similaires.",
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}

/* ── 5. Expirée ───────────────────────────────────────────────────────── */
export function renderNegotiationExpired(ctx: NegotiationEmailContext): RenderedEmail {
  const title = "Négociation expirée";
  const intro = "Le délai de réponse de la négociation a expiré. Vous pouvez en initier une nouvelle si vous le souhaitez.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: baseRows(ctx),
    buttons: [{ label: "Voir le détail", url: negoUrl(ctx.negotiationId) }],
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}
