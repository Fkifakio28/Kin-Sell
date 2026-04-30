/**
 * Templates emails — Paiements (Mobile Money, PayPal, Wallet)
 */

import { renderEmailLayout, formatUsdCents, formatDate, publicUrl, type EmailRow } from "./layout.js";

export interface PaymentEmailContext {
  recipientName?: string;
  recipientRole: "buyer" | "seller";
  paymentId: string;
  orderId?: string;
  amountUsdCents: number;
  method?: string; // ex: "Mobile Money (Orange)", "PayPal", "Wallet"
  reference?: string;
  reason?: string; // motif d'échec ou de remboursement
  createdAt?: Date | string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function rows(ctx: PaymentEmailContext): EmailRow[] {
  const r: EmailRow[] = [
    { label: "Montant", value: formatUsdCents(ctx.amountUsdCents), highlight: true },
  ];
  if (ctx.method) r.push({ label: "Moyen de paiement", value: ctx.method });
  if (ctx.reference) r.push({ label: "Référence", value: ctx.reference });
  if (ctx.orderId) r.push({ label: "Commande", value: ctx.orderId.slice(-8).toUpperCase() });
  if (ctx.createdAt) r.push({ label: "Date", value: formatDate(ctx.createdAt) });
  return r;
}

/* ── 1. Paiement réussi ───────────────────────────────────────────────── */
export function renderPaymentSucceeded(ctx: PaymentEmailContext): RenderedEmail {
  const isBuyer = ctx.recipientRole === "buyer";
  const title = isBuyer ? "Paiement confirmé ✓" : "Paiement reçu";
  const intro = isBuyer
    ? "Votre paiement a bien été reçu. Votre commande va être traitée par le vendeur."
    : "Un paiement vient d'être validé pour l'une de vos commandes. Le montant sera crédité sur votre wallet selon les conditions habituelles.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: rows(ctx),
    buttons: [
      ctx.orderId
        ? { label: "Voir la commande", url: publicUrl(`/account/orders/${ctx.orderId}?role=${ctx.recipientRole}`) }
        : { label: isBuyer ? "Mes commandes" : "Mon wallet", url: publicUrl(isBuyer ? "/account/orders" : "/account/wallet") },
    ],
    footerNote: "Conservez ce reçu pour vos archives.",
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}

/* ── 2. Paiement échoué ───────────────────────────────────────────────── */
export function renderPaymentFailed(ctx: PaymentEmailContext): RenderedEmail {
  const title = "Échec du paiement";
  const intro = ctx.reason
    ? `Votre paiement n'a pas pu aboutir. Motif : ${ctx.reason}.`
    : "Votre paiement n'a pas pu aboutir.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: rows(ctx),
    buttons: [
      ctx.orderId
        ? { label: "Réessayer le paiement", url: publicUrl(`/account/orders/${ctx.orderId}/pay`) }
        : { label: "Mes commandes", url: publicUrl("/account/orders") },
    ],
    footerNote: "Si vous pensez qu'il s'agit d'une erreur, contactez le support Kin-Sell.",
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}

/* ── 3. Remboursement ─────────────────────────────────────────────────── */
export function renderPaymentRefunded(ctx: PaymentEmailContext): RenderedEmail {
  const title = "Remboursement effectué";
  const intro = ctx.reason
    ? `Un remboursement a été effectué sur votre paiement. Motif : ${ctx.reason}.`
    : "Un remboursement a été effectué sur votre paiement.";

  const html = renderEmailLayout({
    preheader: title,
    title,
    greeting: ctx.recipientName ? `Bonjour ${ctx.recipientName},` : undefined,
    intro,
    rows: rows(ctx),
    buttons: [{ label: "Voir mes paiements", url: publicUrl("/account/wallet") }],
    footerNote: "Le délai d'apparition sur votre compte dépend de votre opérateur (jusqu'à 7 jours).",
  });

  return { subject: title, html, text: `${title}\n\n${intro}` };
}
