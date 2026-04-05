import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAdsSlot, resolveMediaUrl, type AiAdSlotResponse } from '../lib/api-client';
import { useAuth } from '../app/providers/AuthProvider';

type SmartAdSlotProps = {
  pageKey: string;
  componentKey: string;
  variant?: 'banner' | 'card' | 'inline' | 'popup' | 'sidebar';
  className?: string;
};

export function SmartAdSlot({ pageKey, componentKey, variant = 'banner', className }: SmartAdSlotProps) {
  const [ad, setAd] = useState<AiAdSlotResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const impressionSent = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const res = await aiAdsSlot.getForSlot(pageKey, componentKey, {
        userRole: user?.role,
        userPlanCode: undefined,
      });
      if (res.ad) setAd(res.ad);
    } catch { /* silent */ }
  }, [pageKey, componentKey, user?.role]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (ad && !impressionSent.current) {
      impressionSent.current = true;
      aiAdsSlot.recordImpression(ad.campaignId).catch(() => {});
    }
  }, [ad]);

  const handleClick = useCallback(() => {
    if (!ad) return;
    aiAdsSlot.recordClick(ad.campaignId).catch(() => {});
    const target = ad.creative.ctaTarget;
    if (target.startsWith('http')) {
      window.open(target, '_blank', 'noopener');
    } else {
      navigate(target);
    }
  }, [ad, navigate]);

  const handleDismiss = useCallback(() => {
    if (!ad) return;
    aiAdsSlot.recordDismiss(ad.campaignId).catch(() => {});
    setDismissed(true);
  }, [ad]);

  if (!ad || dismissed) return null;

  const c = ad.creative;
  const mediaUrl = c.mediaUrl ? resolveMediaUrl(c.mediaUrl) : null;

  const AD_TYPE_ICONS: Record<string, string> = {
    BOOST_ARTICLE: '🚀',
    BOOST_SHOP: '🏪',
    FORFAIT: '💎',
    IA_PROMO: '🤖',
    ESSAI: '🎁',
    AUTO_VENTE: '📈',
    UPGRADE: '⬆️',
    CUSTOM: '✨',
  };
  const icon = AD_TYPE_ICONS[c.adType] || '📢';

  const baseStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    background: 'linear-gradient(135deg, rgba(111,88,255,0.12), rgba(18,11,43,0.6))',
    border: '1px solid rgba(111,88,255,0.2)',
    backdropFilter: 'blur(12px)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    banner: { padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 },
    card: { padding: 18, maxWidth: 320 },
    inline: { padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 },
    popup: { padding: 24, maxWidth: 380, textAlign: 'center' as const },
    sidebar: { padding: 16, width: '100%' },
  };

  return (
    <div
      className={`smart-ad-slot smart-ad-slot--${variant} ${className || ''}`}
      style={{ ...baseStyle, ...variantStyles[variant] }}
      onClick={handleClick}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(111,88,255,0.25)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      {/* Dismiss button */}
      <button
        onClick={e => { e.stopPropagation(); handleDismiss(); }}
        style={{
          position: 'absolute', top: 6, right: 8, background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          zIndex: 2,
        }}
        title="Fermer"
      >✕</button>

      {/* Media */}
      {mediaUrl && (c.mediaType === 'IMAGE' || c.mediaType === 'BANNER' || c.mediaType === 'GIF') && (
        <img
          src={mediaUrl}
          alt={c.title}
          style={{
            width: variant === 'banner' ? 48 : '100%',
            height: variant === 'banner' ? 48 : 'auto',
            borderRadius: variant === 'banner' ? 10 : 12,
            objectFit: 'cover',
            maxHeight: variant === 'banner' ? 48 : 160,
            marginBottom: variant !== 'banner' ? 10 : 0,
          }}
        />
      )}

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: variant === 'inline' ? 14 : 16 }}>{icon}</span>
          <span style={{
            fontSize: variant === 'inline' ? 12 : 14, fontWeight: 700,
            color: 'var(--color-text-primary, #fff)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.title}</span>
        </div>
        {c.subtitle && variant !== 'inline' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{c.subtitle}</div>
        )}
        <div style={{
          fontSize: variant === 'inline' ? 11 : 12,
          color: 'var(--color-text-secondary, #aaa)',
          lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: variant === 'inline' ? 1 : 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{c.contentText}</div>
      </div>

      {/* CTA */}
      <button
        onClick={e => { e.stopPropagation(); handleClick(); }}
        style={{
          flexShrink: 0,
          padding: variant === 'inline' ? '4px 10px' : '6px 14px',
          fontSize: variant === 'inline' ? 10 : 11,
          fontWeight: 700,
          border: 'none',
          borderRadius: 8,
          background: 'linear-gradient(135deg, #6f58ff, #9b7aff)',
          color: '#fff',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          marginTop: variant === 'card' || variant === 'popup' || variant === 'sidebar' ? 10 : 0,
          width: variant === 'popup' ? '100%' : undefined,
        }}
      >{c.ctaLabel}</button>

      {/* IA badge */}
      <span style={{
        position: 'absolute', bottom: 4, right: 8,
        fontSize: 8, color: 'rgba(111,88,255,0.4)', fontWeight: 500,
      }}>IA Ads</span>
    </div>
  );
}
