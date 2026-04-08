/**
 * PromoCreator — Popup de création de promotion article(s)
 * Permet de définir un prix promo pour un ou plusieurs articles
 * Choix final : Publier la promotion ou Booster la promotion
 */

import { useState, type FC } from 'react';
import type { MyListing } from '../lib/services/listings.service';
import { listings as listingsApi } from '../lib/api-client';
import { useLocaleCurrency } from '../app/providers/LocaleCurrencyProvider';
import './promo-creator.css';

type PromoCreatorProps = {
  articles: MyListing[];
  resolveMediaUrl: (url: string) => string;
  onClose: () => void;
  onPublished: () => void;
  onBoost: () => void;
};

export const PromoCreator: FC<PromoCreatorProps> = ({
  articles,
  resolveMediaUrl,
  onClose,
  onPublished,
  onBoost,
}) => {
  const { formatPriceLabelFromUsdCents } = useLocaleCurrency();

  // Individual promo prices per article (USD cents)
  const [promoPrices, setPromoPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of articles) {
      // Default to 80% of original price
      init[a.id] = ((a.priceUsdCents * 0.8) / 100).toFixed(2);
    }
    return init;
  });
  const [useUniformPrice, setUseUniformPrice] = useState(articles.length > 1);
  const [uniformPriceStr, setUniformPriceStr] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'published' | 'boost' | null>(null);

  const setPromoPrice = (id: string, val: string) => {
    // Allow only numbers and dot
    if (val && !/^\d*\.?\d{0,2}$/.test(val)) return;
    setPromoPrices((prev) => ({ ...prev, [id]: val }));
  };

  // Compute effective promo price in cents for each article
  const getPromoCents = (articleId: string): number => {
    if (useUniformPrice && uniformPriceStr) {
      return Math.round(parseFloat(uniformPriceStr) * 100) || 0;
    }
    const v = promoPrices[articleId];
    return v ? Math.round(parseFloat(v) * 100) || 0 : 0;
  };

  // Validate all promo prices
  const validationErrors: string[] = [];
  for (const a of articles) {
    const cents = getPromoCents(a.id);
    if (cents <= 0) {
      validationErrors.push(`"${a.title}" : prix promo manquant`);
    } else if (cents >= a.priceUsdCents) {
      validationErrors.push(`"${a.title}" : le prix promo doit être inférieur au prix original`);
    }
  }
  const isValid = validationErrors.length === 0;

  // Calculate total savings
  const totalOriginal = articles.reduce((s, a) => s + a.priceUsdCents, 0);
  const totalPromo = articles.reduce((s, a) => s + getPromoCents(a.id), 0);
  const totalSavingPct = totalOriginal > 0 ? Math.round(((totalOriginal - totalPromo) / totalOriginal) * 100) : 0;

  const handleSavePromo = async (andBoost: boolean) => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      // If uniform price, use it for all
      if (useUniformPrice && uniformPriceStr) {
        const cents = Math.round(parseFloat(uniformPriceStr) * 100);
        await listingsApi.setPromo(articles.map((a) => a.id), cents, true);
      } else {
        // Group by price for efficiency
        const priceGroups = new Map<number, string[]>();
        for (const a of articles) {
          const cents = getPromoCents(a.id);
          const group = priceGroups.get(cents) || [];
          group.push(a.id);
          priceGroups.set(cents, group);
        }
        for (const [cents, ids] of priceGroups) {
          await listingsApi.setPromo(ids, cents, true);
        }
      }
      setDone(andBoost ? 'boost' : 'published');
      if (!andBoost) {
        setTimeout(() => {
          onPublished();
          onClose();
        }, 1500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // ── Success state ──
  if (done === 'published') {
    return (
      <div className="promo-overlay" onClick={onClose}>
        <div className="promo-popup promo-popup--success" onClick={(e) => e.stopPropagation()}>
          <div className="promo-success-icon">🎉</div>
          <h3>Promotion publiée !</h3>
          <p>Vos articles sont maintenant en promotion. Les acheteurs verront le nouveau prix.</p>
        </div>
      </div>
    );
  }

  if (done === 'boost') {
    // Trigger boost flow
    setTimeout(() => {
      onBoost();
      onClose();
    }, 300);
    return null;
  }

  return (
    <div className="promo-overlay" onClick={onClose}>
      <div className="promo-popup" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="promo-header">
          <div className="promo-header-left">
            <span className="promo-header-icon">🏷️</span>
            <div>
              <h3 className="promo-title">Créer une promotion</h3>
              <p className="promo-subtitle">
                {articles.length} article{articles.length > 1 ? 's' : ''} sélectionné{articles.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button type="button" className="promo-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {step === 'edit' ? (
          <>
            {/* ── Uniform price toggle (for multi-select) ── */}
            {articles.length > 1 && (
              <div className="promo-uniform">
                <label className="promo-uniform-toggle">
                  <input
                    type="checkbox"
                    checked={useUniformPrice}
                    onChange={(e) => setUseUniformPrice(e.target.checked)}
                  />
                  <span className="promo-uniform-slider" />
                  <span className="promo-uniform-label">Prix promo identique pour tous</span>
                </label>
                {useUniformPrice && (
                  <div className="promo-uniform-input">
                    <span className="promo-input-prefix">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={uniformPriceStr}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v || /^\d*\.?\d{0,2}$/.test(v)) setUniformPriceStr(v);
                      }}
                      className="promo-price-input"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Articles list ── */}
            <div className="promo-articles">
              {articles.map((article) => {
                const promoCents = getPromoCents(article.id);
                const savings = article.priceUsdCents > 0 && promoCents > 0
                  ? Math.round(((article.priceUsdCents - promoCents) / article.priceUsdCents) * 100)
                  : 0;
                return (
                  <div key={article.id} className="promo-article-row">
                    <div className="promo-article-img">
                      {article.imageUrl ? (
                        <img src={resolveMediaUrl(article.imageUrl)} alt={article.title} />
                      ) : (
                        <span className="promo-article-placeholder">{article.type === 'SERVICE' ? '🛠️' : '📦'}</span>
                      )}
                    </div>
                    <div className="promo-article-info">
                      <span className="promo-article-name">{article.title}</span>
                      <span className="promo-article-meta">{article.category} · {article.city}</span>
                    </div>
                    <div className="promo-article-prices">
                      <span className="promo-original-price">{formatPriceLabelFromUsdCents(article.priceUsdCents)}</span>
                      {!useUniformPrice && (
                        <div className="promo-new-price-wrap">
                          <span className="promo-input-prefix">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Prix promo"
                            value={promoPrices[article.id] || ''}
                            onChange={(e) => setPromoPrice(article.id, e.target.value)}
                            className="promo-price-input"
                          />
                        </div>
                      )}
                      {savings > 0 && (
                        <span className="promo-discount-badge">-{savings}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Error ── */}
            {error && <div className="promo-error">{error}</div>}

            {/* ── Footer ── */}
            <div className="promo-footer">
              <button
                type="button"
                className="promo-btn promo-btn--next"
                disabled={!isValid}
                onClick={() => setStep('confirm')}
              >
                Continuer →
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── STEP 2: Confirm ── */}
            <div className="promo-confirm">
              <div className="promo-confirm-summary">
                <div className="promo-confirm-row">
                  <span>Articles en promotion</span>
                  <strong>{articles.length}</strong>
                </div>
                <div className="promo-confirm-row">
                  <span>Prix total original</span>
                  <span className="promo-original-price">{formatPriceLabelFromUsdCents(totalOriginal)}</span>
                </div>
                <div className="promo-confirm-row">
                  <span>Prix total promo</span>
                  <strong className="promo-new-total">{formatPriceLabelFromUsdCents(totalPromo)}</strong>
                </div>
                <div className="promo-confirm-row promo-confirm-row--saving">
                  <span>Réduction moyenne</span>
                  <span className="promo-saving-badge">-{totalSavingPct}%</span>
                </div>
              </div>

              {/* ── Recap articles ── */}
              <div className="promo-confirm-articles">
                {articles.map((a) => (
                  <div key={a.id} className="promo-confirm-article">
                    <span className="promo-confirm-article-name">{a.title}</span>
                    <span className="promo-original-price promo-confirm-orig">{formatPriceLabelFromUsdCents(a.priceUsdCents)}</span>
                    <span className="promo-confirm-arrow">→</span>
                    <strong className="promo-new-total">{formatPriceLabelFromUsdCents(getPromoCents(a.id))}</strong>
                  </div>
                ))}
              </div>

              {error && <div className="promo-error">{error}</div>}

              <div className="promo-footer promo-footer--dual">
                <button type="button" className="promo-btn promo-btn--back" onClick={() => setStep('edit')}>
                  ← Modifier
                </button>
                <button
                  type="button"
                  className="promo-btn promo-btn--publish"
                  disabled={saving}
                  onClick={() => void handleSavePromo(false)}
                >
                  {saving ? '...' : '📢 Publier la promotion'}
                </button>
                <button
                  type="button"
                  className="promo-btn promo-btn--boost"
                  disabled={saving}
                  onClick={() => void handleSavePromo(true)}
                >
                  {saving ? '...' : '⚡ Booster la promotion'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
