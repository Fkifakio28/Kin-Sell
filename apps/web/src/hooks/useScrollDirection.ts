import { useEffect, useRef, useState } from 'react';

/**
 * Returns a scroll direction hint: 'up' when scrolling up (or at top), 'down' when scrolling down.
 * Useful for hiding/showing sticky bars on scroll.
 */
export function useScrollDirection(): 'up' | 'down' {
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (delta > 8 && y > 60) setDir('down');
        else if (delta < -8) setDir('up');
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return dir;
}
