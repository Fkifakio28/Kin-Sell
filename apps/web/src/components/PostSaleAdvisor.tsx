/**
 * PostSaleAdvisor — Conseiller IA post-vente
 *
 * Modal intelligent affichée après confirmation de livraison d'une vente.
 * Analyse le contexte de la vente et génère des recommandations
 * multi-catégories selon le scénario détecté :
 *
 *   FIRST_SALE      — première vente du vendeur
 *   REPEAT_SALE     — rythme de ventes soutenu
 *   CATEGORY_STREAK — spécialisation catégorie
 *   SALE_AFTER_PROMO — vente suite à une promo
 *   SALE_AFTER_BOOST — vente suite à un boost
 *   HIGH_VALUE_SALE  — vente haut de gamme
 *
 * Catégories : BOOST, ADS_CAMPAIGN, PLAN, ANALYTICS, STRATEGY, REPLICATE
 *
 * Ton premium, utile, orienté résultats — jamais générique.
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  postSaleAdvisor,
  type PostSaleReport,
  type PostSaleAdvice,
  type SaleAdviceCategory,
} from '../lib/services/ai.service';
import './post-sale-advisor.css';

type PostSaleAdvisorProps = {
  orderId: string;
  onClose: () => void;
  onBoost?: () => void;
};

const CATEGORY_CONFIG: Record<SaleAdviceCategory, { color: string; label: string }> = {
  BOOST: { color: 'var(--color-primary, #6f58ff)', label: 'Boost' },
  ADS_CAMPAIGN: { color: '#f59e0b', label: 'Publicité' },
  PLAN: { color: '#10b981', label: 'Forfait' },
  ANALYTICS: { color: '#06b6d4', label: 'Analytique' },
  STRATEGY: { color: '#ec4899', label: 'Stratégie' },
  REPLICATE: { color: '#f97316', label: 'Reproduire' },
};

export const PostSaleAdvisor: FC<PostSaleAdvisorProps> = ({
  orderId,
  onClose,
  onBoost,
}) => {
  const [report, setReport] = useState<PostSaleReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetchAdvice = async () => {
      setLoading(true);
      try {
        const data = await postSaleAdvisor.getAdvice(orderId);
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError('Impossible de charger les recommandations post-vente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAdvice();
    return () => { cancelled = true; };
  }, [orderId]);

  const handleCTA = useCallback((advice: PostSaleAdvice) => {
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
    <div className="psa-overlay" onClick={onClose}>
      <div className="psa-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="psa-header">
          <div className="psa-header-icon">🤖</div>
          <div className="psa-header-text">
            <h3 className="psa-title">Conseiller IA Post-Vente</h3>
            <p className="psa-subtitle">
              {loading
                ? 'Analyse de votre vente…'
                : report?.itemTitle
                  ? `Vente n°${report.saleNumber} — « ${report.itemTitle} »`
                  : 'Analyse post-vente'}
            </p>
          </div>
          <button type="button" className="psa-close" onClick={onClose}>✕</button>
        </header>

        {/* Body */}
        <div className="psa-body">
          {loading ? (
            <div className="psa-loading">
              <span className="psa-spinner" />
              <p>L'IA Kin-Sell analyse votre vente et prépare des recommandations personnalisées…</p>
            </div>
          ) : error ? (
            <div className="psa-error">
              <p>{error}</p>
              <button type="button" className="psa-btn psa-btn--ghost" onClick={onClose}>Fermer</button>
            </div>
          ) : report ? (
            <>
              {/* Congrats Banner */}
              <div className="psa-congrats">
                <p>{report.congratsMessage}</p>
                <div className="psa-sale-meta">
                  <span className="psa-meta-chip">💰 {report.orderTotal}</span>
                  <span className="psa-meta-chip">📂 {report.itemCategory}</span>
                  <span className="psa-meta-chip">📊 Vente n°{report.saleNumber}</span>
                </div>
              </div>

              {/* AI Badge */}
              {report.advice.length > 0 && (
                <div className="psa-ai-badge">
                  <span>🤖</span> Recommandations IA — {report.advice.length} suggestion{report.advice.length > 1 ? 's' : ''}
                </div>
              )}

              {/* Advice Cards */}
              <div className="psa-advice-list">
                {report.advice.map((adv, idx) => {
                  const config = CATEGORY_CONFIG[adv.category];
                  const isExpanded = expandedIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={`psa-advice-card ${isExpanded ? 'psa-advice-card--expanded' : ''}`}
                      style={{ '--psa-card-accent': config.color } as React.CSSProperties}
                    >
                      <div className="psa-advice-top" onClick={() => toggleExpand(idx)}>
                        <span className="psa-advice-icon">{adv.icon}</span>
                        <div className="psa-advice-content">
                          <div className="psa-advice-header-row">
                            <span className="psa-advice-tag" style={{ borderColor: config.color, color: config.color }}>
                              {config.label}
                            </span>
                            <h4 className="psa-advice-title">{adv.title}</h4>
                          </div>
                          <p className="psa-advice-message">{adv.message}</p>
                        </div>
                        <span className={`psa-advice-chevron ${isExpanded ? 'psa-advice-chevron--open' : ''}`}>▾</span>
                      </div>

                      {isExpanded && (
                        <div className="psa-advice-detail">
                          <div className="psa-advice-rationale">
                            <strong>💡 Pourquoi ?</strong>
                            <p>{adv.rationale}</p>
                          </div>

                          {adv.metric && Object.keys(adv.metric).length > 0 && (
                            <div className="psa-advice-metrics">
                              {Object.entries(adv.metric).map(([k, v]) => (
                                <div key={k} className="psa-advice-metric">
                                  <span className="psa-metric-value">{String(v)}</span>
                                  <span className="psa-metric-label">{k}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            className="psa-btn psa-btn--primary"
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
              {report.advice.length > 0 && (
                <div className="psa-explainer">
                  <p>
                    <strong>📌 Comprendre les options :</strong>
                  </p>
                  <ul>
                    <li><span style={{ color: CATEGORY_CONFIG.BOOST.color }}>Boost</span> — Visibilité immédiate pour vos articles similaires</li>
                    <li><span style={{ color: CATEGORY_CONFIG.ADS_CAMPAIGN.color }}>Publicité</span> — Campagnes sponsorisées ciblées</li>
                    <li><span style={{ color: CATEGORY_CONFIG.PLAN.color }}>Forfait</span> — Fonctionnalités avancées permanentes</li>
                    <li><span style={{ color: CATEGORY_CONFIG.ANALYTICS.color }}>Analytique</span> — Insights et prédictions personnalisées</li>
                    <li><span style={{ color: CATEGORY_CONFIG.STRATEGY.color }}>Stratégie</span> — Optimisation promo, prix et visibilité</li>
                    <li><span style={{ color: CATEGORY_CONFIG.REPLICATE.color }}>Reproduire</span> — Capitaliser sur ce qui fonctionne</li>
                  </ul>
                </div>
              )}

              {/* Dismiss */}
              <div className="psa-actions">
                <button type="button" className="psa-btn psa-btn--ghost" onClick={onClose}>
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
