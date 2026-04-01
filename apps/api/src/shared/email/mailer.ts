import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

const transporter =
  env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

export interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendMail = async (options: MailOptions): Promise<boolean> => {
  if (!transporter) {
    logger.warn({ to: options.to, subject: options.subject }, "[Mail] SMTP non configuré — email non envoyé");
    return false;
  }

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    logger.info({ to: options.to, subject: options.subject }, "[Mail] Email envoyé");
    return true;
  } catch (error) {
    logger.error({ error, to: options.to }, "[Mail] Erreur envoi email");
    return false;
  }
};

export const sendOtpEmail = async (to: string, code: string): Promise<boolean> => {
  return sendMail({
    to,
    subject: `Kin-Sell — Votre code de vérification : ${code}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#120b2b;color:#fff;border-radius:12px;">
        <h2 style="color:#6f58ff;margin:0 0 16px;">Kin-Sell</h2>
        <p>Votre code de vérification :</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#6f58ff;background:rgba(111,88,255,0.1);padding:16px;border-radius:8px;text-align:center;margin:16px 0;">
          ${code}
        </div>
        <p style="font-size:13px;color:#999;">Ce code expire dans ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes. Ne le partagez avec personne.</p>
        <hr style="border:none;border-top:1px solid #333;margin:20px 0;">
        <p style="font-size:12px;color:#666;">Si vous n'avez pas demandé ce code, ignorez ce message.</p>
      </div>
    `,
    text: `Votre code de vérification Kin-Sell : ${code}\nCe code expire dans ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes.`,
  });
};

export const sendWelcomeEmail = async (to: string, displayName: string): Promise<boolean> => {
  return sendMail({
    to,
    subject: "Bienvenue sur Kin-Sell !",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#120b2b;color:#fff;border-radius:12px;">
        <h2 style="color:#6f58ff;margin:0 0 16px;">Bienvenue sur Kin-Sell !</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Votre compte a bien été créé. Vous pouvez dès maintenant explorer, vendre et acheter sur la première marketplace de Kinshasa.</p>
        <a href="https://kin-sell.com" style="display:inline-block;background:#6f58ff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Accéder à Kin-Sell</a>
        <hr style="border:none;border-top:1px solid #333;margin:20px 0;">
        <p style="font-size:12px;color:#666;">L'équipe Kin-Sell</p>
      </div>
    `,
    text: `Bienvenue sur Kin-Sell, ${displayName} ! Votre compte a été créé. Rendez-vous sur https://kin-sell.com`,
  });
};
