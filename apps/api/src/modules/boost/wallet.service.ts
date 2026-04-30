/**
 * Wallet Service — Débit/Crédit/Refund atomique
 * Utilisé par le système de boost pour facturer réellement les campagnes.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logger.js";

export interface WalletSnapshot {
  id: string;
  userId: string;
  balanceUsdCents: number;
  totalCreditCents: number;
  totalDebitCents: number;
  currency: string;
}

/** Récupère ou crée le wallet d'un utilisateur (atomic). */
export async function ensureWallet(userId: string): Promise<WalletSnapshot> {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    return {
      id: existing.id,
      userId: existing.userId,
      balanceUsdCents: existing.balanceUsdCents,
      totalCreditCents: existing.totalCreditCents,
      totalDebitCents: existing.totalDebitCents,
      currency: existing.currency,
    };
  }
  const created = await prisma.wallet.create({ data: { userId } });
  return {
    id: created.id,
    userId: created.userId,
    balanceUsdCents: created.balanceUsdCents,
    totalCreditCents: created.totalCreditCents,
    totalDebitCents: created.totalDebitCents,
    currency: created.currency,
  };
}

export async function getWalletSnapshot(userId: string): Promise<WalletSnapshot> {
  return ensureWallet(userId);
}

interface DebitParams {
  userId: string;
  amountUsdCents: number;
  campaignId?: string;
  description?: string;
  reference?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Débite un wallet de manière atomique.
 * Lance HttpError(402) si solde insuffisant.
 */
export async function debitWallet(params: DebitParams): Promise<WalletSnapshot> {
  if (params.amountUsdCents <= 0) {
    throw new HttpError(400, "Montant invalide");
  }
  return prisma.$transaction(async (tx) => {
    // Upsert wallet dans la transaction pour garantir l'existence
    const wallet = await tx.wallet.upsert({
      where: { userId: params.userId },
      update: {},
      create: { userId: params.userId },
    });
    if (wallet.balanceUsdCents < params.amountUsdCents) {
      throw new HttpError(402, "Solde du wallet insuffisant. Rechargez votre wallet.");
    }
    const newBalance = wallet.balanceUsdCents - params.amountUsdCents;
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUsdCents: newBalance,
        totalDebitCents: { increment: params.amountUsdCents },
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: params.userId,
        type: "DEBIT",
        amountUsdCents: -params.amountUsdCents,
        balanceAfter: newBalance,
        campaignId: params.campaignId,
        description: params.description,
        reference: params.reference,
        metadata: params.metadata,
      },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      balanceUsdCents: updated.balanceUsdCents,
      totalCreditCents: updated.totalCreditCents,
      totalDebitCents: updated.totalDebitCents,
      currency: updated.currency,
    };
  });
}

interface CreditParams {
  userId: string;
  amountUsdCents: number;
  type?: "CREDIT" | "REFUND" | "ADJUSTMENT";
  campaignId?: string;
  description?: string;
  reference?: string;
  createdBy?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Crédite un wallet (ajout de fonds, remboursement, ajustement admin).
 */
export async function creditWallet(params: CreditParams): Promise<WalletSnapshot> {
  if (params.amountUsdCents <= 0) {
    throw new HttpError(400, "Montant invalide");
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId: params.userId },
      update: {},
      create: { userId: params.userId },
    });
    const newBalance = wallet.balanceUsdCents + params.amountUsdCents;
    const type = params.type ?? "CREDIT";
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUsdCents: newBalance,
        totalCreditCents: { increment: params.amountUsdCents },
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: params.userId,
        type,
        amountUsdCents: params.amountUsdCents,
        balanceAfter: newBalance,
        campaignId: params.campaignId,
        description: params.description,
        reference: params.reference,
        createdBy: params.createdBy,
        metadata: params.metadata,
      },
    });
    logger.info(
      { userId: params.userId, amountUsdCents: params.amountUsdCents, type, campaignId: params.campaignId },
      "[Wallet] Credit",
    );
    return {
      id: updated.id,
      userId: updated.userId,
      balanceUsdCents: updated.balanceUsdCents,
      totalCreditCents: updated.totalCreditCents,
      totalDebitCents: updated.totalDebitCents,
      currency: updated.currency,
    };
  });
}

/**
 * Liste les transactions d'un wallet (pagination simple).
 */
export async function listTransactions(
  userId: string,
  limit = 50,
  cursor?: string,
) {
  const wallet = await ensureWallet(userId);
  const items = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
  return {
    wallet,
    items,
    nextCursor: items.length > 0 ? items[items.length - 1].id : null,
  };
}
