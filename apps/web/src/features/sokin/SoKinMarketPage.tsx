import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExplorerShop } from '../explorer/explorer-data';
import { explorer, type ExplorerShopApi } from '../../lib/api-client';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { useHoverPopup, ProfileHoverPopup, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { AdBanner } from '../../components/AdBanner';
import './sokin-directory.css';

type HoveredShopInfo = {
  shop: ExplorerShop;
  x: number;
  y: number;
};

export function SoKinMarketPage() {
  const navigate = useNavigate();
  const { t } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  useScrollRestore();
  const KINSHASA_COMMUNES = [
    'Gombe', 'Lemba', 'Ngaliema', 'Lingwala', 'Barumbu', 'Kasa-Vubu',
    'Kalamu', 'Ngaba', 'Masina', "N'djili", 'Kinshasa', 'Matete',
    'Limete', 'Mont-Ngafula', 'Selembao', 'Kimbanseke', 'Makala', 'Bumbu',
  ];

  const [search, setSearch] = useState('');
  const [selectedCommune, setSelectedCommune] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [hoveredShop, setHoveredShop] = useState<HoveredShopInfo | null>(null);
  const [apiShops, setApiShops] = useState<ExplorerShop[]>([]);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopProfileHover = useHoverPopup<ProfileHoverData>();

  /* ── Load real shops from API ── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await explorer.shops({ limit: 50, city: defaultCity, country: effectiveCountry });
        if (cancelled) return;
        const mapped: ExplorerShop[] = data.map((s: ExplorerShopApi) => ({
          id: s.id,
          name: s.name,
          rating: 0,
          reviews: 0,
          image: '🏪',
          badge: s.badge || 'Boutique',
          href: `/business/${s.slug}`,
          city: s.city || 'Kinshasa',
          status: s.active ? 'EN_LIGNE' as const : 'HORS_LIGNE' as const,
          coverImage: s.coverImage || s.logo || '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg',
        }));
        setApiShops(mapped);
      } catch {
        // API indisponible — afficher état vide
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [defaultCity, effectiveCountry]);

  const allShops = apiShops;

  const handleBubbleEnter = useCallback((shop: ExplorerShop, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredShop({ shop, x: rect.left + rect.width / 2, y: rect.top });
    }, 500);
  }, []);

  const handleBubbleLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredShop(null);
  }, []);

  const onlineShops = useMemo(() => allShops.filter((s) => s.status === 'EN_LIGNE'), [allShops]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return onlineShops.filter((s) => {
      const inCommune = s.city.toLowerCase().includes(selectedCommune.toLowerCase());
      const matchesSearch = !q || [s.name, s.city, s.badge].join(' ').toLowerCase().includes(q);
      return inCommune && matchesSearch;
    });
  }, [onlineShops, search, selectedCommune]);

  // Build honeycomb rows: 5 bubbles, 4 bubbles, 5 bubbles...
  const hcRows = useMemo(() => {
    const rows: ExplorerShop[][] = [];
    let idx = 0;
    let r = 0;
    while (idx < filtered.length && rows.length < 5) {
      const count = r % 2 === 0 ? 5 : 4;
      rows.push(filtered.slice(idx, idx + count));
      idx += count;
      r++;
    }
    return rows;
  }, [filtered]);

  /* ── Grid listing ── */
  const gridShops = useMemo(() => {
    const q = search.trim().toLowerCase();
    return onlineShops.filter((s) => {
      const matchesSearch = !q || [s.name, s.city, s.badge].join(' ').toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [onlineShops, search]);

  return (
    <section className="skd-shell skd-shell-market animate-fade-in">
      {/* ── Topbar ── */}
      <header className="skd-topbar">
        <button type="button" onClick={() => navigate('/sokin')} className="skd-back">{t('sokin.back')}</button>
        <h1 className="skd-title">{t('sokin.market')}</h1>
      </header>

      {/* ── Compact Hero ── */}
      <section className="skd-market-hero-v2">
        <div className="skd-market-hero-text">
          <p className="skd-hero-kicker">{t('sokin.marketTitle')}</p>
          <h2 className="skd-hero-title">{t('sokin.marketHero')}</h2>
          <p className="skd-market-hero-sub">
            {t('sokin.marketDesc')}
          </p>
        </div>
        <div className="skd-market-hero-stats">
          <div className="skd-market-stat">
            <strong>{isLoading ? '…' : onlineShops.length}</strong>
            <span>{t('sokin.onlineShops')}</span>
          </div>
          <div className="skd-market-stat">
            <strong>{KINSHASA_COMMUNES.length}</strong>
            <span>{t('sokin.coveredCommunes')}</span>
          </div>
          <div className="skd-market-stat">
            <strong>✔</strong>
            <span>{t('sokin.verifiedBusinesses')}</span>
          </div>
        </div>
      </section>

      {/* Bannière publicitaire */}
      <AdBanner page="sokin-market" />

      {/* ── Search + Location bar ── */}
      <div className="skd-market-toolbar">
        <div className="skd-search-wrap skd-search-wrap--wide">
          <input
            type="search"
            className="skd-search"
            placeholder={t('sokin.searchShopPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="skd-location-row">
          <button
            type="button"
            className="skd-location-chip"
            onClick={() => setShowLocationPicker((prev) => !prev)}
            aria-label={t('sokin.changeLocation')}
          >
            📍 {selectedCommune || t('sokin.allCommunes')} · {filtered.length} {t('sokin.shopCount')}
          </button>
          {showLocationPicker && (
            <div className="skd-location-picker" role="listbox" aria-label={t('sokin.chooseCommune')}>
              <p className="skd-location-picker-label">{t('sokin.chooseCommune')}</p>
              <button
                type="button"
                role="option"
                aria-selected={selectedCommune === ''}
                className={`skd-location-option${selectedCommune === '' ? ' active' : ''}`}
                onClick={() => { setSelectedCommune(''); setShowLocationPicker(false); }}
              >
                {t('sokin.allCommunes')}
              </button>
              {KINSHASA_COMMUNES.map((commune) => (
                <button
                  type="button"
                  key={commune}
                  role="option"
                  aria-selected={selectedCommune === commune}
                  className={`skd-location-option${selectedCommune === commune ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedCommune(commune);
                    setShowLocationPicker(false);
                  }}
                >
                  {commune}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Honeycomb section - KEPT AS-IS ── */}
      <section className="skd-hc-shell" aria-label={t('sokin.activeShops')}>
        <div className="skd-hc-head">
          <span className="skd-hc-title">{t('sokin.activeShops')}</span>
          <span className="skd-hc-count">{filtered.length} {t('sokin.onlineCount')}</span>
        </div>
        {isLoading ? (
          <p className="skd-empty">{t('sokin.loadingShops')}</p>
        ) : hcRows.length === 0 ? (
          <p className="skd-empty">
            {allShops.length === 0
              ? t('sokin.noShops')
              : t('sokin.noShopsZone')}
          </p>
        ) : (
          <div className="skd-hc-grid">
            {hcRows.map((row, rowIdx) => (
              <div
                key={`hc-row-${rowIdx}`}
                className={`skd-hc-row${rowIdx % 2 === 1 ? ' skd-hc-row--offset' : ''}`}
              >
                {row.map((shop, bubbleIdx) => {
                  const delay = ((rowIdx * 5 + bubbleIdx) * 0.28) % 2.8;
                  const dur = 2.4 + ((rowIdx * 3 + bubbleIdx) % 5) * 0.4;
                  return (
                    <button
                      type="button"
                      key={shop.id}
                      onClick={() => navigate(shop.href)}
                      className="skd-watch-bubble"
                      title={shop.name}
                      style={{
                        animationDelay: `${delay}s`,
                        animationDuration: `${dur}s`,
                      }}
                      onMouseEnter={(e) => handleBubbleEnter(shop, e)}
                      onMouseLeave={handleBubbleLeave}
                    >
                      <img src={shop.coverImage} alt={shop.name} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sponsored banner ── */}
      <section className="skd-inline-ad skd-inline-ad--hero" aria-label={t('sokin.sponsoredAd')}>
        <div>
          <p className="skd-inline-ad-tag">{t('sokin.sponsoredTag')}</p>
          <strong>{t('sokin.boostShopTitle')} {selectedCommune}</strong>
          <span>{t('sokin.boostShopDesc')}</span>
        </div>
        <button type="button" onClick={() => navigate('/forfaits')} className="skd-inline-ad-cta">{t('sokin.launchCampaign')}</button>
      </section>

      {/* ── Shops Grid - Full width ── */}
      <section className="skd-market-grid-section">
        <div className="skd-market-grid-head">
          <h2 className="skd-market-grid-title">{t('sokin.allShops')}</h2>
          <span className="skd-market-grid-count">{gridShops.length} {t('sokin.results')}</span>
        </div>

        {isLoading ? (
          <p className="skd-empty">{t('sokin.loadingShops')}</p>
        ) : gridShops.length === 0 ? (
          <p className="skd-empty">
            {allShops.length === 0
              ? t('sokin.noShopCreate')
              : t('sokin.noShopSearch')}
          </p>
        ) : (
          <div className="skd-market-cards-grid">
            {gridShops.map((shop) => (
              <div role="button" key={shop.id} onClick={() => navigate(shop.href)} className="skd-market-shop-card"
                onMouseEnter={(e) => shopProfileHover.handleMouseEnter({ avatarUrl: shop.coverImage, name: shop.name, username: null, kinId: null, publicPageUrl: shop.href }, e)}
                onMouseLeave={shopProfileHover.handleMouseLeave}
              >
                <div className="skd-market-shop-cover">
                  <img src={shop.coverImage} alt={shop.name} />
                  <span className="skd-market-shop-badge">{shop.badge}</span>
                  <span className={`skd-market-shop-status${shop.status === 'EN_LIGNE' ? ' online' : ''}`}>
                    {shop.status === 'EN_LIGNE' ? '🟢' : '⚪'} {shop.status === 'EN_LIGNE' ? t('sokin.online') : t('sokin.offline')}
                  </span>
                </div>
                <div className="skd-market-shop-body">
                  <h3 className="skd-market-shop-name">{shop.name}</h3>
                  <p className="skd-market-shop-city">📍 {shop.city}</p>
                  <div className="skd-market-shop-footer">
                    <span className="skd-market-shop-rating">⭐ {shop.rating > 0 ? shop.rating.toFixed(1) : '—'}</span>
                    <span className="skd-market-shop-reviews">{shop.reviews > 0 ? `${shop.reviews} ${t('sokin.reviews')}` : t('sokin.new')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Bottom ads : visibles uniquement si des pubs réelles sont publiées ── */}
      <AdBanner page="sokin-market" hideWhenEmpty />

      {/* ── Hover popup ── */}
      {hoveredShop && (
        <div
          className="skd-shop-hover-popup"
          style={{
            left: hoveredShop.x,
            top: hoveredShop.y,
          }}
        >
          <div className="skd-shop-hover-banner">
            <img src={hoveredShop.shop.coverImage} alt={hoveredShop.shop.name} />
          </div>
          <div className="skd-shop-hover-body">
            <strong className="skd-shop-hover-name">{hoveredShop.shop.name}</strong>
            {hoveredShop.shop.badge ? <span className="skd-shop-hover-badge">{hoveredShop.shop.badge}</span> : null}
            <span className="skd-shop-hover-city">📍 {hoveredShop.shop.city}</span>
          </div>
        </div>
      )}

      <ProfileHoverPopup popup={shopProfileHover.popup} />
    </section>
  );
}
