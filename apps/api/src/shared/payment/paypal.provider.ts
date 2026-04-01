/**
 * PayPal REST API v2 provider (Orders).
 * Supports Live + Sandbox. Uses OAuth2 (Client ID + Secret).
 *
 * Flow:
 * 1. createOrder() → PayPal approval URL + paypalOrderId
 * 2. User pays on PayPal
 * 3. captureOrder() → finalizes payment
 * 4. (Fallback) IPN webhook
 */

import { env } from "../../config/env.js";

const PAYPAL_BASE =
  env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal API credentials non configurées (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal OAuth2 failed: ${resp.status} — ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/**
 * Create a PayPal order (v2). Returns approval link + PayPal order ID.
 */
export async function createOrder(params: {
  internalOrderId: string;
  planCode: string;
  amountUsd: number;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ paypalOrderId: string; approvalUrl: string }> {
  const token = await getAccessToken();

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.internalOrderId,
        description: `Kin-Sell forfait ${params.planCode}`,
        custom_id: params.internalOrderId,
        amount: {
          currency_code: "USD",
          value: params.amountUsd.toFixed(2),
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Kin-Sell",
          locale: "fr-FR",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      },
    },
  };

  const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal createOrder failed: ${resp.status} — ${text}`);
  }

  const order = (await resp.json()) as {
    id: string;
    status: string;
    links: Array<{ href: string; rel: string }>;
  };

  const approvalLink = order.links.find((l) => l.rel === "payer-action")?.href
    ?? order.links.find((l) => l.rel === "approve")?.href;

  if (!approvalLink) {
    throw new Error("PayPal n'a pas retourné de lien d'approbation");
  }

  return { paypalOrderId: order.id, approvalUrl: approvalLink };
}

/**
 * Capture a PayPal order after user approval (finalizes the payment).
 */
export async function captureOrder(paypalOrderId: string): Promise<{
  captured: boolean;
  transactionId: string | null;
  status: string;
  payerEmail: string | null;
}> {
  const token = await getAccessToken();

  const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal captureOrder failed: ${resp.status} — ${text}`);
  }

  const data = (await resp.json()) as {
    id: string;
    status: string;
    purchase_units?: Array<{
      reference_id?: string;
      payments?: { captures?: Array<{ id: string; status: string }> };
    }>;
    payer?: { email_address?: string };
  };

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

  return {
    captured: data.status === "COMPLETED",
    transactionId: capture?.id ?? null,
    status: data.status,
    payerEmail: data.payer?.email_address ?? null,
  };
}

/**
 * Get PayPal order details (status check).
 */
export async function getOrderDetails(paypalOrderId: string) {
  const token = await getAccessToken();

  const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PayPal getOrderDetails failed: ${resp.status} — ${text}`);
  }

  return (await resp.json()) as {
    id: string;
    status: string;
    purchase_units: Array<{ custom_id?: string; reference_id?: string }>;
    payer?: { email_address?: string };
  };
}

/**
 * Verify IPN (legacy fallback).
 */
export async function verifyIPN(rawBody: string): Promise<boolean> {
  const verifyBody = `cmd=_notify-validate&${rawBody}`;
  const resp = await fetch(env.PAYPAL_IPN_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyBody,
  });
  return (await resp.text()).trim() === "VERIFIED";
}

/**
 * Parse IPN data.
 */
export function parseIPNData(body: Record<string, string>) {
  return {
    txnId: body.txn_id ?? "",
    paymentStatus: body.payment_status ?? "",
    receiverEmail: body.receiver_email ?? "",
    payerEmail: body.payer_email ?? "",
    mcGross: body.mc_gross ?? "0",
    mcCurrency: body.mc_currency ?? "USD",
    custom: body.custom ?? "",
    itemName: body.item_name ?? "",
  };
}
