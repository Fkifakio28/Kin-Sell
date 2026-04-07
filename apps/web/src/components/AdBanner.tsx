import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adsApi, resolveMediaUrl, type AdvertisementItem } from '../lib/api-client';
import '../styles/ad-banner.css';

// ── Kin-Sell internal promos (fallback quand aucune pub payante n'est active) ──
type KinSellPromo = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  icon: string;
};

const KIN_SELL_PROMOS: KinSellPromo[] = [
  {
    id: 'ks-1',
    icon: '🚀',
    title: 'Lancez votre boutique sur Kin-Sell',
    description: 'Vendez vos produits et services directement à Kinshasa. Inscription gratuite.',
    ctaText: 'Créer ma boutique',
    link: '/account',
  },
  {
    id: 'ks-2',
    icon: '🔍',
    title: 'Explorez le marché Kin-Sell',
    description: "Des milliers d'articles, services et professionnels vérifiés à Kinshasa.",
    ctaText: 'Explorer',
    link: '/explorer',
  },
  {
    id: 'ks-3',
    icon: '✦',
    title: 'Rejoignez So-Kin',
    description: 'Le réseau social du commerce congolais. Publiez, discutez, vendez.',
    ctaText: 'Ouvrir So-Kin',
    link: '/sokin',
  },
  {
    id: 'ks-4',
    icon: '🤝',
    title: 'Négociez en toute confiance',
    description: 'Le système de marchandage Kin-Sell protège acheteurs et vendeurs.',
    ctaText: 'Essayer le marchandage',
    link: '/account',
  },
  {
    id: 'ks-5',
    icon: '📦',
    title: 'Publiez votre premier article',
    description: 'En 3 étapes simples. Photos, prix, description. Votre vitrine en 5 min.',
    ctaText: 'Publier maintenant',
    link: '/account?section=articles',
  },
  {
    id: 'ks-6',
    icon: '🏪',
    title: 'Boutiques vérifiées Kin-Sell',
    description: 'Achetez en confiance auprès de boutiques officiellement vérifiées.',
    ctaText: 'Voir les boutiques',
    link: '/explorer/shops-online',
  },
];

type AdPage = 'home' | 'explorer' | 'sokin' | 'account' | 'admin';
type AdVariant = 'horizontal' | 'sidebar' | 'slim';

interface AdBannerProps {
  page: AdPage;
  variant?: AdVariant;
  /** Forcer l'affichage d'une promo Kin-Sell interne (jamais de pub client) */
  forceKinSell?: boolean;
  /**
   * Cacher complètement le composant quand aucune pub réelle n'est publiée.
   * Aucune promo Kin-Sell de remplacement n'est affichée.
   */
  hideWhenEmpty?: boolean;
  className?: string;
  /** Évite de remonter la même pub consécutive dans un flux donné */
  excludeAdId?: string;
  /** Clé de slot pour une rotation stable côté client/serveur */
  slotKey?: string;
  /** Remonte l'identifiant final de pub résolue (ou null si rien affiché) */
  onAdResolved?: (adId: string | null) => void;
}

const KIN_SELL_ONLY_PAGES: AdPage[] = ['account', 'admin'];

function pickPromo(page: string): KinSellPromo {
  // Déterministe par page pour éviter les flash de changement
  const idx = (page.length * 3 + page.charCodeAt(0)) % KIN_SELL_PROMOS.length;
  return KIN_SELL_PROMOS[idx];
}

export function AdBanner({
  page,
  variant = 'horizontal',
  forceKinSell = false,
  hideWhenEmpty = false,
  className = '',
  excludeAdId,
  slotKey,
  onAdResolved,
}: AdBannerProps) {
  const navigate = useNavigate();
  const isKinSellOnly = forceKinSell || KIN_SELL_ONLY_PAGES.includes(page);

  // Promo Kin-Sell stable pour ce composant (évite le flash au fallback)
  const [kinSellPromo] = useState<KinSellPromo>(() => pickPromo(page));
  const [adData, setAdData] = useState<AdvertisementItem | null>(null);
  const [showKinSell, setShowKinSell] = useState(true); // afficher promo KS immédiatement
  const [apiChecked, setApiChecked] = useState(false); // API a répondu au moins une fois
  const impressionRecorded = useRef(false);

  // Charger la pub réelle depuis l'API (sauf pages Kin-Sell-only)
  useEffect(() => {
    if (isKinSellOnly) {
      setShowKinSell(true);
      setApiChecked(true);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await adsApi.getBanner(page, { excludeAdId, slotKey });
        if (cancelled) return;
        const resolvedAd = result.ad && result.ad.id !== excludeAdId ? result.ad : null;
        if (resolvedAd) {
          setAdData(resolvedAd);
          setShowKinSell(false);
          onAdResolved?.(resolvedAd.id);
        } else {
          setAdData(null);
          setShowKinSell(true);
          onAdResolved?.(null);
        }
      } catch {
        if (!cancelled) {
          setAdData(null);
          setShowKinSell(true);
          onAdResolved?.(null);
        }
      } finally {
        if (!cancelled) setApiChecked(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [page, isKinSellOnly, excludeAdId, slotKey, onAdResolved]);

  // Enregistrer l'impression une seule fois, une fois la pub déterminée
  useEffect(() => {
    if (impressionRecorded.current) return;
    if (!showKinSell && adData) {
      impressionRecorded.current = true;
      void adsApi.recordImpression(adData.id).catch(() => {});
    }
  }, [showKinSell, adData]);

  const handleClick = useCallback(() => {
    if (!showKinSell && adData) {
      void adsApi.recordClick(adData.id).catch(() => {});
      const url = adData.linkUrl;
      if (url.startsWith('/') || url.startsWith('#')) {
        navigate(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      navigate(kinSellPromo.link);
    }
  }, [showKinSell, adData, kinSellPromo, navigate]);

  const variantClass =
    variant === 'sidebar' ? ' ks-ad-banner--sidebar'
    : variant === 'slim' ? ' ks-ad-banner--slim'
    : '';
  const externalClass = !showKinSell && adData ? ' ks-ad-banner--external' : '';

  // ── hideWhenEmpty : ne rien afficher tant que l'API n'a pas répondu ni confirmé une pub ──
  if (hideWhenEmpty) {
    // En attente de la réponse API → invisible (pas de flash)
    if (!apiChecked) return null;
    // API a répondu mais aucune pub active → invisible
    if (!adData) return null;
  }

  // ── Promo Kin-Sell interne ───────────────────────────────────────────────
  if (showKinSell) {
    return (
      <div
        className={`ks-ad-banner${variantClass}${className ? ` ${className}` : ''}`}
        role="complementary"
        aria-label="Espace publicitaire Kin-Sell"
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        <div className="ks-ad-banner__icon">{kinSellPromo.icon}</div>
        <div className="ks-ad-banner__content">
          <div className="ks-ad-banner__label">
            <span className="ks-ad-banner__tag">✦ Kin-Sell</span>
          </div>
          <p className="ks-ad-banner__title">{kinSellPromo.title}</p>
          <p className="ks-ad-banner__desc">{kinSellPromo.description}</p>
        </div>
        <button
          type="button"
          className="ks-ad-banner__cta"
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
        >
          {kinSellPromo.ctaText}
        </button>
      </div>
    );
  }

  // ── Pub payante (client) ─────────────────────────────────────────────────
  const ad = adData!;
  return (
    <div
      className={`ks-ad-banner${variantClass}${externalClass}${className ? ` ${className}` : ''}`}
      role="complementary"
      aria-label="Publicité"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      {ad.imageUrl ? (
        <img src={resolveMediaUrl(ad.imageUrl)} alt="" className="ks-ad-banner__img" loading="lazy" />
      ) : (
        <div className="ks-ad-banner__icon">📢</div>
      )}
      <div className="ks-ad-banner__content">
        <div className="ks-ad-banner__label">
          <span className="ks-ad-banner__tag ks-ad-banner__tag--paid">Publicité</span>
        </div>
        <p className="ks-ad-banner__title">{ad.title}</p>
        {ad.description && <p className="ks-ad-banner__desc">{ad.description}</p>}
      </div>
      <button
        type="button"
        className="ks-ad-banner__cta"
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
      >
        {ad.ctaText ?? 'Voir'}
      </button>
    </div>
  );
}
