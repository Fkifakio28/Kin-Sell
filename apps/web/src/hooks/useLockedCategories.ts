import { useEffect, useState } from 'react';
import { listings } from '../lib/api-client';

let _cache: string[] | null = null;
let _fetching = false;
const _listeners = new Set<(cats: string[]) => void>();

function notify(cats: string[]) {
  _cache = cats;
  _listeners.forEach(fn => fn(cats));
}

/** Shared hook: returns lowercase locked category names. Caches globally, refreshes every 5 min. */
export function useLockedCategories(): string[] {
  const [cats, setCats] = useState<string[]>(_cache ?? []);

  useEffect(() => {
    _listeners.add(setCats);

    if (!_cache && !_fetching) {
      _fetching = true;
      listings.lockedCategories()
        .then(data => { _fetching = false; notify(data.map(c => c.toLowerCase())); })
        .catch(() => { _fetching = false; });
    } else if (_cache) {
      setCats(_cache);
    }

    // Refresh every 5 min
    const iv = setInterval(() => {
      listings.lockedCategories()
        .then(data => notify(data.map(c => c.toLowerCase())))
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => { _listeners.delete(setCats); clearInterval(iv); };
  }, []);

  return cats;
}

/** Simple check helper */
export function isCategoryLocked(lockedCats: string[], category?: string): boolean {
  if (!category) return false;
  return lockedCats.includes(category.toLowerCase());
}
