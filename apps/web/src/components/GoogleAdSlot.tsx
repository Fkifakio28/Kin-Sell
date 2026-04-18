import { useEffect, useRef } from 'react';
import '../styles/google-adsense.css';

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

type AdFormat = 'auto' | 'rectangle' | 'horizontal' | 'vertical' | 'fluid';

interface GoogleAdSlotProps {
  /** Ad-unit slot ID from AdSense console (e.g. "1234567890") */
  adSlot: string;
  /** responsive | fixed */
  adFormat?: AdFormat;
  /** Required for In-Feed (fluid) ads — from AdSense code snippet */
  layoutKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

// ── Connexion lente ? On ne charge pas AdSense pour éviter de bloquer la page ──
function isSlowConnection(): boolean {
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g' || conn.effectiveType === '3g';
}

/** Charge le script AdSense une seule fois, à la demande */
let _adsenseLoading = false;
let _adsenseSkipped = false;
function ensureAdsenseScript(): boolean {
  if (_adsenseSkipped) return false;
  if (_adsenseLoading || document.querySelector('script[src*="adsbygoogle"]')) return true;
  // Skip in Capacitor native WebView
  if (/KinSellApp/i.test(navigator.userAgent)) {
    window.adsbygoogle = { push() {} } as unknown as Record<string, unknown>[];
    _adsenseSkipped = true;
    return false;
  }
  // Skip sur connexions lentes (2G, slow-2g, Save-Data)
  if (isSlowConnection()) {
    _adsenseSkipped = true;
    return false;
  }
  _adsenseLoading = true;
  const s = document.createElement('script');
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8795910357013666';
  s.async = true;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
  return true;
}

/**
 * Renders a single Google AdSense ad unit.
 * - Chargé dynamiquement (pas dans <head>)
 * - Lazy-load via IntersectionObserver (chargé seulement quand visible)
 * - Skipé sur connexions lentes (2G) et dans Capacitor natif
 */
export function GoogleAdSlot({
  adSlot,
  adFormat = 'auto',
  layoutKey,
  className = '',
  style,
}: GoogleAdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || pushed.current) return;

    // IntersectionObserver : ne charger que quand le slot est visible
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || pushed.current) return;
        observer.disconnect();

        const loaded = ensureAdsenseScript();
        if (!loaded) return; // connexion lente ou natif

        const tryPush = () => {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            pushed.current = true;
          } catch {
            setTimeout(() => {
              try { (window.adsbygoogle = window.adsbygoogle || []).push({}); pushed.current = true; } catch { /* noop */ }
            }, 1500);
          }
        };
        // Laisser le script se charger (déjà async)
        setTimeout(tryPush, 500);
      },
      { rootMargin: '200px' }, // précharger 200px avant d'être visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ne rien rendre du tout sur connexion lente
  if (_adsenseSkipped) return null;

  return (
    <div ref={containerRef} className={`g-adsense-slot ${className}`} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-8795910357013666"
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
        data-full-width-responsive="true"
      />
    </div>
  );
}
