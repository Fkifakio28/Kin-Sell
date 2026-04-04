import { useMemo } from "react";

type PlanSummary = {
  planCode?: string | null;
  analyticsTier?: string | null;
  addOns?: Array<{ code: string; status: string }> | null;
};

/**
 * Centralise la logique de gating des fonctionnalités basées sur le plan actif.
 * Remplace les useMemo dupliqués dans UserDashboard et BusinessDashboard.
 */
export function useFeatureGate(plan: PlanSummary | null | undefined) {
  const hasAnalytics = useMemo(() => {
    if (!plan) return false;
    return plan.analyticsTier !== "NONE";
  }, [plan]);

  const hasPremiumAnalytics = useMemo(() => {
    return plan?.analyticsTier === "PREMIUM";
  }, [plan]);

  const hasIaMarchand = useMemo(() => {
    if (!plan) return false;
    const planIncludes = ["AUTO", "PRO_VENDOR", "SCALE", "BUSINESS"].includes(plan.planCode ?? "");
    const addonActive = plan.addOns?.some((a) => a.code === "IA_MERCHANT" && a.status === "ACTIVE") ?? false;
    return planIncludes || addonActive;
  }, [plan]);

  const hasIaOrder = useMemo(() => {
    if (!plan) return false;
    const planIncludes = ["AUTO", "PRO_VENDOR", "SCALE"].includes(plan.planCode ?? "");
    const addonActive = plan.addOns?.some((a) => a.code === "IA_ORDER" && a.status === "ACTIVE") ?? false;
    return planIncludes || addonActive;
  }, [plan]);

  return { hasAnalytics, hasPremiumAnalytics, hasIaMarchand, hasIaOrder };
}
