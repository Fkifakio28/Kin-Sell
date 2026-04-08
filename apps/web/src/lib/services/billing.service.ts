import { request } from "../api-core";

export type BillingPlanSummary = {
  id: string | null;
  scope: "USER" | "BUSINESS";
  planCode: string;
  planName: string;
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
  priceUsdCents: number;
  status: "ACTIVE" | "CANCELED" | "EXPIRED";
  billingCycle: "MONTHLY" | "ONE_TIME";
  startsAt: string | null;
  endsAt: string | null;
  features: string[];
  addOns: Array<{
    code: string;
    status: string;
    priceUsdCents: number;
    startsAt: string;
    endsAt: string | null;
  }>;
};

export const billing = {
  catalog: () => request<{
    userPlans: Array<{
      code: string;
      name: string;
      scope: "USER" | "BUSINESS";
      monthlyPriceUsdCents: number;
      features: string[];
      analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
    }>;
    businessPlans: Array<{
      code: string;
      name: string;
      scope: "USER" | "BUSINESS";
      monthlyPriceUsdCents: number;
      features: string[];
      analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
    }>;
    addOns: Array<{
      code: "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM";
      name: string;
      priceLabel: string;
      scope: "ALL" | "USER" | "BUSINESS";
      details: string[];
    }>;
    analyticsRule: string;
  }>("/billing/catalog"),
  myPlan: () => request<BillingPlanSummary>("/billing/my-plan"),
  createBankTransferCheckout: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<{
      orderId: string;
      status: string;
      planCode: string;
      amountUsdCents: number;
      currency: string;
      transferReference: string;
      beneficiary: {
        iban: string;
        bic: string;
        rib?: string | null;
      };
      expiresAt: string;
      instructions: string[];
    }>("/billing/checkout/bank-transfer", { method: "POST", body }),
  createPaypalCheckout: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<{
      orderId: string;
      status: string;
      planCode: string;
      amountUsdCents: number;
      currency: string;
      transferReference: string;
      paymentUrl: string;
      expiresAt: string;
      instructions: string[];
    }>("/billing/checkout/paypal", { method: "POST", body }),
  createMobileMoneyCheckout: (body: {
    planCode: string;
    billingCycle?: "MONTHLY" | "ONE_TIME";
    provider: "ORANGE_MONEY" | "MPESA";
    phoneNumber: string;
    amountCDF: number;
  }) =>
    request<{
      paymentOrder: { orderId: string; planCode: string; amountUsdCents: number };
      mobileMoney: { paymentId: string; provider: string; status: string; redirectUrl?: string; message?: string };
    }>("/billing/checkout/mobile-money", { method: "POST", body }),
  paymentOrders: () => request<{ orders: Array<{
    id: string;
    planCode: string;
    amountUsdCents: number;
    currency: string;
    status: string;
    transferReference: string;
    createdAt: string;
    expiresAt: string;
    depositorNote?: string | null;
    proofUrl?: string | null;
  }> }>("/billing/payment-orders"),
  confirmDeposit: (body: { orderId: string; depositorNote?: string; proofUrl?: string }) =>
    request<{ orderId: string; status: string; message: string }>("/billing/payment-orders/confirm-deposit", { method: "POST", body }),
  capturePaypalCheckout: (body: { orderId: string }) =>
    request<{ plan: BillingPlanSummary; message: string }>("/billing/paypal/capture", { method: "POST", body }),
  // activateOrder supprimé : l'activation se fait uniquement via PayPal capture ou validation admin
  changePlan: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<BillingPlanSummary>("/billing/subscription/simulate-change", { method: "POST", body }),
  toggleAddon: (body: { addonCode: "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM"; action: "ENABLE" | "DISABLE"; monthlyPriceUsdCents?: number }) =>
    request<BillingPlanSummary>("/billing/addons/simulate", { method: "POST", body })
};
