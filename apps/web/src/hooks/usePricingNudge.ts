import { useEffect, useState, useCallback } from "react";
import { pricingNudges, type PricingNudge } from "../lib/services/ai.service";

/**
 * Hook pour afficher des CTA intelligents vers la page forfaits.
 * Charge les nudges une fois au mount, puis toutes les 10 min.
 * Expose le top nudge actif et une fonction pour le dismisser.
 */
export function usePricingNudge() {
  const [nudges, setNudges] = useState<PricingNudge[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchNudges = useCallback(async () => {
    try {
      const data = await pricingNudges.evaluate();
      setNudges(data);
    } catch {
      // silencieux — pas de nudge si erreur
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNudges();
    const interval = setInterval(() => void fetchNudges(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNudges]);

  const dismiss = useCallback((triggerType: string) => {
    setDismissed((prev) => new Set(prev).add(triggerType));
  }, []);

  const activeNudges = nudges.filter((n) => !dismissed.has(n.triggerType));
  const topNudge = activeNudges.length > 0 ? activeNudges[0] : null;

  return { topNudge, nudges: activeNudges, dismiss, loading };
}
