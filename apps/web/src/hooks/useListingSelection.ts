import { useState, useCallback } from 'react';
import type { MyListing } from '../lib/services/listings.service';

export function useListingSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [promoItems, setPromoItems] = useState<MyListing[] | null>(null);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: MyListing[]) => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const openPromo = useCallback((allItems: MyListing[]) => {
    const selected = allItems.filter((a) => selectedIds.has(a.id));
    if (selected.length > 0) setPromoItems(selected);
  }, [selectedIds]);

  const closePromo = useCallback(() => {
    setPromoItems(null);
    setSelectedIds(new Set());
  }, []);

  return { selectedIds, setSelectedIds, toggle, selectAll, deselectAll, promoItems, setPromoItems, openPromo, closePromo };
}
