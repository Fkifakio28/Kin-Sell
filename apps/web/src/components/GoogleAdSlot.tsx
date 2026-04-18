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

/**
 * Renders a single Google AdSense ad unit.
 * The global adsbygoogle script is already loaded in index.html.
 * Skipped in Capacitor WebView (script removed at boot).
 */
export function GoogleAdSlot({
  adSlot,
  adFormat = 'auto',
  layoutKey,
  className = '',
  style,
}: GoogleAdSlotProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // adsbygoogle not loaded (e.g. ad-blocker or native app)
    }
  }, []);

  return (
    <div className={`g-adsense-slot ${className}`} style={style}>
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
