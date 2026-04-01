/**
 * Orange Money Web Payment Provider — RD Congo
 *
 * API: https://developer.orange.com/apis/om-webpay
 * Flux: 
 *   1. Obtenir un access token OAuth2
 *   2. Initier un paiement web (POST /webpayment) → payToken + paymentUrl
 *   3. Rediriger l'utilisateur vers paymentUrl
 *   4. L'utilisateur génère un OTP via USSD et valide
 *   5. Callback notifUrl → confirmer le paiement
 *   6. Vérifier le statut via GET /webpayment/{payToken}
 */

import { env } from "../../config/env.js";

export interface OrangeMoneyInitResult {
  payToken: string;
  paymentUrl: string;
  notifToken: string;
}

export interface OrangeMoneyStatusResult {
  status: "INITIATED" | "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";
  transactionId?: string;
  message?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const clientId = env.ORANGE_MONEY_CLIENT_ID;
  const clientSecret = env.ORANGE_MONEY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Orange Money credentials not configured");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Orange Money OAuth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

/**
 * Initier un paiement Orange Money.
 * @param orderId Identifiant commande unique
 * @param amountCDF Montant en Francs Congolais (unités entières, pas de centimes)
 */
export async function initiatePayment(
  orderId: string,
  amountCDF: number
): Promise<OrangeMoneyInitResult> {
  const token = await getAccessToken();
  const merchantKey = env.ORANGE_MONEY_MERCHANT_KEY;
  if (!merchantKey) throw new Error("ORANGE_MONEY_MERCHANT_KEY not set");

  const res = await fetch(`${env.ORANGE_MONEY_BASE_URL}/webpayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchant_key: merchantKey,
      currency: "OUV", // Orange Money currency code for DRC (Unités de Valeur)
      order_id: orderId,
      amount: amountCDF,
      return_url: env.ORANGE_MONEY_RETURN_URL,
      cancel_url: env.ORANGE_MONEY_CANCEL_URL,
      notif_url: env.ORANGE_MONEY_NOTIF_URL,
      lang: "fr",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Orange Money init failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    status: number;
    message: string;
    pay_token: string;
    payment_url: string;
    notif_token: string;
  };

  if (data.status !== 201) {
    throw new Error(`Orange Money init error: ${data.message}`);
  }

  return {
    payToken: data.pay_token,
    paymentUrl: data.payment_url,
    notifToken: data.notif_token,
  };
}

/**
 * Vérifier le statut d'un paiement Orange Money.
 */
export async function checkPaymentStatus(payToken: string): Promise<OrangeMoneyStatusResult> {
  const token = await getAccessToken();

  const res = await fetch(`${env.ORANGE_MONEY_BASE_URL}/webpayment/${payToken}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return { status: "FAILED", message: `HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    status: string;
    txnid?: string;
    message?: string;
  };

  const statusMap: Record<string, OrangeMoneyStatusResult["status"]> = {
    INITIATED: "INITIATED",
    PENDING: "PENDING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
  };

  return {
    status: statusMap[data.status] ?? "FAILED",
    transactionId: data.txnid,
    message: data.message,
  };
}
