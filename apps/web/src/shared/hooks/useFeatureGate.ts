import { useMemo } from "react";

type PlanSummary = {
  planCode?: string | null;
  analyticsTier?: string | null;
  features?: string[] | null;
  addOns?: Array<{ code: string; status: string }> | null;
};

/**
 * Centralise la logique de gating des fonctionnalités basées sur le plan actif.
 * Remplace les useMemo dupliqués dans UserDashboard et BusinessDashboard.
 *
 * scope = "USER" → IA_MERCHANT est TOUJOURS gratuit et disponible.
 */
export function useFeatureGate(plan: PlanSummary | null | undefined, scope: "USER" | "BUSINESS" = "USER") {
  const hasAnalytics = useMemo(() => {
    if (!plan) return false;
    return plan.analyticsTier !== "NONE";
  }, [plan]);

  const hasPremiumAnalytics = useMemo(() => {
    return plan?.analyticsTier === "PREMIUM";
  }, [plan]);

  const hasIaMarchand = useMemo(() => {
    // IA_MERCHANT is FREE for all USER accounts — always true regardless of plan
    if (scope === "USER") return true;
    if (!plan) return false;
    const featureIncluded = plan.features?.includes("IA_MERCHANT") ?? false;
    const addonActive = plan.addOns?.some((a) => a.code === "IA_MERCHANT" && a.status === "ACTIVE") ?? false;
    return featureIncluded || addonActive;
  }, [plan, scope]);

  /**
   * IA_MERCHANT_AUTO = marchandage automatique (l'IA répond seule aux offres).
   * TOUJOURS payant : ne dépend pas du scope. Requiert feature IA_MERCHANT_AUTO
   * dans le plan, OU add-on IA_MERCHANT actif (qui débloque l'auto pour
   * cohérence avec le backend subscription-guard).
   */
  const hasIaMarchandAuto = useMemo(() => {
    if (!plan) return false;
    const featureIncluded = plan.features?.includes("IA_MERCHANT_AUTO") ?? false;
    const addonActive = plan.addOns?.some((a) => a.code === "IA_MERCHANT" && a.status === "ACTIVE") ?? false;
    return featureIncluded || addonActive;
  }, [plan]);

  const hasIaOrder = useMemo(() => {
    if (!plan) return false;
    const featureIncluded = plan.features?.includes("IA_ORDER") ?? false;
    const addonActive = plan.addOns?.some((a) => a.code === "IA_ORDER" && a.status === "ACTIVE") ?? false;
    return featureIncluded || addonActive;
  }, [plan]);

  return { hasAnalytics, hasPremiumAnalytics, hasIaMarchand, hasIaMarchandAuto, hasIaOrder };
}
