import { AddonCode, AddonStatus, BillingCycle, PaymentMethod, PaymentOrderStatus, Prisma, SubscriptionScope, SubscriptionStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { ADDON_CATALOG, getPlanOrThrow, PLAN_CATALOG } from "./billing.catalog.js";
import * as paypal from "../../shared/payment/paypal.provider.js";
import { clearSubscriptionCache } from "../../shared/billing/subscription-guard.js";

type RoleScope = "USER" | "BUSINESS";

type PlanSummary = {
  id: string | null;
  scope: RoleScope;
  planCode: string;
  planName: string;
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
  priceUsdCents: number;
  status: "ACTIVE" | "CANCELED" | "EXPIRED";
  billingCycle: "MONTHLY" | "ONE_TIME";
  startsAt: string | null;
  endsAt: string | null;
  features: string[];
  addOns: Array<{ code: string; status: string; priceUsdCents: number; startsAt: string; endsAt: string | null }>;
};

const mapCycle = (cycle: "MONTHLY" | "ONE_TIME") => {
  return cycle === "ONE_TIME" ? BillingCycle.ONE_TIME : BillingCycle.MONTHLY;
};

const defaultPlanCodeForScope = (scope: RoleScope) => {
  return scope === "BUSINESS" ? "STARTER" : "FREE";
};

const toRoleScope = (role: string): RoleScope => {
  return role === "BUSINESS" ? "BUSINESS" : "USER";
};

const createTransferReference = () => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `KS-${Date.now().toString(36).toUpperCase()}-${rand}`;
};

async function reconcileBusinessSubscriptionStatus(
  businessId: string | null,
  expectedPlanCode: string | null,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!businessId) return;

  const business = await tx.businessAccount.findUnique({
    where: { id: businessId },
    select: { subscriptionStatus: true },
  });
  if (!business) return;

  const nextStatus = expectedPlanCode ?? "FREE";
  if (business.subscriptionStatus !== nextStatus) {
    await tx.businessAccount.update({
      where: { id: businessId },
      data: { subscriptionStatus: nextStatus },
    });
  }
}

async function replaceActiveSubscriptionInTx(
  tx: Prisma.TransactionClient,
  params: {
    scope: RoleScope;
    userId: string | null;
    businessId: string | null;
    planCode: string;
    billingCycle: BillingCycle;
    priceUsdCents: number;
    autoRenew: boolean;
    metadata: Prisma.JsonObject;
    startsAt?: Date;
    endsAt?: Date | null;
  },
) {
  const targetPlan = getPlanOrThrow(params.planCode, params.scope);
  const startsAt = params.startsAt ?? new Date();

  const current = await tx.subscription.findFirst({
    where: {
      scope: params.scope as SubscriptionScope,
      status: SubscriptionStatus.ACTIVE,
      userId: params.scope === "USER" ? params.userId : null,
      businessId: params.scope === "BUSINESS" ? params.businessId : null,
    },
  });

  if (current) {
    await tx.subscription.update({
      where: { id: current.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        endsAt: startsAt,
        autoRenew: false,
      },
    });
  }

  const created = await tx.subscription.create({
    data: {
      scope: params.scope as SubscriptionScope,
      userId: params.scope === "USER" ? params.userId : null,
      businessId: params.scope === "BUSINESS" ? params.businessId : null,
      planCode: targetPlan.code,
      status: SubscriptionStatus.ACTIVE,
      billingCycle: params.billingCycle,
      priceUsdCents: params.priceUsdCents,
      startsAt,
      endsAt: params.endsAt ?? null,
      autoRenew: params.autoRenew,
      metadata: params.metadata,
    },
  });

  await reconcileBusinessSubscriptionStatus(
    params.scope === "BUSINESS" ? params.businessId : null,
    targetPlan.code,
    tx,
  );

  return { created, targetPlan };
}

const serializePlan = (
  scope: RoleScope,
  subscription: {
    id: string;
    planCode: string;
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    startsAt: Date;
    endsAt: Date | null;
    priceUsdCents: number;
    addons: Array<{
      addonCode: AddonCode;
      status: AddonStatus;
      priceUsdCents: number;
      startsAt: Date;
      endsAt: Date | null;
    }>;
  } | null
): PlanSummary => {
  const fallbackCode = defaultPlanCodeForScope(scope);
  const planCode = subscription?.planCode ?? fallbackCode;
  const plan = getPlanOrThrow(planCode, scope);

  return {
    id: subscription?.id ?? null,
    scope,
    planCode,
    planName: plan.name,
    analyticsTier: plan.analyticsTier,
    priceUsdCents: subscription?.priceUsdCents ?? plan.monthlyPriceUsdCents,
    status: subscription?.status ?? "ACTIVE",
    billingCycle: subscription?.billingCycle ?? "MONTHLY",
    startsAt: subscription?.startsAt?.toISOString() ?? null,
    endsAt: subscription?.endsAt?.toISOString() ?? null,
    features: plan.features,
    addOns: (subscription?.addons ?? [])
      .filter((addon) => addon.status === "ACTIVE" && (addon.endsAt === null || addon.endsAt > new Date()))
      .map((addon) => ({
      code: addon.addonCode,
      status: addon.status,
      priceUsdCents: addon.priceUsdCents,
      startsAt: addon.startsAt.toISOString(),
      endsAt: addon.endsAt?.toISOString() ?? null
    }))
  };
};

async function resolveContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      businesses: {
        select: { id: true, subscriptionStatus: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  const scope = toRoleScope(user.role);
  const businessId = scope === "BUSINESS" ? (user.businesses[0]?.id ?? null) : null;

  if (scope === "BUSINESS" && !businessId) {
    throw new HttpError(400, "Compte entreprise requis pour gérer un abonnement entreprise");
  }

  return { scope, businessId };
}

async function findActiveSubscription(userId: string, scope: RoleScope, businessId: string | null) {
  return prisma.subscription.findFirst({
    where: {
      scope: scope as SubscriptionScope,
      status: SubscriptionStatus.ACTIVE,
      userId: scope === "USER" ? userId : null,
      businessId: scope === "BUSINESS" ? businessId : null,
      OR: [
        { endsAt: null },
        { endsAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      addons: {
        where: { status: AddonStatus.ACTIVE },
        orderBy: { createdAt: "desc" }
      }
    }
  });
}

export const getCatalog = () => {
  return {
    userPlans: PLAN_CATALOG.filter((item) => item.scope === "USER"),
    businessPlans: PLAN_CATALOG.filter((item) => item.scope === "BUSINESS"),
    addOns: ADDON_CATALOG,
    analyticsRule: "Analytics disponible uniquement dans les packs abonnement"
  };
};

export const getMyPlan = async (userId: string) => {
  const { scope, businessId } = await resolveContext(userId);
  const activeSubscription = await findActiveSubscription(userId, scope, businessId);
  await reconcileBusinessSubscriptionStatus(
    scope === "BUSINESS" ? businessId : null,
    activeSubscription?.planCode ?? null,
  );
  return serializePlan(scope, activeSubscription);
};

export const simulateChangeSubscription = async (
  userId: string,
  payload: { planCode: string; billingCycle: "MONTHLY" | "ONE_TIME" }
) => {
  const { scope, businessId } = await resolveContext(userId);
  const targetPlan = getPlanOrThrow(payload.planCode, scope);

  const current = await findActiveSubscription(userId, scope, businessId);

  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.subscription.update({
        where: { id: current.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          endsAt: new Date(),
          autoRenew: false
        }
      });
    }

    await tx.subscription.create({
      data: {
        scope: scope as SubscriptionScope,
        userId: scope === "USER" ? userId : null,
        businessId: scope === "BUSINESS" ? businessId : null,
        planCode: targetPlan.code,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: mapCycle(payload.billingCycle),
        priceUsdCents: targetPlan.monthlyPriceUsdCents,
        startsAt: new Date(),
        autoRenew: payload.billingCycle === "MONTHLY",
        metadata: {
          simulated: true,
          changedAt: new Date().toISOString()
        } as Prisma.JsonObject
      }
    });

    if (scope === "BUSINESS" && businessId) {
      await tx.businessAccount.update({
        where: { id: businessId },
        data: { subscriptionStatus: targetPlan.code }
      });
    }
  });

  const refreshed = await findActiveSubscription(userId, scope, businessId);
  return serializePlan(scope, refreshed);
};

export const simulateAddonChange = async (
  userId: string,
  payload: { addonCode: AddonCode; action: "ENABLE" | "DISABLE"; monthlyPriceUsdCents?: number }
) => {
  const { scope, businessId } = await resolveContext(userId);
  const activeSubscription = await findActiveSubscription(userId, scope, businessId);

  if (!activeSubscription) {
    throw new HttpError(400, "Abonnement actif requis pour gérer les add-ons");
  }

  if (payload.addonCode === AddonCode.IA_MERCHANT && scope === "USER" && activeSubscription.planCode === "FREE") {
    throw new HttpError(400, "IA marchand est déjà incluse gratuitement pour le plan FREE utilisateur");
  }

  const addonMeta = ADDON_CATALOG.find((item) => item.code === payload.addonCode);
  if (!addonMeta) {
    throw new HttpError(400, "Add-on invalide");
  }

  if (payload.action === "DISABLE") {
    await prisma.subscriptionAddon.updateMany({
      where: {
        subscriptionId: activeSubscription.id,
        addonCode: payload.addonCode,
        status: AddonStatus.ACTIVE
      },
      data: {
        status: AddonStatus.DISABLED,
        endsAt: new Date()
      }
    });
  } else {
    const existing = await prisma.subscriptionAddon.findFirst({
      where: {
        subscriptionId: activeSubscription.id,
        addonCode: payload.addonCode,
        status: AddonStatus.ACTIVE
      }
    });

    if (!existing) {
      await prisma.subscriptionAddon.create({
        data: {
          subscriptionId: activeSubscription.id,
          addonCode: payload.addonCode,
          status: AddonStatus.ACTIVE,
          priceUsdCents: payload.monthlyPriceUsdCents ?? 0,
          metadata: {
            simulated: true,
            fromCatalog: addonMeta.name
          } as Prisma.JsonObject
        }
      });
    }
  }

  const refreshed = await findActiveSubscription(userId, scope, businessId);
  return serializePlan(scope, refreshed);
};

export const createBankTransferOrder = async (
  userId: string,
  payload: { planCode: string; billingCycle: "MONTHLY" | "ONE_TIME" }
) => {
  const { scope, businessId } = await resolveContext(userId);
  const targetPlan = getPlanOrThrow(payload.planCode, scope);

  const expiresAt = new Date(Date.now() + env.BILLING_TRANSFER_ORDER_TTL_HOURS * 60 * 60 * 1000);

  const order = await prisma.paymentOrder.create({
    data: {
      userId: scope === "USER" ? userId : null,
      businessId: scope === "BUSINESS" ? businessId : null,
      targetScope: scope as SubscriptionScope,
      planCode: targetPlan.code,
      amountUsdCents: targetPlan.monthlyPriceUsdCents,
      currency: "USD",
      method: PaymentMethod.BANK_TRANSFER_NICKEL,
      status: PaymentOrderStatus.PENDING,
      transferReference: createTransferReference(),
      beneficiaryIban: env.BILLING_TRANSFER_BENEFICIARY_IBAN,
      beneficiaryBic: env.BILLING_TRANSFER_BENEFICIARY_BIC,
      beneficiaryRib: env.BILLING_TRANSFER_BENEFICIARY_RIB,
      expiresAt
    }
  });

  return {
    orderId: order.id,
    status: order.status,
    planCode: order.planCode,
    amountUsdCents: order.amountUsdCents,
    currency: order.currency,
    transferReference: order.transferReference,
    beneficiary: {
      iban: order.beneficiaryIban,
      bic: order.beneficiaryBic,
      rib: order.beneficiaryRib
    },
    expiresAt: order.expiresAt.toISOString(),
    instructions: [
      "Effectuez le virement vers le compte Nickel indiqué.",
      "Ajoutez la référence exacte dans le libellé du virement.",
      "Confirmez le dépôt dans Kin-Sell après envoi du virement."
    ]
  };
};

export const listMyPaymentOrders = async (userId: string) => {
  const { scope, businessId } = await resolveContext(userId);

  const orders = await prisma.paymentOrder.findMany({
    where: {
      userId: scope === "USER" ? userId : null,
      businessId: scope === "BUSINESS" ? businessId : null
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return {
    orders: orders.map((order) => ({
      id: order.id,
      planCode: order.planCode,
      amountUsdCents: order.amountUsdCents,
      currency: order.currency,
      status: order.status,
      transferReference: order.transferReference,
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.expiresAt.toISOString(),
      depositorNote: order.depositorNote,
      proofUrl: order.proofUrl
    }))
  };
};

export const confirmDepositSent = async (
  userId: string,
  payload: { orderId: string; depositorNote?: string; proofUrl?: string }
) => {
  const { scope, businessId } = await resolveContext(userId);

  const order = await prisma.paymentOrder.findUnique({ where: { id: payload.orderId } });
  if (!order) {
    throw new HttpError(404, "Ordre de paiement introuvable");
  }

  const canAccess =
    (scope === "USER" && order.userId === userId) ||
    (scope === "BUSINESS" && order.businessId === businessId);

  if (!canAccess) {
    throw new HttpError(403, "Ordre de paiement non autorisé");
  }

  if (order.status !== PaymentOrderStatus.PENDING) {
    throw new HttpError(400, "Cet ordre ne peut plus être confirmé");
  }

  if (order.expiresAt <= new Date()) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: PaymentOrderStatus.EXPIRED }
    });
    throw new HttpError(400, "Ordre expiré");
  }

  const updated = await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: PaymentOrderStatus.USER_CONFIRMED,
      depositorNote: payload.depositorNote,
      proofUrl: payload.proofUrl
    }
  });

  return {
    orderId: updated.id,
    status: updated.status,
    message: "Dépôt déclaré. Vérification en cours."
  };
};

// ──────────────────────────────────────────────────────────────────────────────
// LOGIQUE CENTRALE D'ACTIVATION — point unique d'activation d'un abonnement
// Appelée UNIQUEMENT par : capturePaypalPayment, adminValidateOrder
// JAMAIS appelable directement par un utilisateur.
// ──────────────────────────────────────────────────────────────────────────────
async function activateSubscriptionFromOrder(
  order: { id: string; planCode: string; userId: string | null; businessId: string | null; transferReference: string; targetScope: SubscriptionScope },
  source: string,
  extraMeta: Record<string, unknown> = {}
) {
  const scope: RoleScope = order.targetScope === SubscriptionScope.BUSINESS ? "BUSINESS" : "USER";

  await prisma.$transaction(async (tx) => {
    const targetPlan = getPlanOrThrow(order.planCode, scope);
    await replaceActiveSubscriptionInTx(tx, {
      scope,
      userId: scope === "USER" ? order.userId : null,
      businessId: scope === "BUSINESS" ? order.businessId : null,
      planCode: targetPlan.code,
      billingCycle: BillingCycle.MONTHLY,
      priceUsdCents: targetPlan.monthlyPriceUsdCents,
      autoRenew: true,
      metadata: {
        source,
        orderId: order.id,
        transferReference: order.transferReference,
        ...extraMeta,
      } as Prisma.JsonObject,
    });

    // Marquer la commande comme PAID
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PAID,
        validatedAt: new Date(),
      },
    });
  });

  // Invalidate subscription guard cache after activation
  clearSubscriptionCache();
}

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN ONLY — Valider et activer une commande manuellement
// Accepte les commandes PENDING ou USER_CONFIRMED uniquement.
// ──────────────────────────────────────────────────────────────────────────────
export const adminValidateOrder = async (payload: { orderId: string; adminUserId: string }) => {
  const order = await prisma.paymentOrder.findUnique({ where: { id: payload.orderId } });

  if (!order) {
    throw new HttpError(404, "Ordre de paiement introuvable");
  }

  if (order.status === PaymentOrderStatus.PAID || order.status === PaymentOrderStatus.VALIDATED) {
    throw new HttpError(400, "Cet ordre est déjà validé et le forfait activé");
  }

  if (order.status !== PaymentOrderStatus.PENDING && order.status !== PaymentOrderStatus.USER_CONFIRMED) {
    throw new HttpError(400, `Impossible de valider un ordre avec le statut ${order.status}`);
  }

  await activateSubscriptionFromOrder(order, "ADMIN_VALIDATION", {
    validatedByAdmin: payload.adminUserId,
  });

  const scope: RoleScope = order.targetScope === SubscriptionScope.BUSINESS ? "BUSINESS" : "USER";
  const refreshed = await findActiveSubscription(
    order.userId ?? "",
    scope,
    order.businessId
  );

  return {
    plan: serializePlan(scope, refreshed),
    message: "Forfait activé par validation admin",
  };
};

/**
 * Create a PayPal REST API checkout — creates PaymentOrder + PayPal Order + returns approval URL.
 */
export const adminActivatePlan = async (payload: {
  userId: string;
  planCode: string;
  durationDays: number;
  reason: string;
  exempt: boolean;
  activatedBy: string;
}) => {
  const { scope, businessId } = await resolveContext(payload.userId);
  const targetPlan = getPlanOrThrow(payload.planCode, scope);
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + payload.durationDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await replaceActiveSubscriptionInTx(tx, {
      scope,
      userId: scope === "USER" ? payload.userId : null,
      businessId,
      planCode: targetPlan.code,
      billingCycle: BillingCycle.ONE_TIME,
      priceUsdCents: payload.exempt ? 0 : targetPlan.monthlyPriceUsdCents,
      autoRenew: false,
      startsAt,
      endsAt,
      metadata: {
        source: "ADMIN_MANUAL",
        adminActivated: true,
        activatedBy: payload.activatedBy,
        reason: payload.reason,
        exempt: payload.exempt,
      } as Prisma.JsonObject,
    });
  });

  clearSubscriptionCache();

  const refreshed = await findActiveSubscription(payload.userId, scope, businessId);
  return {
    plan: serializePlan(scope, refreshed),
    message: "Forfait active manuellement",
  };
};

export const createPaypalCheckout = async (
  userId: string,
  payload: { planCode: string; billingCycle: "MONTHLY" | "ONE_TIME" }
) => {
  const { scope, businessId } = await resolveContext(userId);
  const targetPlan = getPlanOrThrow(payload.planCode, scope);

  const expiresAt = new Date(Date.now() + env.BILLING_TRANSFER_ORDER_TTL_HOURS * 60 * 60 * 1000);

  const order = await prisma.paymentOrder.create({
    data: {
      userId: scope === "USER" ? userId : null,
      businessId: scope === "BUSINESS" ? businessId : null,
      targetScope: scope as SubscriptionScope,
      planCode: targetPlan.code,
      amountUsdCents: targetPlan.monthlyPriceUsdCents,
      currency: "USD",
      method: PaymentMethod.PAYPAL,
      status: PaymentOrderStatus.PENDING,
      transferReference: createTransferReference(),
      beneficiaryIban: "",
      beneficiaryBic: "",
      expiresAt,
    }
  });

  const amountUsd = targetPlan.monthlyPriceUsdCents / 100;
  const returnUrl = `${env.CORS_ORIGIN}/forfaits?paid=1&orderId=${order.id}`;
  const cancelUrl = `${env.CORS_ORIGIN}/forfaits?cancelled=1`;

  const { paypalOrderId, approvalUrl } = await paypal.createOrder({
    internalOrderId: order.id,
    planCode: targetPlan.code,
    amountUsd,
    returnUrl,
    cancelUrl,
  });

  // Store the PayPal order ID in depositorNote for later capture
  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: { depositorNote: `paypal_order:${paypalOrderId}` },
  });

  return {
    orderId: order.id,
    status: order.status,
    planCode: order.planCode,
    amountUsdCents: order.amountUsdCents,
    currency: order.currency,
    transferReference: order.transferReference,
    paymentUrl: approvalUrl,
    paypalOrderId,
    expiresAt: order.expiresAt.toISOString(),
    instructions: [
      "Cliquez sur le lien PayPal pour effectuer le paiement.",
      "Après paiement, revenez sur Kin-Sell.",
      "Votre forfait sera activé automatiquement."
    ]
  };
};

/**
 * Capture PayPal payment after user returns from PayPal.
 * Called from frontend with the orderId after PayPal approval.
 * FLUX : PayPal confirme → backend valide → activation automatique.
 */
export const capturePaypalPayment = async (userId: string, payload: { orderId: string }) => {
  const { scope, businessId } = await resolveContext(userId);

  const order = await prisma.paymentOrder.findUnique({ where: { id: payload.orderId } });
  if (!order) throw new HttpError(404, "Ordre de paiement introuvable");

  const canAccess =
    (scope === "USER" && order.userId === userId) ||
    (scope === "BUSINESS" && order.businessId === businessId);
  if (!canAccess) throw new HttpError(403, "Accès refusé");

  if (order.method !== PaymentMethod.PAYPAL) throw new HttpError(400, "Cet ordre n'est pas un paiement PayPal");
  if (order.status === PaymentOrderStatus.PAID || order.status === PaymentOrderStatus.VALIDATED) {
    const refreshed = await findActiveSubscription(userId, scope, businessId);
    return { plan: serializePlan(scope, refreshed), message: "Forfait déjà activé" };
  }
  if (order.status === PaymentOrderStatus.CANCELED || order.status === PaymentOrderStatus.EXPIRED || order.status === PaymentOrderStatus.FAILED) {
    throw new HttpError(400, "Ordre expiré, échoué ou annulé");
  }

  // Extract PayPal order ID
  const paypalOrderId = order.depositorNote?.replace("paypal_order:", "");
  if (!paypalOrderId) throw new HttpError(400, "PayPal order ID introuvable");

  // Capture the payment via PayPal API — seule validation de paiement fiable
  const capture = await paypal.captureOrder(paypalOrderId);

  if (!capture.captured) {
    // Marquer la commande comme FAILED
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: PaymentOrderStatus.FAILED },
    });
    throw new HttpError(400, `Paiement PayPal non finalisé. Statut: ${capture.status}`);
  }

  // Payment successful — activation automatique via logique centralisée
  await activateSubscriptionFromOrder(order, "PAYPAL_REST", {
    paypalOrderId,
    transactionId: capture.transactionId,
    payerEmail: capture.payerEmail,
  });

  // Mettre à jour la note avec l'ID de transaction
  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: { depositorNote: `paypal_txn:${capture.transactionId}` },
  });

  const refreshed = await findActiveSubscription(userId, scope, businessId);
  return {
    plan: serializePlan(scope, refreshed),
    message: "Forfait activé via PayPal"
  };
};

