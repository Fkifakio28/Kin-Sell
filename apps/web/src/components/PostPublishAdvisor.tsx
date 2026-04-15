/**
 * PostPublishAdvisor — Conseiller IA post-publication
 *
 * Modal intelligent affichée après publication d'un article, service,
 * produit, promotion ou lot. Affiche des recommandations multi-catégories :
 *   BOOST, ADS_PACK, ADS_PREMIUM, PLAN, ANALYTICS, CONTENT_TIP
 *
 * Chaque recommandation explique POURQUOI elle est pertinente.
 * Différencie clairement : abonnement, boost, publicité, analytics.
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocaleCurrency } from '../app/providers/LocaleCurrencyProvider';
import {
  postPublishAdvisor,
  type PostPublishReport,
  type PostPublishAdvice,
  type AdviceCategory,
  type FreemiumMeta,
} from '../lib/services/ai.service';
import './post-publish-advisor.css';

type PostPublishAdvisorProps = {
  /** single listing just published */
  listingId?: string;
  /** promo published */
  promoPublished?: boolean;
  /** bulk import count */
  bulkCount?: number;
  /** callback on close */
  onClose: () => void;
  /** callback after boost action */
  onBoost?: () => void;
};

const CATEGORY_CONFIG: Record<AdviceCategory, { color: string; label: string }> = {
  BOOST: { color: 'var(--color-primary, #6f58ff)', label: 'Boost' },
  ADS_PACK: { color: '#f59e0b', label: 'Publicité' },
  ADS_PREMIUM: { color: '#ec4899', label: 'Pub Premium' },
  PLAN: { color: '#10b981', label: 'Forfait' },
  ANALYTICS: { color: '#06b6d4', label: 'Analytique' },
  CONTENT_TIP: { color: '#f97316', label: 'Contenu' },
};

function getQualityColor(score: number): string {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#fbbf24';
  if (score >= 40) return '#fb923c';
  return '#f87171';
}

function getQualityLabel(score: number): string {
  if (score >= 80) return 'Excellente';
  if (score >= 60) return 'Bonne';
  if (score >= 40) return 'À améliorer';
  return 'Insuffisante';
}

export const PostPublishAdvisor: FC<PostPublishAdvisorProps> = ({
  listingId,
  promoPublished,
  bulkCount,
  onClose,
  onBoost,
}) => {
  const [report, setReport] = useState<PostPublishReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const navigate = useNavigate();
  const { t } = useLocaleCurrency();

  const freemium: FreemiumMeta | null = report?.freemium ?? null;
  const isLimited = freemium && freemium.mode !== 'FULL';

  useEffect(() => {
    let cancelled = false;
    const fetchAdvice = async () => {
      setLoading(true);
      try {
        const type = bulkCount ? 'BULK' : promoPublished ? 'PROMO' : 'SINGLE';
        const data = await postPublishAdvisor.getAdvice({
          type,
          listingId: listingId ?? undefined,
          promoCount: bulkCount ?? undefined,
        });
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError('Impossible de charger les recommandations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAdvice();
    return () => { cancelled = true; };
  }, [listingId, promoPublished, bulkCount]);

  const handleCTA = useCallback((advice: PostPublishAdvice) => {
    if (advice.isLocked) {
      navigate(freemium?.upgradeCtaTarget ?? '/forfaits');
      onClose();
      return;
    }
    if (advice.ctaAction === 'BOOST') {
      onBoost?.();
      onClose();
    } else {
      navigate(advice.ctaTarget);
      onClose();
    }
  }, [navigate, onClose, onBoost, freemium]);

  const toggleExpand = useCallback((idx: number) => {
    const adv = report?.advice[idx];
    if (adv?.isLocked) return;
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  }, [report]);

  return (
    <div className="ppa-overlay" onClick={onClose}>
      <div className="ppa-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="ppa-header">
          <div className="ppa-header-icon">🤖</div>
          <div className="ppa-header-text">
            <h3 className="ppa-title">{t('ppa.title', 'Conseiller IA Post-Publication')}</h3>
            <p className="ppa-subtitle">
              {loading
                ? t('ppa.analyzing', 'Analyse en cours…')
                : report?.listingTitle
                  ? `« ${report.listingTitle} »`
                  : report?.context === 'PROMO'
                    ? t('ppa.promoPublished', 'Promotion publiée')
                    : report?.context === 'BULK'
                      ? `${bulkCount ?? 0} ${t('ppa.articlesPublished', 'articles publiés')}`
                      : t('ppa.analysisSubtitle', 'Analyse de votre publication')}
            </p>
          </div>
          <button type="button" className="ppa-close" onClick={onClose}>✕</button>
        </header>

        {/* Body */}
        <div className="ppa-body">
          {loading ? (
            <div className="ppa-loading">
              <span className="ppa-spinner" />
              <p>{t('ppa.loadingMessage', "L'IA Kin-Sell analyse votre publication et prépare des recommandations personnalisées…")}</p>
            </div>
          ) : error ? (
            <div className="ppa-error">
              <p>{error}</p>
              <button type="button" className="ppa-btn ppa-btn--ghost" onClick={onClose}>{t('common.close', 'Fermer')}</button>
            </div>
          ) : report ? (
            <>
              {/* Freemium CTA Banner */}
              {isLimited && (
                <div className="ppa-freemium-banner">
                  <div className="ppa-freemium-banner-text">
                    <span className="ppa-freemium-icon">🔒</span>
                    <p>
                      {freemium.mode === 'PREVIEW'
                        ? t('ppa.freemiumPreview', '1 conseil offert — débloquez toutes les recommandations IA avec un forfait adapté.')
                        : t('ppa.freemiumLocked', 'Crédit gratuit épuisé — passez à un forfait supérieur pour accéder à toutes les recommandations.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ppa-btn ppa-btn--upgrade"
                    onClick={() => { navigate(freemium.upgradeCtaTarget); onClose(); }}
                  >
                    {freemium.upgradeCtaLabel}
                  </button>
                </div>
              )}

              {/* Quality Score */}
              <div className="ppa-quality">
                <div className="ppa-quality-bar-container">
                  <div className="ppa-quality-label">
                    <span>{t('ppa.qualityLabel', "Qualité de l'annonce")}</span>
                    <strong style={{ color: getQualityColor(report.qualityScore) }}>
                      {report.qualityScore}/100 — {getQualityLabel(report.qualityScore)}
                    </strong>
                  </div>
                  <div className="ppa-quality-bar">
                    <div
                      className="ppa-quality-fill"
                      style={{
                        width: `${report.qualityScore}%`,
                        background: getQualityColor(report.qualityScore),
                      }}
                    />
                  </div>
                </div>
                {report.qualitySignals.length > 0 && (
                  <div className="ppa-quality-signals">
                    {report.qualitySignals.map((s, i) => (
                      <span key={i} className="ppa-signal">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Badge */}
              <div className="ppa-ai-badge">
                <span>🤖</span> {t('ppa.aiBadge', 'Recommandations IA')} — {report.advice.length} suggestion{report.advice.length > 1 ? 's' : ''}
                {isLimited && freemium.blurredAdviceCount > 0 && (
                  <span className="ppa-ai-badge-lock"> · 🔒 {freemium.blurredAdviceCount} {t('ppa.locked', 'verrouillée(s)')}</span>
                )}
              </div>

              {/* Advice Cards */}
              <div className="ppa-advice-list">
                {report.advice.map((adv, idx) => {
                  const config = CATEGORY_CONFIG[adv.category];
                  const isExpanded = expandedIdx === idx;
                  const locked = !!adv.isLocked;

                  return (
                    <div
                      key={idx}
                      className={`ppa-advice-card ${isExpanded ? 'ppa-advice-card--expanded' : ''} ${locked ? 'ppa-advice-card--locked' : ''}`}
                      style={{ '--ppa-card-accent': config.color } as React.CSSProperties}
                    >
                      <div className="ppa-advice-top" onClick={() => locked ? handleCTA(adv) : toggleExpand(idx)}>
                        <span className="ppa-advice-icon">{locked ? '🔒' : adv.icon}</span>
                        <div className="ppa-advice-content">
                          <div className="ppa-advice-header-row">
                            <span className="ppa-advice-tag" style={{ borderColor: config.color, color: config.color }}>
                              {config.label}
                            </span>
                            <h4 className="ppa-advice-title">{adv.previewText ?? adv.title}</h4>
                          </div>
                          <p className={`ppa-advice-message ${locked ? 'ppa-advice-message--blur' : ''}`}>
                            {adv.message}
                          </p>
                        </div>
                        {locked ? (
                          <span className="ppa-advice-lock-badge">{t('ppa.seePlan', 'Voir le forfait')}</span>
                        ) : (
                          <span className={`ppa-advice-chevron ${isExpanded ? 'ppa-advice-chevron--open' : ''}`}>▾</span>
                        )}
                      </div>

                      {/* Lock overlay */}
                      {locked && (
                        <div className="ppa-advice-lock-overlay">
                          <button
                            type="button"
                            className="ppa-btn ppa-btn--upgrade-sm"
                            onClick={() => handleCTA(adv)}
                          >
                            🔓 {freemium?.upgradeCtaLabel ?? t('ppa.upgrade', 'Voir les forfaits')}
                          </button>
                        </div>
                      )}

                      {!locked && isExpanded && (
                        <div className="ppa-advice-detail">
                          <div className="ppa-advice-rationale">
                            <strong>💡 {t('ppa.why', 'Pourquoi ?')}</strong>
                            <p>{adv.rationale}</p>
                          </div>

                          {adv.metric && Object.keys(adv.metric).length > 0 && (
                            <div className="ppa-advice-metrics">
                              {Object.entries(adv.metric).map(([k, v]) => (
                                <div key={k} className="ppa-advice-metric">
                                  <span className="ppa-metric-value">{String(v)}</span>
                                  <span className="ppa-metric-label">{k}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            className="ppa-btn ppa-btn--primary"
                            onClick={() => handleCTA(adv)}
                          >
                            {adv.ctaLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Explainer */}
              <div className="ppa-explainer">
                <p>
                  <strong>📌 {t('ppa.explainerTitle', 'Comprendre les options')} :</strong>
                </p>
                <ul>
                  <li><span style={{ color: CATEGORY_CONFIG.BOOST.color }}>Boost</span> — {t('ppa.explainBoost', 'Visibilité immédiate, courte durée (1-14 jours)')}</li>
                  <li><span style={{ color: CATEGORY_CONFIG.ADS_PACK.color }}>{t('ppa.ads', 'Publicité')}</span> — {t('ppa.explainAds', 'Annonces sponsorisées ciblées, budget maîtrisé')}</li>
                  <li><span style={{ color: CATEGORY_CONFIG.PLAN.color }}>{t('ppa.plan', 'Forfait')}</span> — {t('ppa.explainPlan', 'Engagement mensuel, fonctionnalités permanentes')}</li>
                  <li><span style={{ color: CATEGORY_CONFIG.ANALYTICS.color }}>{t('ppa.analytics', 'Analytique')}</span> — {t('ppa.explainAnalytics', 'Insights et prédictions IA personnalisées')}</li>
                </ul>
              </div>

              {/* Dismiss */}
              <div className="ppa-actions">
                <button type="button" className="ppa-btn ppa-btn--ghost" onClick={onClose}>
                  {t('ppa.dismiss', 'Continuer sans changement')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
