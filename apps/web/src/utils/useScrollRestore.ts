import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_PREFIX = 'ks-scroll-';
const MAX_ENTRIES = 30;

/**
 * Saves scroll position on unmount / before navigation,
 * restores it when re-visiting the same pathname.
 * Works alongside react-router ScrollRestoration for belt-and-suspenders coverage.
 */
export function useScrollRestore() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Restore scroll position for this route
    const saved = sessionStorage.getItem(STORAGE_PREFIX + pathname);
    if (saved) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        // Use rAF to ensure the page has rendered
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
        });
      }
    }

    // Save scroll position on scroll (debounced) and before unload
    let timer: ReturnType<typeof setTimeout> | null = null;

    const savePosition = () => {
      sessionStorage.setItem(STORAGE_PREFIX + pathname, String(window.scrollY));
    };

    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(savePosition, 150);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('beforeunload', savePosition);

    return () => {
      // Save current position when leaving the route
      savePosition();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('beforeunload', savePosition);
      if (timer) clearTimeout(timer);

      // Prune old entries to avoid filling sessionStorage
      try {
        const keys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
        }
        if (keys.length > MAX_ENTRIES) {
          keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => sessionStorage.removeItem(k));
        }
      } catch { /* ignore */ }
    };
  }, [pathname]);
}
