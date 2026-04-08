/**
 * AnalyticsCTAPanel — CTA intelligents vers Kin-Sell Analytique
 *
 * Affiche des incitations contextuelles à activer Analytique
 * selon l'activité réelle du vendeur :
 *
 *   - Plusieurs annonces actives → piloter le catalogue
 *   - Promotions lancées → mesurer le ROI
 *   - Historique de ventes → comprendre les succès
 *   - Hésitations de prix → prix optimal data-driven
 *   - Croissance business → piloter la croissance
 *   - Diversité catalogue → trouver sa niche
 *   - Résultats irréguliers → stabiliser avec la data
 *   - Signaux d'optimisation → passer de l'instinct à la data
 *
 * Différencie clairement MEDIUM (insights de base) et PREMIUM (prédictions IA).
 */

import { useState, useEffect, useCallback, type FC } from "react";
import { Link } from "react-router-dom";
import {
  analyticsCTA,
  type AnalyticsCTAReport,
  type AnalyticsCTA as AnalyticsCTAType,
} from "../lib/services/ai.service";
import "./analytics-cta.css";

interface AnalyticsCTAPanelProps {
  hide?: boolean;
}

const MEDIUM_FEATURES = [
  "Position marché (prix moyen, médian)",
  "Catégories tendance à Kinshasa",
  "Recommandations personnalisées",
  "Meilleur créneau de publication",
];

const PREMIUM_FEATURES = [
  "Funnel de conversion complet",
  "Segmentation audience",
  "Prédictions de croissance IA",
  "Score de risque de ralentissement",
];

export const AnalyticsCTAPanel: FC<AnalyticsCTAPanelProps> = ({ hide }) => {
  const [report, setReport] = useState<AnalyticsCTAReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await analyticsCTA.evaluate();
        if (!cancelled) setReport(data);
      } catch {
        // silencieux
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, []);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  if (hide || loading) return null;
  if (!report || report.ctas.length === 0) return null;

  return (
    <div className="acta-panel">
      {report.ctas.map((cta, idx) => (
        <AnalyticsCTACard
          key={cta.trigger}
          cta={cta}
          expanded={expandedIdx === idx}
          onToggle={() => toggleExpand(idx)}
          showTierDiff={report.currentTier === "NONE" && idx === 0}
        />
      ))}
    </div>
  );
};

// ── Card individuelle ──

interface AnalyticsCTACardProps {
  cta: AnalyticsCTAType;
  expanded: boolean;
  onToggle: () => void;
  showTierDiff?: boolean;
}

function AnalyticsCTACard({ cta, expanded, onToggle, showTierDiff }: AnalyticsCTACardProps) {
  const isPremium = cta.tier === "PREMIUM";

  return (
    <div className={`acta-card ${isPremium ? "acta-card--premium" : ""}`}>
      {/* Header — toujours visible */}
      <div className="acta-header" onClick={onToggle}>
        <span className="acta-icon">{cta.icon}</span>
        <div className="acta-header-content">
          <div className="acta-title-row">
            <span className={`acta-tier-badge ${isPremium ? "acta-tier-badge--premium" : "acta-tier-badge--medium"}`}>
              {isPremium ? "Premium" : "Analytique"}
            </span>
            <h4 className="acta-title">{cta.title}</h4>
          </div>
          <p className="acta-subtitle">{cta.subtitle}</p>
        </div>
        <span className={`acta-chevron ${expanded ? "acta-chevron--open" : ""}`}>▾</span>
      </div>

      {/* Body — expanded */}
      {expanded && (
        <div className="acta-body">
          <p className="acta-message">{cta.message}</p>

          {/* Why Now */}
          <div className="acta-why-now">
            <span className="acta-why-now-label">⏰ Pourquoi maintenant ?</span>
            <p className="acta-why-now-text">{cta.whyNow}</p>
          </div>

          {/* Value Pills */}
          <div className="acta-pills">
            {cta.valuePills.map((pill, i) => (
              <span key={i} className="acta-pill">{pill}</span>
            ))}
          </div>

          {/* Metrics */}
          {cta.metric && Object.keys(cta.metric).length > 0 && (
            <div className="acta-metrics">
              {Object.entries(cta.metric).slice(0, 3).map(([k, v]) => (
                <div key={k} className="acta-metric">
                  <span className="acta-metric-val">{String(v)}</span>
                  <span className="acta-metric-key">{k}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tier Differentiation */}
          {showTierDiff && (
            <div className="acta-tier-diff">
              <div className="acta-tier-col">
                <span className="acta-tier-col-title acta-tier-col-title--medium">
                  📊 Analytique (Medium)
                </span>
                <ul>
                  {MEDIUM_FEATURES.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div className="acta-tier-col">
                <span className="acta-tier-col-title acta-tier-col-title--premium">
                  🏆 Analytique Premium
                </span>
                <ul>
                  {PREMIUM_FEATURES.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="acta-cta-row">
            <Link to={cta.ctaTarget} className="acta-cta-btn">
              {cta.ctaLabel}
            </Link>
            <span className="acta-plan-info">
              <span className="acta-plan-name">{cta.planName}</span> · {cta.planPrice}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
