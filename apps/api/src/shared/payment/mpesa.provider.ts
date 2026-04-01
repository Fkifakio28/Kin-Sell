/**
 * M-Pesa Open API Provider — Vodacom RD Congo
 *
 * API: https://openapiportal.m-pesa.com
 * Flux C2B (Customer to Business):
 *   1. Créer une session (GET /getSession) → sessionKey
 *   2. Initier un paiement C2B (POST /c2bPayment/singleStage/) 
 *      → le client reçoit un push USSD sur son téléphone pour valider
 *   3. Callback ou query pour confirmer
 */

import { env } from "../../config/env.js";
import crypto from "crypto";

export interface MpesaInitResult {
  conversationID: string;
  transactionID: string;
  thirdPartyConversationID: string;
}

export interface MpesaStatusResult {
  status: "INITIATED" | "PENDING" | "SUCCESS" | "FAILED";
  transactionId?: string;
  message?: string;
}

/**
 * Chiffrer l'API key avec la clé publique M-Pesa pour obtenir un Bearer token.
 */
function encryptApiKey(): string {
  const apiKey = env.MPESA_API_KEY;
  const publicKey = env.MPESA_PUBLIC_KEY;
  if (!apiKey || !publicKey) throw new Error("M-Pesa credentials not configured");

  const buffer = Buffer.from(apiKey);
  const encrypted = crypto.publicEncrypt(
    {
      key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return encrypted.toString("base64");
}

/**
 * Obtenir une sessionKey via l'API de session M-Pesa.
 */
async function getSessionKey(): Promise<string> {
  const bearer = encryptApiKey();

  const res = await fetch(`${env.MPESA_BASE_URL}/getSession/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      Origin: "*",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`M-Pesa session failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    output_ResponseCode: string;
    output_ResponseDesc: string;
    output_SessionID: string;
  };

  if (data.output_ResponseCode !== "INS-0") {
    throw new Error(`M-Pesa session error: ${data.output_ResponseDesc}`);
  }

  return data.output_SessionID;
}

/**
 * Générer un Bearer token à partir de la sessionKey.
 */
function generateBearerFromSession(sessionKey: string): string {
  const publicKey = env.MPESA_PUBLIC_KEY;
  if (!publicKey) throw new Error("MPESA_PUBLIC_KEY not set");

  const buffer = Buffer.from(sessionKey);
  const encrypted = crypto.publicEncrypt(
    {
      key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer
  );
  return encrypted.toString("base64");
}

/**
 * Initier un paiement C2B M-Pesa (push vers le téléphone du client).
 * @param customerMSISDN Numéro du client (format: 243XXXXXXXXX)
 * @param amountCDF Montant en Francs Congolais
 * @param reference Référence de la transaction (orderId)
 * @param description Description de l'achat
 */
export async function initiateC2BPayment(
  customerMSISDN: string,
  amountCDF: number,
  reference: string,
  description: string
): Promise<MpesaInitResult> {
  const sessionKey = await getSessionKey();
  const bearer = generateBearerFromSession(sessionKey);
  const serviceProviderCode = env.MPESA_SERVICE_PROVIDER_CODE;
  if (!serviceProviderCode) throw new Error("MPESA_SERVICE_PROVIDER_CODE not set");

  const thirdPartyConversationID = `KS-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  const res = await fetch(`${env.MPESA_BASE_URL}/c2bPayment/singleStage/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      Origin: "*",
    },
    body: JSON.stringify({
      input_Amount: String(amountCDF),
      input_Country: "DRC",
      input_Currency: "CDF",
      input_CustomerMSISDN: customerMSISDN,
      input_ServiceProviderCode: serviceProviderCode,
      input_ThirdPartyConversationID: thirdPartyConversationID,
      input_TransactionReference: reference,
      input_PurchasedItemsDesc: description,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`M-Pesa C2B failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    output_ResponseCode: string;
    output_ResponseDesc: string;
    output_ConversationID: string;
    output_TransactionID: string;
    output_ThirdPartyConversationID: string;
  };

  if (data.output_ResponseCode !== "INS-0") {
    throw new Error(`M-Pesa C2B error: ${data.output_ResponseDesc}`);
  }

  return {
    conversationID: data.output_ConversationID,
    transactionID: data.output_TransactionID,
    thirdPartyConversationID: data.output_ThirdPartyConversationID,
  };
}

/**
 * Vérifier le statut d'une transaction M-Pesa.
 */
export async function checkTransactionStatus(
  thirdPartyConversationID: string
): Promise<MpesaStatusResult> {
  const sessionKey = await getSessionKey();
  const bearer = generateBearerFromSession(sessionKey);
  const serviceProviderCode = env.MPESA_SERVICE_PROVIDER_CODE;
  if (!serviceProviderCode) throw new Error("MPESA_SERVICE_PROVIDER_CODE not set");

  const queryID = `QR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  const res = await fetch(`${env.MPESA_BASE_URL}/queryTransactionStatus/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      Origin: "*",
    },
    body: JSON.stringify({
      input_QueryReference: thirdPartyConversationID,
      input_ServiceProviderCode: serviceProviderCode,
      input_ThirdPartyConversationID: queryID,
      input_Country: "DRC",
    }),
  });

  if (!res.ok) {
    return { status: "FAILED", message: `HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    output_ResponseCode: string;
    output_ResponseDesc: string;
    output_ConversationID?: string;
    output_TransactionID?: string;
  };

  if (data.output_ResponseCode === "INS-0") {
    return {
      status: "SUCCESS",
      transactionId: data.output_TransactionID,
      message: data.output_ResponseDesc,
    };
  }

  if (data.output_ResponseCode === "INS-9") {
    return { status: "PENDING", message: "Transaction en cours de traitement" };
  }

  return {
    status: "FAILED",
    message: data.output_ResponseDesc,
  };
}
