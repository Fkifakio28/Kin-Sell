import { env } from "../../config/env.js";
import { logger } from "../logger.js";

const AT_SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging";
const AT_PRODUCTION_URL = "https://api.africastalking.com/version1/messaging";
const BEEM_SMS_URL = "https://apisms.beem.africa/v1/send";

export const isSmsConfigured = (): boolean => {
  if (env.SMS_PROVIDER === "africastalking") {
    return Boolean(env.AT_USERNAME && env.AT_API_KEY);
  }
  if (env.SMS_PROVIDER === "beem") {
    return Boolean(env.BEEM_API_KEY && env.BEEM_SECRET_KEY && env.BEEM_SENDER_ID);
  }
  return false;
};

const sendOtpSmsAfricasTalking = async (phone: string, code: string): Promise<boolean> => {
  if (!env.AT_USERNAME || !env.AT_API_KEY) {
    logger.warn({ phone }, "[SMS] Africa's Talking non configuré (AT_USERNAME/AT_API_KEY)");
    return false;
  }

  const endpoint = env.AT_SANDBOX ? AT_SANDBOX_URL : AT_PRODUCTION_URL;
  const message = `Kin-Sell : votre code de vérification est ${code}. Il expire dans ${Math.round(env.OTP_TTL_SECONDS / 60)} min. Ne le partagez avec personne.`;

  const params = new URLSearchParams();
  params.set("username", env.AT_USERNAME);
  params.set("to", phone);
  params.set("message", message);
  if (env.AT_SENDER_ID) {
    params.set("from", env.AT_SENDER_ID);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "apiKey": env.AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error({ status: response.status, body, phone }, "[SMS] Africa's Talking HTTP error");
      return false;
    }

    const data = (await response.json().catch(() => null)) as
      | { SMSMessageData?: { Recipients?: Array<{ status?: string; statusCode?: number }> } }
      | null;

    const recipients = data?.SMSMessageData?.Recipients ?? [];
    const ok = recipients.length > 0 && recipients.every((r) => {
      // statusCode 100-102 = Success ; status "Success" couvre les variantes
      const status = (r.status ?? "").toLowerCase();
      const code = r.statusCode ?? 0;
      return status === "success" || (code >= 100 && code <= 102);
    });

    if (!ok) {
      logger.error({ recipients, phone }, "[SMS] Africa's Talking envoi rejeté");
      return false;
    }

    logger.info({ phone, sandbox: env.AT_SANDBOX }, "[SMS] OTP envoyé via Africa's Talking");
    return true;
  } catch (error) {
    logger.error({ error, phone }, "[SMS] Africa's Talking exception");
    return false;
  }
};

const sendOtpSmsBeem = async (phone: string, code: string): Promise<boolean> => {
  if (!env.BEEM_API_KEY || !env.BEEM_SECRET_KEY || !env.BEEM_SENDER_ID) {
    logger.warn({ phone }, "[SMS] Beem non configuré (BEEM_API_KEY/BEEM_SECRET_KEY/BEEM_SENDER_ID)");
    return false;
  }

  // Beem attend des numéros sans le "+" initial (ex: 243xxxxxxxxx)
  const destAddr = phone.startsWith("+") ? phone.slice(1) : phone;
  const message = `Kin-Sell : votre code de vérification est ${code}. Il expire dans ${Math.round(env.OTP_TTL_SECONDS / 60)} min. Ne le partagez avec personne.`;

  const authHeader = "Basic " + Buffer.from(`${env.BEEM_API_KEY}:${env.BEEM_SECRET_KEY}`).toString("base64");

  const body = {
    source_addr: env.BEEM_SENDER_ID,
    encoding: 0,
    schedule_time: "",
    message,
    recipients: [{ recipient_id: 1, dest_addr: destAddr }],
  };

  try {
    const response = await fetch(BEEM_SMS_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      logger.error({ status: response.status, body: errBody, phone }, "[SMS] Beem HTTP error");
      return false;
    }

    const data = (await response.json().catch(() => null)) as
      | { successful?: boolean; code?: number; message?: string; request_id?: number; valid?: number; invalid?: number; duplicates?: number }
      | null;

    // Beem renvoie typiquement { successful: true, request_id: ..., code: 100, valid: 1, invalid: 0, ... }
    const ok = Boolean(data && (data.successful === true || data.code === 100));
    if (!ok) {
      logger.error({ data, phone }, "[SMS] Beem envoi rejeté");
      return false;
    }

    logger.info({ phone, requestId: data?.request_id }, "[SMS] OTP envoyé via Beem");
    return true;
  } catch (error) {
    logger.error({ error, phone }, "[SMS] Beem exception");
    return false;
  }
};

export const sendOtpSms = async (phone: string, code: string): Promise<boolean> => {
  if (env.SMS_PROVIDER === "africastalking") {
    return sendOtpSmsAfricasTalking(phone, code);
  }
  if (env.SMS_PROVIDER === "beem") {
    return sendOtpSmsBeem(phone, code);
  }
  logger.warn({ phone, provider: env.SMS_PROVIDER }, "[SMS] Aucun provider SMS configuré — SMS non envoyé");
  return false;
};
