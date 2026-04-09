/**
 * Bloc Analytique Avancé — Diagnostic, Anomalies, Tendances, Profil vendeur
 * Consomme les endpoints /analytics/ai/diagnostic, anomalies, trends, seller-profile
 * Nécessite le palier PREMIUM.
 */
import { useEffect, useState } from "react";
import {
  analyticsAi,
  type DiagnosticReport,
  type AnomalyReport,
  type TrendAnalysis,
  type SellerProfile,
  type EnrichedAnalyticsReport,
} from "../../../lib/services/ai.service";

interface Props {
  hasPremiumAnalytics: boolean;
}

export function DashboardAdvancedAnalytics({ hasPremiumAnalytics }: Props) {
  const [diagnostic, setDiagnostic] = useState<DiagnosticReport | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyReport[]>([]);
  const [trends, setTrends] = useState<TrendAnalysis[]>([]);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [enriched, setEnriched] = useState<EnrichedAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasPremiumAnalytics) return;
    setLoading(true);
    Promise.allSettled([
      analyticsAi.diagnostic().then(setDiagnostic),
      analyticsAi.anomalies().then(setAnomalies),
      analyticsAi.trends().then(setTrends),
      analyticsAi.sellerProfile().then(setSellerProfile),
      analyticsAi.enriched().then(setEnriched),
    ]).finally(() => setLoading(false));
  }, [hasPremiumAnalytics]);

  if (!hasPremiumAnalytics) return null;
  if (loading) return (
    <section className="ud-glass-panel">
      <h2 className="ud-panel-title">🔬 Analytique Avancée</h2>
      <p className="ud-analytics-loading">Chargement…</p>
    </section>
  );

  const hasData = diagnostic || anomalies.length > 0 || trends.length > 0 || sellerProfile || enriched;
  if (!hasData) return null;

  return (
    <section className="ud-glass-panel">
      <div className="ud-panel-head">
        <h2 className="ud-panel-title">🔬 Analytique Avancée</h2>
      </div>

      <div className="ud-analytics-grid">
        {/* ── Diagnostic IA ── */}
        {diagnostic && (
          <div className="ud-analytics-card ud-analytics-card--wide glass-container">
            <h3 className="ud-analytics-card-title">🩺 Diagnostic</h3>
            <div className="ud-analytics-stats">
              <div className="ud-analytics-stat">
                <span className={`ud-analytics-stat-value ud-analytics-pred-score--${diagnostic.overallScore >= 70 ? "growth" : diagnostic.overallScore >= 40 ? "medium" : "high"}`}>
                  {diagnostic.overallScore}/100
                </span>
                <span className="ud-analytics-stat-label">Score global</span>
              </div>
            </div>
            {diagnostic.prioritizedActions.length > 0 && (
              <ul className="ud-analytics-reco-list">
                {diagnostic.prioritizedActions.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
            {diagnostic.issues.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <small style={{ opacity: 0.7 }}>{diagnostic.issues.length} problème(s) détecté(s)</small>
              </div>
            )}
          </div>
        )}

        {/* ── Anomalies ── */}
        {anomalies.length > 0 && (
          <div className="ud-analytics-card glass-container">
            <h3 className="ud-analytics-card-title">🚨 Anomalies</h3>
            <div className="ud-analytics-trending">
              {anomalies.map((a, i) => (
                <div key={i} className="ud-analytics-trending-item">
                  <span>{a.direction === "UP" ? "📈" : "📉"} {a.metric}</span>
                  <span className={`ud-analytics-trending-count ud-analytics-pred-score--${a.severity === "HIGH" ? "high" : a.severity === "MEDIUM" ? "medium" : "low"}`}>
                    {a.deviationPercent > 0 ? "+" : ""}{a.deviationPercent.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tendances ── */}
        {trends.length > 0 && (
          <div className="ud-analytics-card glass-container">
            <h3 className="ud-analytics-card-title">📈 Tendances</h3>
            <div className="ud-analytics-trending">
              {trends.map((t, i) => (
                <div key={i} className="ud-analytics-trending-item">
                  <span>
                    {t.direction === "GROWING" ? "🟢" : t.direction === "DECLINING" ? "🔴" : "⚪"} {t.metric}
                  </span>
                  <span className="ud-analytics-trending-count">
                    sem: {t.weekOverWeek > 0 ? "+" : ""}{t.weekOverWeek.toFixed(0)}% · mois: {t.monthOverMonth > 0 ? "+" : ""}{t.monthOverMonth.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Profil vendeur ── */}
        {sellerProfile && (
          <div className="ud-analytics-card glass-container">
            <h3 className="ud-analytics-card-title">👤 Profil Vendeur IA</h3>
            <div className="ud-analytics-stats">
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{sellerProfile.score}</span>
                <span className="ud-analytics-stat-label">Score</span>
              </div>
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{sellerProfile.lifecycle}</span>
                <span className="ud-analytics-stat-label">Cycle</span>
              </div>
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{sellerProfile.activeListings}</span>
                <span className="ud-analytics-stat-label">Articles actifs</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Intelligence Marché Enrichie ── */}
        {enriched && enriched.categories.length > 0 && (
          <div className="ud-analytics-card ud-analytics-card--wide glass-container">
            <h3 className="ud-analytics-card-title">🌍 Intelligence Marché</h3>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              Source : {enriched.overallConfidence.source} · Confiance : {(enriched.overallConfidence.confidence * 100).toFixed(0)}%
            </div>
            <div className="ud-analytics-trending">
              {enriched.categories.slice(0, 5).map((c, i) => (
                <div key={i} className="ud-analytics-trending-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <span><strong>{c.data.category}</strong> ({c.data.internalCount} annonces)</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                      {c.score.source} · {(c.score.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {c.data.externalDemand !== "UNKNOWN" && (
                      <span>Demande: {c.data.externalDemand === "HIGH" ? "🔥 Forte" : c.data.externalDemand === "MEDIUM" ? "📊 Moyenne" : "📉 Faible"}</span>
                    )}
                    {c.data.externalTrend !== "UNKNOWN" && (
                      <span>Tendance: {c.data.externalTrend === "GROWING" ? "📈 Croissance" : c.data.externalTrend === "DECLINING" ? "📉 Déclin" : "➡️ Stable"}</span>
                    )}
                    {c.data.competitorDensity !== "UNKNOWN" && (
                      <span>Concurrence: {c.data.competitorDensity}</span>
                    )}
                  </div>
                  {c.data.seasonalNote && (
                    <div style={{ fontSize: 11, opacity: 0.6, fontStyle: "italic" }}>🗓️ {c.data.seasonalNote}</div>
                  )}
                </div>
              ))}
            </div>
            {enriched.regionalDemand && (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
                <strong>📍 {enriched.regionalDemand.data.city}</strong> : {enriched.regionalDemand.data.marketSummary}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
