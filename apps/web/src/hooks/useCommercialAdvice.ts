import { useEffect, useState, useCallback } from "react";
import { commercialAdvisor, type CommercialRecommendation } from "../lib/services/ai.service";

/**
 * Hook pour afficher des recommandations commerciales contextuelles.
 * Charge les recommandations au mount puis toutes les 15 min.
 * Expose la top recommandation et une fonction pour dismisser.
 */
export function useCommercialAdvice() {
  const [advice, setAdvice] = useState<CommercialRecommendation[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchAdvice = useCallback(async () => {
    try {
      const data = await commercialAdvisor.getAdvice();
      setAdvice(data);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdvice();
    const interval = setInterval(() => void fetchAdvice(), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAdvice]);

  const dismiss = useCallback((productCode: string) => {
    setDismissed((prev) => new Set(prev).add(productCode));
  }, []);

  const active = advice.filter((a) => !dismissed.has(a.productCode));
  const topAdvice = active.length > 0 ? active[0] : null;

  return { topAdvice, advice: active, dismiss, loading };
}
