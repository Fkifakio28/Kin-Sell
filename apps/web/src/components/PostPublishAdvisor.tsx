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
import {
  postPublishAdvisor,
  type PostPublishReport,
  type PostPublishAdvice,
  type AdviceCategory,
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
    if (advice.ctaAction === 'BOOST') {
      onBoost?.();
      onClose();
    } else {
      navigate(advice.ctaTarget);
      onClose();
    }
  }, [navigate, onClose, onBoost]);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <div className="ppa-overlay" onClick={onClose}>
      <div className="ppa-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="ppa-header">
          <div className="ppa-header-icon">🤖</div>
          <div className="ppa-header-text">
            <h3 className="ppa-title">Conseiller IA Post-Publication</h3>
            <p className="ppa-subtitle">
              {loading
                ? 'Analyse en cours…'
                : report?.listingTitle
                  ? `« ${report.listingTitle} »`
                  : report?.context === 'PROMO'
                    ? 'Promotion publiée'
                    : report?.context === 'BULK'
                      ? `${bulkCount ?? 0} articles publiés`
                      : 'Analyse de votre publication'}
            </p>
          </div>
          <button type="button" className="ppa-close" onClick={onClose}>✕</button>
        </header>

        {/* Body */}
        <div className="ppa-body">
          {loading ? (
            <div className="ppa-loading">
              <span className="ppa-spinner" />
              <p>L'IA Kin-Sell analyse votre publication et prépare des recommandations personnalisées…</p>
            </div>
          ) : error ? (
            <div className="ppa-error">
              <p>{error}</p>
              <button type="button" className="ppa-btn ppa-btn--ghost" onClick={onClose}>Fermer</button>
            </div>
          ) : report ? (
            <>
              {/* Quality Score */}
              <div className="ppa-quality">
                <div className="ppa-quality-bar-container">
                  <div className="ppa-quality-label">
                    <span>Qualité de l'annonce</span>
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
                <span>🤖</span> Recommandations IA — {report.advice.length} suggestion{report.advice.length > 1 ? 's' : ''}
              </div>

              {/* Advice Cards */}
              <div className="ppa-advice-list">
                {report.advice.map((adv, idx) => {
                  const config = CATEGORY_CONFIG[adv.category];
                  const isExpanded = expandedIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={`ppa-advice-card ${isExpanded ? 'ppa-advice-card--expanded' : ''}`}
                      style={{ '--ppa-card-accent': config.color } as React.CSSProperties}
                    >
                      <div className="ppa-advice-top" onClick={() => toggleExpand(idx)}>
                        <span className="ppa-advice-icon">{adv.icon}</span>
                        <div className="ppa-advice-content">
                          <div className="ppa-advice-header-row">
                            <span className="ppa-advice-tag" style={{ borderColor: config.color, color: config.color }}>
                              {config.label}
                            </span>
                            <h4 className="ppa-advice-title">{adv.title}</h4>
                          </div>
                          <p className="ppa-advice-message">{adv.message}</p>
                        </div>
                        <span className={`ppa-advice-chevron ${isExpanded ? 'ppa-advice-chevron--open' : ''}`}>▾</span>
                      </div>

                      {isExpanded && (
                        <div className="ppa-advice-detail">
                          <div className="ppa-advice-rationale">
                            <strong>💡 Pourquoi ?</strong>
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
                  <strong>📌 Comprendre les options :</strong>
                </p>
                <ul>
                  <li><span style={{ color: CATEGORY_CONFIG.BOOST.color }}>Boost</span> — Visibilité immédiate, courte durée (1-14 jours)</li>
                  <li><span style={{ color: CATEGORY_CONFIG.ADS_PACK.color }}>Publicité</span> — Annonces sponsorisées ciblées, budget maîtrisé</li>
                  <li><span style={{ color: CATEGORY_CONFIG.PLAN.color }}>Forfait</span> — Engagement mensuel, fonctionnalités permanentes</li>
                  <li><span style={{ color: CATEGORY_CONFIG.ANALYTICS.color }}>Analytique</span> — Insights et prédictions IA personnalisées</li>
                </ul>
              </div>

              {/* Dismiss */}
              <div className="ppa-actions">
                <button type="button" className="ppa-btn ppa-btn--ghost" onClick={onClose}>
                  Continuer sans changement
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
