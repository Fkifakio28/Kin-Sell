/**
 * Layout email partagé Kin-Sell — palette glassmorphism violet (#6f58ff / #120b2b)
 * Utilisé par tous les emails transactionnels (commandes, négociations, paiements).
 *
 * Compatible clients mail majeurs (inline-styles, table-based safe pour Outlook).
 */

export interface EmailButton {
  label: string;
  url: string;
  variant?: "primary" | "secondary";
}

export interface EmailRow {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface EmailLayoutOptions {
  preheader?: string; // texte caché en preview (Gmail / Apple Mail)
  title: string;
  intro?: string;
  greeting?: string; // ex: "Bonjour Jean,"
  rows?: EmailRow[]; // tableau récapitulatif (clé/valeur)
  body?: string; // paragraphe libre (HTML autorisé)
  buttons?: EmailButton[];
  footerNote?: string;
}

const COLORS = {
  bg: "#0b0720",
  card: "#120b2b",
  cardBorder: "#2a1f4a",
  primary: "#6f58ff",
  primarySoft: "rgba(111,88,255,0.12)",
  text: "#ffffff",
  textSoft: "#cfc8e8",
  textMuted: "#8a82a8",
  success: "#1fbf75",
  danger: "#ef4444",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderButton(btn: EmailButton): string {
  const isPrimary = (btn.variant ?? "primary") === "primary";
  const bg = isPrimary ? COLORS.primary : "transparent";
  const color = isPrimary ? "#ffffff" : COLORS.primary;
  const border = isPrimary ? "none" : `1px solid ${COLORS.primary}`;
  return `
    <a href="${btn.url}" style="display:inline-block;background:${bg};color:${color};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;border:${border};margin:6px 6px 6px 0;">
      ${escapeHtml(btn.label)}
    </a>
  `;
}

function renderRow(row: EmailRow): string {
  const valueColor = row.highlight ? COLORS.primary : COLORS.text;
  const fontWeight = row.highlight ? 700 : 500;
  return `
    <tr>
      <td style="padding:8px 0;color:${COLORS.textMuted};font-size:13px;">${escapeHtml(row.label)}</td>
      <td style="padding:8px 0;color:${valueColor};font-size:14px;font-weight:${fontWeight};text-align:right;">${row.value}</td>
    </tr>
  `;
}

/**
 * Génère le HTML complet d'un email transactionnel Kin-Sell.
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const { preheader, title, intro, greeting, rows, body, buttons, footerNote } = opts;

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.bg};opacity:0;">${escapeHtml(preheader)}</div>`
    : "";

  const greetingHtml = greeting
    ? `<p style="margin:0 0 12px;color:${COLORS.textSoft};font-size:15px;">${escapeHtml(greeting)}</p>`
    : "";

  const introHtml = intro
    ? `<p style="margin:0 0 16px;color:${COLORS.textSoft};font-size:15px;line-height:1.6;">${intro}</p>`
    : "";

  const rowsHtml = rows && rows.length
    ? `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.primarySoft};border:1px solid ${COLORS.cardBorder};border-radius:10px;padding:16px;margin:18px 0;">
        ${rows.map(renderRow).join("")}
      </table>
    `
    : "";

  const bodyHtml = body
    ? `<div style="margin:14px 0;color:${COLORS.textSoft};font-size:14px;line-height:1.6;">${body}</div>`
    : "";

  const buttonsHtml = buttons && buttons.length
    ? `<div style="margin:20px 0 8px;">${buttons.map(renderButton).join("")}</div>`
    : "";

  const footerNoteHtml = footerNote
    ? `<p style="margin:14px 0 0;color:${COLORS.textMuted};font-size:12px;line-height:1.5;">${footerNote}</p>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  ${preheaderHtml}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:16px;padding:28px;">
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
                <span style="display:inline-block;width:32px;height:32px;background:${COLORS.primary};border-radius:8px;text-align:center;line-height:32px;color:#fff;font-weight:700;">K</span>
                <span style="color:${COLORS.text};font-size:18px;font-weight:700;letter-spacing:0.3px;">Kin-Sell</span>
              </div>
              <h1 style="margin:0 0 12px;color:${COLORS.text};font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(title)}</h1>
              ${greetingHtml}
              ${introHtml}
              ${rowsHtml}
              ${bodyHtml}
              ${buttonsHtml}
              <hr style="border:none;border-top:1px solid ${COLORS.cardBorder};margin:24px 0 16px;">
              ${footerNoteHtml}
              <p style="margin:14px 0 0;color:${COLORS.textMuted};font-size:11px;line-height:1.5;">
                Vous recevez cet email car votre compte Kin-Sell est concerné par cette transaction.
                Gérez vos préférences de notification dans <a href="https://kin-sell.com/settings/notifications" style="color:${COLORS.primary};text-decoration:none;">vos paramètres</a>.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:${COLORS.textMuted};font-size:11px;margin:14px 0 0;">© Kin-Sell — Kinshasa, RDC</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Helpers utilitaires partagés ─────────────────────────────────────── */

export function formatUsdCents(cents: number): string {
  const usd = cents / 100;
  return `${usd.toFixed(2)} USD`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function publicUrl(path: string): string {
  const base = process.env.PUBLIC_WEB_URL ?? "https://kin-sell.com";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export { COLORS as EMAIL_COLORS };
