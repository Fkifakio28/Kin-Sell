/**
 * Service unifié Mobile Money — Orange Money + M-Pesa
 * Orchestre les providers, crée les enregistrements MobileMoneyPayment, gère les callbacks.
 */

import { MomoStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import * as orangeMoney from "../../shared/payment/orange-money.provider.js";
import * as mpesa from "../../shared/payment/mpesa.provider.js";
import { sendPushToUser } from "../notifications/push.service.js";

const PAYMENT_TTL_MINUTES = 30;

type InitiateInput = {
  provider: "ORANGE_MONEY" | "MPESA";
  phoneNumber: string;
  amountCDF: number;
  /** Devise locale du paiement (défaut CDF pour RDC). */
  currency?: string;
  // SÉCURITÉ : seul ORDER est autorisé via Mobile Money.
  // SUBSCRIPTION et AD_PAYMENT passent obligatoirement par PayPal.
  purpose: "ORDER";
  targetId?: string;
};

/**
 * Initier un paiement Mobile Money.
 */
export async function initiatePayment(userId: string, input: InitiateInput) {
  const { provider, phoneNumber, amountCDF, currency = "CDF", purpose, targetId } = input;

  if (amountCDF <= 0) throw new HttpError(400, "Le montant doit être supérieur à 0");

  const expiresAt = new Date(Date.now() + PAYMENT_TTL_MINUTES * 60 * 1000);

  // Créer l'enregistrement en base
  const record = await prisma.mobileMoneyPayment.create({
    data: {
      userId,
      provider: provider as PaymentMethod,
      phoneNumber,
      amountCents: amountCDF * 100,
      currency,
      amountLocalUnits: amountCDF,
      status: MomoStatus.INITIATED,
      purpose,
      targetId: targetId ?? null,
      expiresAt,
    },
  });

  try {
    if (provider === "ORANGE_MONEY") {
      const result = await orangeMoney.initiatePayment(record.id, amountCDF);

      await prisma.mobileMoneyPayment.update({
        where: { id: record.id },
        data: {
          providerRef: result.payToken,
          status: MomoStatus.PENDING,
        },
      });

      return {
        paymentId: record.id,
        provider: "ORANGE_MONEY",
        status: "PENDING",
        redirectUrl: result.paymentUrl,
        payToken: result.payToken,
        expiresAt: expiresAt.toISOString(),
      };
    }

    if (provider === "MPESA") {
      const result = await mpesa.initiateC2BPayment(
        phoneNumber,
        amountCDF,
        record.id,
        `Kin-Sell ${purpose}`
      );

      await prisma.mobileMoneyPayment.update({
        where: { id: record.id },
        data: {
          providerRef: result.thirdPartyConversationID,
          providerTransactionId: result.transactionID,
          status: MomoStatus.PENDING,
        },
      });

      return {
        paymentId: record.id,
        provider: "MPESA",
        status: "PENDING",
        conversationID: result.conversationID,
        transactionID: result.transactionID,
        message: "Un push USSD a été envoyé sur votre téléphone. Veuillez valider le paiement.",
        expiresAt: expiresAt.toISOString(),
      };
    }

    throw new HttpError(400, "Provider non supporté");
  } catch (err) {
    // Enregistrer l'échec
    await prisma.mobileMoneyPayment.update({
      where: { id: record.id },
      data: {
        status: MomoStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : "Erreur inconnue",
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

/**
 * Vérifier le statut d'un paiement.
 */
export async function checkStatus(userId: string, paymentId: string) {
  const record = await prisma.mobileMoneyPayment.findUnique({
    where: { id: paymentId },
  });

  if (!record) throw new HttpError(404, "Paiement introuvable");
  if (record.userId !== userId) throw new HttpError(403, "Accès refusé");

  // Si déjà terminé, retourner directement
  if (["SUCCESS", "FAILED", "EXPIRED", "CANCELED"].includes(record.status)) {
    return formatPaymentResponse(record);
  }

  // Interroger le provider pour un statut frais
  if (!record.providerRef) {
    return formatPaymentResponse(record);
  }

  let providerStatus: { status: string; transactionId?: string; message?: string };

  if (record.provider === PaymentMethod.ORANGE_MONEY) {
    providerStatus = await orangeMoney.checkPaymentStatus(record.providerRef);
  } else if (record.provider === PaymentMethod.MPESA) {
    providerStatus = await mpesa.checkTransactionStatus(record.providerRef);
  } else {
    return formatPaymentResponse(record);
  }

  // Mettre à jour si le statut a changé
  const newStatus = mapProviderStatus(providerStatus.status);
  if (newStatus !== record.status) {
    const updated = await prisma.mobileMoneyPayment.update({
      where: { id: record.id },
      data: {
        status: newStatus,
        providerTransactionId: providerStatus.transactionId ?? record.providerTransactionId,
        completedAt: ["SUCCESS", "FAILED", "EXPIRED"].includes(newStatus) ? new Date() : undefined,
      },
    });

    // Si succès, finaliser la commande / abonnement relié
    if (newStatus === MomoStatus.SUCCESS) {
      await handlePaymentSuccess(updated);
    }

    return formatPaymentResponse(updated);
  }

  return formatPaymentResponse(record);
}

/**
 * Traiter un callback webhook Orange Money.
 */
export async function handleOrangeWebhook(body: { pay_token?: string; status?: string; txnid?: string; [key: string]: unknown }) {
  const payToken = body.pay_token;
  if (!payToken) return { received: true };

  const record = await prisma.mobileMoneyPayment.findFirst({
    where: { providerRef: payToken },
  });

  if (!record) return { received: true, matched: false };

  const newStatus = mapProviderStatus(body.status ?? "FAILED");

  const updated = await prisma.mobileMoneyPayment.update({
    where: { id: record.id },
    data: {
      status: newStatus,
      providerTransactionId: (body.txnid as string) ?? record.providerTransactionId,
      callbackPayload: body as object,
      completedAt: ["SUCCESS", "FAILED", "EXPIRED"].includes(newStatus) ? new Date() : undefined,
    },
  });

  if (newStatus === MomoStatus.SUCCESS) {
    await handlePaymentSuccess(updated);
  }

  return { received: true, matched: true, status: newStatus };
}

/**
 * Traiter un callback webhook M-Pesa.
 */
export async function handleMpesaWebhook(body: {
  output_ConversationID?: string;
  output_TransactionID?: string;
  output_ThirdPartyConversationID?: string;
  output_ResponseCode?: string;
  output_ResponseDesc?: string;
  [key: string]: unknown;
}) {
  const conversationID = body.output_ThirdPartyConversationID;
  if (!conversationID) return { received: true };

  const record = await prisma.mobileMoneyPayment.findFirst({
    where: { providerRef: conversationID },
  });

  if (!record) return { received: true, matched: false };

  const isSuccess = body.output_ResponseCode === "INS-0";
  const newStatus = isSuccess ? MomoStatus.SUCCESS : MomoStatus.FAILED;

  const updated = await prisma.mobileMoneyPayment.update({
    where: { id: record.id },
    data: {
      status: newStatus,
      providerTransactionId: (body.output_TransactionID as string) ?? record.providerTransactionId,
      callbackPayload: body as object,
      completedAt: new Date(),
      errorMessage: isSuccess ? undefined : body.output_ResponseDesc ?? undefined,
    },
  });

  if (isSuccess) {
    await handlePaymentSuccess(updated);
  }

  return { received: true, matched: true, status: newStatus };
}

/**
 * Historique des paiements Mobile Money d'un utilisateur.
 */
export async function listUserPayments(userId: string, page = 1, limit = 20) {
  const [payments, total] = await Promise.all([
    prisma.mobileMoneyPayment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.mobileMoneyPayment.count({ where: { userId } }),
  ]);

  return {
    payments: payments.map(formatPaymentResponse),
    total,
    page,
    limit,
  };
}

// ─── Helpers ────────────────────────────────────────────

function mapProviderStatus(status: string): MomoStatus {
  const map: Record<string, MomoStatus> = {
    INITIATED: MomoStatus.INITIATED,
    PENDING: MomoStatus.PENDING,
    SUCCESS: MomoStatus.SUCCESS,
    FAILED: MomoStatus.FAILED,
    EXPIRED: MomoStatus.EXPIRED,
    CANCELED: MomoStatus.CANCELED,
  };
  return map[status] ?? MomoStatus.FAILED;
}

function formatPaymentResponse(record: {
  id: string;
  provider: PaymentMethod;
  phoneNumber: string;
  amountLocalUnits: number;
  currency: string;
  status: MomoStatus;
  purpose: string;
  targetId: string | null;
  providerTransactionId: string | null;
  errorMessage: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}) {
  return {
    id: record.id,
    provider: record.provider,
    phoneNumber: record.phoneNumber,
    amount: record.amountLocalUnits,
    currency: record.currency,
    status: record.status,
    purpose: record.purpose,
    targetId: record.targetId,
    transactionId: record.providerTransactionId,
    error: record.errorMessage,
    initiatedAt: record.initiatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt.toISOString(),
  };
}

/**
 * Actions post-paiement réussi selon le purpose.
 */
async function handlePaymentSuccess(record: {
  id: string;
  userId: string;
  purpose: string;
  targetId: string | null;
}) {
  // SÉCURITÉ : seul le purpose ORDER est traité.
  // Les abonnements et publicités passent obligatoirement par PayPal.
  // Bloc SUBSCRIPTION et AD_PAYMENT supprimés pour empêcher toute activation
  // via webhook non authentifié.

  if (record.purpose === "ORDER" && record.targetId) {
    // Vérifier que la commande appartient bien à l'utilisateur (buyer)
    const order = await prisma.order.findFirst({
      where: { id: record.targetId, buyerUserId: record.userId, status: "PENDING" },
    });
    if (!order) return;

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });

    // Notifier l'acheteur (paiement confirmé)
    sendPushToUser(record.userId, {
      title: "Kin-Sell • Paiement confirmé ✅",
      body: "Votre paiement Mobile Money a été accepté.",
      tag: `momo-${record.id}`,
      data: { type: "order", orderId: order.id, url: "/account?tab=commandes" },
    }).catch(() => {});

    // Notifier le vendeur (nouvelle commande)
    if (order.sellerUserId && order.sellerUserId !== record.userId) {
      sendPushToUser(order.sellerUserId, {
        title: "Kin-Sell • 🛒 Commande",
        body: "Nouvelle commande confirmée par paiement Mobile Money !",
        tag: `order-momo-${order.id}`,
        data: { type: "order", orderId: order.id, url: "/account?tab=commandes" },
      }).catch(() => {});
    }
  }
}
