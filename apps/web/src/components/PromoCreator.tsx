/**
 * PromoCreator — Popup de création de promotion article(s) ou lot/bundle
 * Supports: ITEM promo, BUNDLE promo, scheduling, preview
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

type PromoMode = 'ITEM' | 'BUNDLE';

export const PromoCreator: FC<PromoCreatorProps> = ({
  articles,
  resolveMediaUrl,
  onClose,
  onPublished,
  onBoost,
}) => {
  const { formatPriceLabelFromUsdCents } = useLocaleCurrency();

  // Mode: ITEM (individual prices) or BUNDLE (one lot price)
  const [mode, setMode] = useState<PromoMode>(articles.length >= 2 ? 'BUNDLE' : 'ITEM');

  // ITEM mode state
  const [promoPrices, setPromoPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of articles) {
      init[a.id] = ((a.priceUsdCents * 0.8) / 100).toFixed(2);
    }
    return init;
  });
  const [useUniformPrice, setUseUniformPrice] = useState(articles.length > 1);
  const [uniformPriceStr, setUniformPriceStr] = useState('');

  // BUNDLE mode state
  const [bundlePriceStr, setBundlePriceStr] = useState('');

  // Scheduling
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [promoLabel, setPromoLabel] = useState('');

  const [step, setStep] = useState<'edit' | 'confirm' | 'done'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPromoPrice = (id: string, val: string) => {
    if (val && !/^\d*\.?\d{0,2}$/.test(val)) return;
    setPromoPrices((prev) => ({ ...prev, [id]: val }));
  };

  // ITEM mode: compute promo price in cents for each article
  const getPromoCents = (articleId: string): number => {
    if (useUniformPrice && uniformPriceStr) {
      return Math.round(parseFloat(uniformPriceStr) * 100) || 0;
    }
    const v = promoPrices[articleId];
    return v ? Math.round(parseFloat(v) * 100) || 0 : 0;
  };

  // BUNDLE mode: compute bundle total
  const bundleCents = bundlePriceStr ? Math.round(parseFloat(bundlePriceStr) * 100) || 0 : 0;
  const bundleOriginal = articles.reduce((s, a) => s + a.priceUsdCents, 0);

  // Validation
  const validationErrors: string[] = [];
  if (mode === 'ITEM') {
    for (const a of articles) {
      const cents = getPromoCents(a.id);
      if (cents <= 0) validationErrors.push(`"${a.title}" : prix promo manquant`);
      else if (cents >= a.priceUsdCents) validationErrors.push(`"${a.title}" : le prix promo doit être inférieur au prix original`);
    }
  } else {
    if (bundleCents <= 0) validationErrors.push('Prix du lot manquant');
    else if (bundleCents >= bundleOriginal) validationErrors.push('Le prix du lot doit être inférieur au total normal');
    if (articles.length < 2) validationErrors.push('Un lot nécessite au moins 2 articles');
  }
  const isValid = validationErrors.length === 0;

  // Savings
  const totalOriginal = bundleOriginal;
  const totalPromo = mode === 'ITEM'
    ? articles.reduce((s, a) => s + getPromoCents(a.id), 0)
    : bundleCents;
  const totalSavingPct = totalOriginal > 0 ? Math.round(((totalOriginal - totalPromo) / totalOriginal) * 100) : 0;

  const handleSavePromo = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const schedOpts = {
        promoLabel: promoLabel || undefined,
        startsAt: scheduleEnabled && startsAt ? new Date(startsAt).toISOString() : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };

      if (mode === 'BUNDLE') {
        await listingsApi.setBundlePromo(
          articles.map((a) => a.id),
          bundleCents,
          { ...schedOpts }
        );
      } else if (useUniformPrice && uniformPriceStr) {
        const cents = Math.round(parseFloat(uniformPriceStr) * 100);
        await listingsApi.setPromo(articles.map((a) => a.id), cents, true, { ...schedOpts });
      } else {
        const priceGroups = new Map<number, string[]>();
        for (const a of articles) {
          const cents = getPromoCents(a.id);
          const group = priceGroups.get(cents) || [];
          group.push(a.id);
          priceGroups.set(cents, group);
        }
        for (const [cents, ids] of priceGroups) {
          await listingsApi.setPromo(ids, cents, true, { ...schedOpts });
        }
      }
      setStep('done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // ── Done step ──
  if (step === 'done') {
    return (
      <div className="promo-overlay" onClick={onClose}>
        <div className="promo-popup promo-popup--done" onClick={(e) => e.stopPropagation()}>
          <div className="promo-done-header">
            <div className="promo-done-check">✓</div>
            <h3 className="promo-done-title">
              {mode === 'BUNDLE' ? 'Lot promo créé !' : 'Promotion créée !'}
            </h3>
            <p className="promo-done-subtitle">
              {articles.length} article{articles.length > 1 ? 's' : ''}{' '}
              {mode === 'BUNDLE' ? 'en lot' : 'en promotion'} · Réduction de {totalSavingPct}%
              {scheduleEnabled && startsAt && ' · Programmée'}
            </p>
          </div>

          <div className="promo-done-choices">
            <button type="button" className="promo-done-card promo-done-card--publish" onClick={() => { onPublished(); onClose(); }}>
              <span className="promo-done-card-icon">📢</span>
              <span className="promo-done-card-title">Publier la promotion</span>
              <span className="promo-done-card-desc">
                {scheduleEnabled ? 'La promotion sera activée automatiquement à l\'heure programmée' : 'Vos prix promo sont immédiatement visibles par les acheteurs'}
              </span>
              <span className="promo-done-card-action">Publier maintenant →</span>
            </button>

            <button type="button" className="promo-done-card promo-done-card--boost" onClick={() => { onBoost(); onClose(); }}>
              <span className="promo-done-card-icon">⚡</span>
              <span className="promo-done-card-title">Booster la promotion</span>
              <span className="promo-done-card-desc">
                Visibilité accrue · Apparaître en premier dans l'Explorer · Toucher plus d'acheteurs
              </span>
              <span className="promo-done-card-action">Configurer le boost →</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="promo-overlay" onClick={onClose}>
      <div className="promo-popup" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="promo-header">
          <div className="promo-header-left">
            <span className="promo-header-icon">{mode === 'BUNDLE' ? '📦' : '🏷️'}</span>
            <div>
              <h3 className="promo-title">
                {mode === 'BUNDLE' ? 'Créer un lot promo' : 'Créer une promotion'}
              </h3>
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
            {/* ── Mode selector (for 2+ articles) ── */}
            {articles.length >= 2 && (
              <div className="promo-mode-selector">
                <button
                  type="button"
                  className={`promo-mode-btn ${mode === 'ITEM' ? 'promo-mode-btn--active' : ''}`}
                  onClick={() => setMode('ITEM')}
                >
                  🏷️ Prix individuel
                </button>
                <button
                  type="button"
                  className={`promo-mode-btn ${mode === 'BUNDLE' ? 'promo-mode-btn--active' : ''}`}
                  onClick={() => setMode('BUNDLE')}
                >
                  📦 Lot / Bundle
                </button>
              </div>
            )}

            {mode === 'ITEM' ? (
              <>
                {/* ── Uniform price toggle ── */}
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
                          {savings > 0 && <span className="promo-discount-badge">-{savings}%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* ── BUNDLE mode ── */}
                <div className="promo-bundle-section">
                  <div className="promo-bundle-total-row">
                    <span className="promo-bundle-total-label">Total normal</span>
                    <span className="promo-original-price">{formatPriceLabelFromUsdCents(bundleOriginal)}</span>
                  </div>

                  <div className="promo-bundle-price-input">
                    <label className="promo-bundle-price-label">Prix du lot promo</label>
                    <div className="promo-new-price-wrap">
                      <span className="promo-input-prefix">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Prix du lot"
                        value={bundlePriceStr}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v || /^\d*\.?\d{0,2}$/.test(v)) setBundlePriceStr(v);
                        }}
                        className="promo-price-input promo-price-input--large"
                      />
                    </div>
                    {bundleCents > 0 && bundleCents < bundleOriginal && (
                      <span className="promo-discount-badge promo-discount-badge--big">
                        -{Math.round(((bundleOriginal - bundleCents) / bundleOriginal) * 100)}% sur le lot
                      </span>
                    )}
                  </div>

                  <div className="promo-bundle-label-input">
                    <label className="promo-bundle-price-label">Label personnalisé (optionnel)</label>
                    <input
                      type="text"
                      placeholder="ex: Offre Duo, Pack Rentrée…"
                      value={promoLabel}
                      onChange={(e) => setPromoLabel(e.target.value)}
                      className="promo-text-input"
                      maxLength={60}
                    />
                  </div>

                  {/* ── Articles included ── */}
                  <div className="promo-articles promo-articles--bundle">
                    {articles.map((article) => (
                      <div key={article.id} className="promo-article-row promo-article-row--compact">
                        <div className="promo-article-img">
                          {article.imageUrl ? (
                            <img src={resolveMediaUrl(article.imageUrl)} alt={article.title} />
                          ) : (
                            <span className="promo-article-placeholder">📦</span>
                          )}
                        </div>
                        <div className="promo-article-info">
                          <span className="promo-article-name">{article.title}</span>
                        </div>
                        <span className="promo-original-price">{formatPriceLabelFromUsdCents(article.priceUsdCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Scheduling section ── */}
            <div className="promo-schedule-section">
              <label className="promo-uniform-toggle">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />
                <span className="promo-uniform-slider" />
                <span className="promo-uniform-label">Programmer la promotion</span>
              </label>
              {scheduleEnabled && (
                <div className="promo-schedule-fields">
                  <div className="promo-schedule-field">
                    <label>Début</label>
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="promo-datetime-input"
                    />
                  </div>
                  <div className="promo-schedule-field">
                    <label>Fin (optionnel)</label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="promo-datetime-input"
                    />
                  </div>
                </div>
              )}
              {!scheduleEnabled && (
                <div className="promo-schedule-fields">
                  <div className="promo-schedule-field">
                    <label>Fin (optionnel)</label>
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="promo-datetime-input"
                    />
                  </div>
                </div>
              )}
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
              {mode === 'BUNDLE' && (
                <div className="promo-confirm-badge">📦 LOT PROMO</div>
              )}
              <div className="promo-confirm-summary">
                <div className="promo-confirm-row">
                  <span>Articles {mode === 'BUNDLE' ? 'dans le lot' : 'en promotion'}</span>
                  <strong>{articles.length}</strong>
                </div>
                <div className="promo-confirm-row">
                  <span>Prix total original</span>
                  <span className="promo-original-price">{formatPriceLabelFromUsdCents(totalOriginal)}</span>
                </div>
                <div className="promo-confirm-row">
                  <span>{mode === 'BUNDLE' ? 'Prix du lot' : 'Prix total promo'}</span>
                  <strong className="promo-new-total">{formatPriceLabelFromUsdCents(totalPromo)}</strong>
                </div>
                <div className="promo-confirm-row promo-confirm-row--saving">
                  <span>Réduction</span>
                  <span className="promo-saving-badge">-{totalSavingPct}%</span>
                </div>
                {scheduleEnabled && startsAt && (
                  <div className="promo-confirm-row">
                    <span>Programmée pour</span>
                    <strong>{new Date(startsAt).toLocaleString('fr-FR')}</strong>
                  </div>
                )}
                {expiresAt && (
                  <div className="promo-confirm-row">
                    <span>Expire le</span>
                    <strong>{new Date(expiresAt).toLocaleString('fr-FR')}</strong>
                  </div>
                )}
              </div>

              {/* ── Recap articles ── */}
              <div className="promo-confirm-articles">
                {articles.map((a) => (
                  <div key={a.id} className="promo-confirm-article">
                    <span className="promo-confirm-article-name">{a.title}</span>
                    <span className="promo-original-price promo-confirm-orig">{formatPriceLabelFromUsdCents(a.priceUsdCents)}</span>
                    {mode === 'ITEM' && (
                      <>
                        <span className="promo-confirm-arrow">→</span>
                        <strong className="promo-new-total">{formatPriceLabelFromUsdCents(getPromoCents(a.id))}</strong>
                      </>
                    )}
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
                  className="promo-btn promo-btn--next"
                  disabled={saving}
                  onClick={() => void handleSavePromo()}
                >
                  {saving ? 'Enregistrement…' : mode === 'BUNDLE' ? 'Créer le lot ✓' : 'Confirmer la promotion ✓'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
