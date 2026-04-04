/**
 * Bloc Analytique partagé — BasicInsights + DeepInsights (premium)
 * Utilisé dans UserDashboard et BusinessDashboard.
 */

interface BasicInsightsData {
  activitySummary: { listings: number; negotiations: number; orders: number; revenueCents: number };
  marketPosition: { position: string; avgPriceCents: number; medianCents: number };
  trendingCategories: { category: string; count: number }[];
  recommendations: string[];
}

interface DeepInsightsData {
  funnel: { views: number; negotiations: number; orders: number; conversionRate: number };
  audienceSegments: { label: string; percent: number }[];
  velocityMetrics: { avgDaysToSell: number; fastestCategory?: string | null };
  predictiveScores: { churnRisk: number; growthPotential: number };
}

interface AnalyticsInsightsProps {
  t: (key: string) => string;
  basicInsights: BasicInsightsData | null;
  deepInsights: DeepInsightsData | null;
  analyticsLoading: boolean;
  hasAnalytics: boolean;
  hasPremiumAnalytics: boolean;
  formatMoney: (cents: number) => string;
}

export function DashboardAnalyticsInsights({
  t,
  basicInsights,
  deepInsights,
  analyticsLoading,
  hasPremiumAnalytics,
  formatMoney,
}: AnalyticsInsightsProps) {
  return (
    <section className="ud-glass-panel">
      <div className="ud-panel-head">
        <h2 className="ud-panel-title">📊 {t("user.analyticsTitle")}</h2>
        {analyticsLoading && <span className="ud-analytics-loading">Analyse…</span>}
      </div>

      {!analyticsLoading && !basicInsights && (
        <p className="ud-placeholder-text" style={{ margin: "12px 0" }}>Aucune donnée analytique disponible pour le moment.</p>
      )}

      {basicInsights && (
        <div className="ud-analytics-grid">
          {/* ── Résumé d'activité ── */}
          <div className="ud-analytics-card glass-container">
            <h3 className="ud-analytics-card-title">{t("user.analyticsSummary")}</h3>
            <div className="ud-analytics-stats">
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{basicInsights.activitySummary.listings}</span>
                <span className="ud-analytics-stat-label">Articles</span>
              </div>
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{basicInsights.activitySummary.negotiations}</span>
                <span className="ud-analytics-stat-label">Négociations</span>
              </div>
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{basicInsights.activitySummary.orders}</span>
                <span className="ud-analytics-stat-label">Commandes</span>
              </div>
              <div className="ud-analytics-stat">
                <span className="ud-analytics-stat-value">{formatMoney(basicInsights.activitySummary.revenueCents)}</span>
                <span className="ud-analytics-stat-label">Revenus</span>
              </div>
            </div>
          </div>

          {/* ── Position sur le marché ── */}
          <div className="ud-analytics-card glass-container">
            <h3 className="ud-analytics-card-title">{t("user.analyticsMarket")}</h3>
            <div className="ud-analytics-market">
              <span className={`ud-analytics-market-badge ud-analytics-market-badge--${basicInsights.marketPosition.position.toLowerCase().replace("_", "-")}`}>
                {basicInsights.marketPosition.position === "BELOW_MARKET" ? "📉 Sous le marché" :
                 basicInsights.marketPosition.position === "ON_MARKET" ? "📊 Au marché" : "📈 Au-dessus du marché"}
              </span>
              <p>Prix moyen : {formatMoney(basicInsights.marketPosition.avgPriceCents)}</p>
              <p>Médiane : {formatMoney(basicInsights.marketPosition.medianCents)}</p>
            </div>
          </div>

          {/* ── Catégories tendances ── */}
          {basicInsights.trendingCategories.length > 0 && (
            <div className="ud-analytics-card glass-container">
              <h3 className="ud-analytics-card-title">{t("user.analyticsTrending")}</h3>
              <div className="ud-analytics-trending">
                {basicInsights.trendingCategories.map((cat, i) => (
                  <div key={i} className="ud-analytics-trending-item">
                    <span>{cat.category}</span>
                    <span className="ud-analytics-trending-count">{cat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recommandations IA ── */}
          {basicInsights.recommendations.length > 0 && (
            <div className="ud-analytics-card ud-analytics-card--wide glass-container">
              <h3 className="ud-analytics-card-title">🤖 {t("user.analyticsRecommendations")}</h3>
              <ul className="ud-analytics-reco-list">
                {basicInsights.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* ── PREMIUM : Entonnoir de conversion ── */}
          {deepInsights && (
            <>
              <div className="ud-analytics-card glass-container">
                <h3 className="ud-analytics-card-title">{t("user.analyticsFunnel")}</h3>
                <div className="ud-analytics-funnel">
                  <div className="ud-analytics-funnel-step">
                    <span className="ud-analytics-funnel-label">Vues</span>
                    <span className="ud-analytics-funnel-value">{deepInsights.funnel.views}</span>
                  </div>
                  <span className="ud-analytics-funnel-arrow">→</span>
                  <div className="ud-analytics-funnel-step">
                    <span className="ud-analytics-funnel-label">Négociations</span>
                    <span className="ud-analytics-funnel-value">{deepInsights.funnel.negotiations}</span>
                  </div>
                  <span className="ud-analytics-funnel-arrow">→</span>
                  <div className="ud-analytics-funnel-step">
                    <span className="ud-analytics-funnel-label">Commandes</span>
                    <span className="ud-analytics-funnel-value">{deepInsights.funnel.orders}</span>
                  </div>
                  <span className="ud-analytics-funnel-rate">{(deepInsights.funnel.conversionRate * 100).toFixed(1)}% conversion</span>
                </div>
              </div>

              {/* ── Segments d'audience ── */}
              {deepInsights.audienceSegments.length > 0 && (
                <div className="ud-analytics-card glass-container">
                  <h3 className="ud-analytics-card-title">{t("user.analyticsAudience")}</h3>
                  <div className="ud-analytics-audience">
                    {deepInsights.audienceSegments.map((seg, i) => (
                      <div key={i} className="ud-analytics-audience-seg">
                        <span>{seg.label}</span>
                        <div className="ud-analytics-audience-bar">
                          <div className="ud-analytics-audience-fill" style={{ width: `${seg.percent}%` }} />
                        </div>
                        <span className="ud-analytics-audience-pct">{seg.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Vitesse de vente ── */}
              <div className="ud-analytics-card glass-container">
                <h3 className="ud-analytics-card-title">{t("user.analyticsVelocity")}</h3>
                <p>Jours moyens pour vendre : <strong>{deepInsights.velocityMetrics.avgDaysToSell}</strong></p>
                {deepInsights.velocityMetrics.fastestCategory && (
                  <p>Catégorie la plus rapide : <strong>{deepInsights.velocityMetrics.fastestCategory}</strong></p>
                )}
              </div>

              {/* ── Prédictions ── */}
              <div className="ud-analytics-card glass-container">
                <h3 className="ud-analytics-card-title">{t("user.analyticsPredictions")}</h3>
                <div className="ud-analytics-predictions">
                  <div className="ud-analytics-pred-item">
                    <span>Risque de churn</span>
                    <span className={`ud-analytics-pred-score ud-analytics-pred-score--${deepInsights.predictiveScores.churnRisk > 0.6 ? "high" : deepInsights.predictiveScores.churnRisk > 0.3 ? "medium" : "low"}`}>
                      {(deepInsights.predictiveScores.churnRisk * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="ud-analytics-pred-item">
                    <span>Potentiel de croissance</span>
                    <span className="ud-analytics-pred-score ud-analytics-pred-score--growth">
                      {(deepInsights.predictiveScores.growthPotential * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {hasPremiumAnalytics && !deepInsights && !analyticsLoading && (
            <div className="ud-analytics-card ud-analytics-card--wide glass-container">
              <p className="ud-placeholder-text" style={{ margin: 0 }}>Insights avancés en cours de calcul…</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
