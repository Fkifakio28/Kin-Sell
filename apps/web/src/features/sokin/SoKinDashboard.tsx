import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useScrollDirection } from "../../hooks/useScrollDirection";
import {
  sokinTrends,
  sokinAnalytics,
  type AuthorDashboard,
  type AuthorTrackingStats,
  type AuthorTip,
  type SoKinBasicInsights,
  type SoKinDeepInsights,
  type GlobalTrends,
} from "../../lib/services/sokin-analytics.service";
import { SeoMeta } from "../../components/SeoMeta";
import { SoKinMobileNav } from "./SoKinMobileNav";
import "./sokin-dashboard.css";

export function SoKinDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollDir = useScrollDirection();

  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [dashboard, setDashboard] = useState<AuthorDashboard | null>(null);
  const [tracking, setTracking] = useState<AuthorTrackingStats | null>(null);
  const [tips, setTips] = useState<AuthorTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [basicAI, setBasicAI] = useState<SoKinBasicInsights | null>(null);
  const [deepAI, setDeepAI] = useState<SoKinDeepInsights | null>(null);
  const [deepLocked, setDeepLocked] = useState(false);
  const [recs, setRecs] = useState<{ id: string; type: string; title: string; message: string; priority: number; status: string }[]>([]);
  const [dismissingRec, setDismissingRec] = useState<string | null>(null);
  const [globalTrends, setGlobalTrends] = useState<GlobalTrends | null>(null);

  const fetchAll = useCallback(async (p: "7d" | "30d") => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, trackRes] = await Promise.all([
        sokinTrends.authorDashboard(p),
        sokinTrends.trackingStats(),
      ]);
      setDashboard(dashRes);
      setTracking(trackRes.stats);

      // Tips may fail if user doesn't have premium — graceful
      try {
        const tipsRes = await sokinTrends.advisorTips(3);
        setTips(tipsRes.tips ?? []);
      } catch {
        setTips([]);
      }

      // ── AI Basic (tous utilisateurs) ──
      try {
        const basic = await sokinAnalytics.basicInsights();
        setBasicAI(basic);
      } catch {
        setBasicAI(null);
      }

      // ── AI Deep (premium only) ──
      try {
        const deep = await sokinAnalytics.deepInsights();
        setDeepAI(deep);
        setDeepLocked(false);
      } catch {
        setDeepAI(null);
        setDeepLocked(true);
      }

      // ── Recommandations IA ──
      try {
        const recsData = await sokinAnalytics.recommendations();
        setRecs((recsData ?? []).slice(0, 4));
      } catch {
        setRecs([]);
      }

      // ── Tendances globales ──
      try {
        const gt = await sokinTrends.globalTrends();
        setGlobalTrends(gt);
      } catch {
        setGlobalTrends(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de chargement";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void fetchAll(period);
  }, [user, period, fetchAll]);

  if (!user) {
    return (
      <div className="skd-root">
        <div className="skd-auth-msg">
          <p>Connectez-vous pour voir votre tableau de bord So-Kin.</p>
          <button className="skd-btn-primary" onClick={() => navigate("/login")}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const ov = dashboard?.overview;
  const tp = dashboard?.topPost;
  const prem = dashboard?.premium;

  return (
    <div className="skd-root">
      <SeoMeta title="Dashboard So-Kin — Kin-Sell" description="Vos performances So-Kin en un coup d'œil" />

      {/* ── Top Bar ── */}
      <header className={`skd-topbar${scrollDir === "down" ? " skd-topbar--hidden" : ""}`}>
        <button className="skd-topbar-btn" onClick={() => navigate(-1)} aria-label="Retour">
          ←
        </button>
        <h1 className="skd-topbar-title">📊 Dashboard So-Kin</h1>
        <div style={{ width: 40 }} />
      </header>

      <main className="skd-content">
        {/* ── Period Toggle ── */}
        <div className="skd-period">
          <button
            className={`skd-period-btn${period === "7d" ? " skd-period-btn--active" : ""}`}
            onClick={() => setPeriod("7d")}
          >
            7 jours
          </button>
          <button
            className={`skd-period-btn${period === "30d" ? " skd-period-btn--active" : ""}`}
            onClick={() => setPeriod("30d")}
          >
            30 jours
          </button>
        </div>

        {loading && (
          <div className="skd-loading">
            <div className="skd-spinner" />
            <p>Chargement de vos stats…</p>
          </div>
        )}

        {error && (
          <div className="skd-error">
            <p>{error}</p>
            <button className="skd-btn-primary" onClick={() => fetchAll(period)}>
              Réessayer
            </button>
          </div>
        )}

        {!loading && !error && dashboard && (
          <>
            {/* ── 1. Overview ── */}
            <section className="skd-card">
              <h2 className="skd-card-title">📈 Vue d'ensemble</h2>
              <div className="skd-stats-grid">
                <div className="skd-stat">
                  <span className="skd-stat-value">{ov?.views?.toLocaleString() ?? 0}</span>
                  <span className="skd-stat-label">Vues</span>
                </div>
                <div className="skd-stat">
                  <span className="skd-stat-value">{ov?.posts ?? 0}</span>
                  <span className="skd-stat-label">Posts</span>
                </div>
                <div className="skd-stat">
                  <span className="skd-stat-value">
                    {ov?.engagementRate != null ? `${(ov.engagementRate * 100).toFixed(1)}%` : "—"}
                  </span>
                  <span className="skd-stat-label">Engagement</span>
                </div>
                <div className="skd-stat">
                  <span className="skd-stat-value">{ov?.avgPotential?.toFixed(0) ?? "—"}</span>
                  <span className="skd-stat-label">Potentiel</span>
                </div>
              </div>
              {ov?.label && <p className="skd-card-hint">{ov.label}</p>}
            </section>

            {/* ── Tracking détail ── */}
            {tracking && (
              <section className="skd-card">
                <h2 className="skd-card-title">👁️ Interactions (7j)</h2>
                <div className="skd-stats-grid skd-stats-grid--3">
                  <div className="skd-stat skd-stat--sm">
                    <span className="skd-stat-value">{tracking.profileClicks}</span>
                    <span className="skd-stat-label">Profil</span>
                  </div>
                  <div className="skd-stat skd-stat--sm">
                    <span className="skd-stat-value">{tracking.listingClicks}</span>
                    <span className="skd-stat-label">Annonces</span>
                  </div>
                  <div className="skd-stat skd-stat--sm">
                    <span className="skd-stat-value">{tracking.contactClicks}</span>
                    <span className="skd-stat-label">Contacts</span>
                  </div>
                  <div className="skd-stat skd-stat--sm">
                    <span className="skd-stat-value">{tracking.commentOpens}</span>
                    <span className="skd-stat-label">Commentaires</span>
                  </div>
                  <div className="skd-stat skd-stat--sm">
                    <span className="skd-stat-value">{tracking.dmOpens}</span>
                    <span className="skd-stat-label">Messages</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── 2. Meilleur post ── */}
            {tp && (
              <section className="skd-card">
                <h2 className="skd-card-title">🏆 Meilleur post</h2>
                <p className="skd-card-text">{tp.label}</p>
                <div className="skd-row">
                  <span className="skd-chip">👁️ {tp.views} vues</span>
                  <span className="skd-chip">{tp.type}</span>
                </div>
                <button
                  className="skd-btn-primary skd-btn--mt"
                  onClick={() => navigate(`/sokin?post=${tp.id}`)}
                >
                  Voir le post
                </button>
              </section>
            )}

            {/* ── 3. Timing optimal (Premium) ── */}
            {prem?.bestTiming && (
              <section className="skd-card">
                <h2 className="skd-card-title">⏰ Timing optimal</h2>
                <p className="skd-card-text">{prem.bestTiming.label}</p>
                <div className="skd-row">
                  <span className="skd-chip skd-chip--accent">📅 {prem.bestTiming.day}</span>
                  <span className="skd-chip skd-chip--accent">🕐 {prem.bestTiming.hour}</span>
                </div>
              </section>
            )}

            {/* ── 4. Hashtags chauds (Premium) ── */}
            {prem?.hotHashtags && prem.hotHashtags.length > 0 && (
              <section className="skd-card">
                <h2 className="skd-card-title">🔥 Hashtags chauds</h2>
                <div className="skd-tags">
                  {prem.hotHashtags.map((h) => (
                    <button
                      key={h.hashtag}
                      className="skd-tag"
                      onClick={() => navigate(`/sokin?q=${encodeURIComponent(h.hashtag)}`)}
                    >
                      {h.hashtag}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── 5. Ville dominante (Premium) ── */}
            {prem?.topCity && (
              <section className="skd-card">
                <h2 className="skd-card-title">📍 Ville dominante</h2>
                <p className="skd-card-text">{prem.topCity.label}</p>
                <div className="skd-row">
                  <span className="skd-chip skd-chip--accent">🏙️ {prem.topCity.city}</span>
                  <span className="skd-chip">👁️ {prem.topCity.views} vues</span>
                </div>
              </section>
            )}

            {/* ── Profil social/business (Premium) ── */}
            {prem?.socialVsBusiness && (
              <section className="skd-card">
                <h2 className="skd-card-title">🎯 Votre profil</h2>
                <p className="skd-card-text">{prem.socialVsBusiness.label}</p>
                <div className="skd-row">
                  <span className="skd-chip">Social: {prem.socialVsBusiness.social}</span>
                  <span className="skd-chip">Business: {prem.socialVsBusiness.business}</span>
                  <span className="skd-chip skd-chip--accent">{prem.socialVsBusiness.profile}</span>
                </div>
              </section>
            )}

            {/* ── Suggestion ── */}
            {dashboard.suggestion && (
              <section className="skd-card skd-card--suggestion">
                <h2 className="skd-card-title">💡 Suggestion</h2>
                <p className="skd-card-text">{dashboard.suggestion.message}</p>
                <button className="skd-btn-primary skd-btn--mt">
                  {dashboard.suggestion.actionLabel}
                </button>
              </section>
            )}

            {/* ── 6. Conseils IA ── */}
            {tips.length > 0 && (
              <section className="skd-card">
                <h2 className="skd-card-title">🤖 Conseils IA</h2>
                <div className="skd-tips">
                  {tips.map((t) => (
                    <div key={t.id} className="skd-tip">
                      <h3 className="skd-tip-title">{t.title}</h3>
                      <p className="skd-tip-msg">{t.message}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── 7. Recommandations actionnables ── */}
            {recs.length > 0 && (
              <section className="skd-card skd-card--recs-active">
                <h2 className="skd-card-title">🎯 Recommandations</h2>
                <div className="skd-recs-active">
                  {recs.map((r) => (
                    <div key={r.id} className={`skd-rec-active skd-rec-active--${r.type.toLowerCase()}`}>
                      <div className="skd-rec-active-body">
                        <h3 className="skd-rec-active-title">{r.title}</h3>
                        <p className="skd-rec-active-msg">{r.message}</p>
                      </div>
                      <button
                        type="button"
                        className="skd-rec-dismiss"
                        disabled={dismissingRec === r.id}
                        onClick={async () => {
                          setDismissingRec(r.id);
                          try {
                            await sokinAnalytics.dismissRecommendation(r.id);
                            setRecs((prev) => prev.filter((x) => x.id !== r.id));
                          } catch { /* noop */ }
                          finally { setDismissingRec(null); }
                        }}
                        aria-label="Masquer cette recommandation"
                        title="Masquer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ═══ AI ANALYTICS — BASIC (tous utilisateurs) ═══ */}
            {basicAI && (
              <>
                {/* ── Activité 30j ── */}
                <section className="skd-card skd-card--ai">
                  <h2 className="skd-card-title">🧠 Analyse IA — Activité</h2>
                  <div className="skd-stats-grid">
                    <div className="skd-stat">
                      <span className="skd-stat-value">{basicAI.activitySummary.activeListings}</span>
                      <span className="skd-stat-label">Annonces actives</span>
                    </div>
                    <div className="skd-stat">
                      <span className="skd-stat-value">{basicAI.activitySummary.negotiations}</span>
                      <span className="skd-stat-label">Négociations</span>
                    </div>
                    <div className="skd-stat">
                      <span className="skd-stat-value">{basicAI.activitySummary.orders}</span>
                      <span className="skd-stat-label">Commandes</span>
                    </div>
                    <div className="skd-stat">
                      <span className="skd-stat-value">
                        {basicAI.activitySummary.revenueCents > 0
                          ? `${(basicAI.activitySummary.revenueCents / 100).toLocaleString()} FC`
                          : "—"}
                      </span>
                      <span className="skd-stat-label">Revenus</span>
                    </div>
                  </div>
                </section>

                {/* ── Position marché ── */}
                <section className="skd-card skd-card--ai">
                  <h2 className="skd-card-title">📊 Position marché</h2>
                  <div className="skd-market-position">
                    <span
                      className="skd-market-badge"
                      data-position={basicAI.marketPosition.position}
                    >
                      {basicAI.marketPosition.position === "BELOW_MARKET"
                        ? "↓ Sous le marché"
                        : basicAI.marketPosition.position === "ON_MARKET"
                        ? "✓ Dans le marché"
                        : "↑ Au-dessus du marché"}
                    </span>
                    <p className="skd-card-hint">{basicAI.marketPosition.message}</p>
                  </div>
                </section>

                {/* ── Catégories tendance ── */}
                {basicAI.trendingCategories.length > 0 && (
                  <section className="skd-card skd-card--ai">
                    <h2 className="skd-card-title">📈 Catégories tendance</h2>
                    <div className="skd-trending-cats">
                      {basicAI.trendingCategories.map((cat) => (
                        <div key={cat.category} className="skd-trending-cat">
                          <span className="skd-trending-cat-name">{cat.category}</span>
                          <span className="skd-trending-cat-count">{cat.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Heure optimale + So-Kin summary ── */}
                <section className="skd-card skd-card--ai">
                  <h2 className="skd-card-title">⏰ Meilleure heure de publication</h2>
                  <div className="skd-best-hour">
                    <span className="skd-best-hour-value">{basicAI.bestPublicationHour}h</span>
                    <span className="skd-best-hour-hint">Publiez autour de cette heure pour maximiser la visibilité</span>
                  </div>
                  {basicAI.sokinSummary && (
                    <div className="skd-sokin-summary">
                      <div className="skd-stats-grid skd-stats-grid--3">
                        <div className="skd-stat skd-stat--sm">
                          <span className="skd-stat-value">{basicAI.sokinSummary.postCount}</span>
                          <span className="skd-stat-label">Posts So-Kin</span>
                        </div>
                        <div className="skd-stat skd-stat--sm">
                          <span className="skd-stat-value">{basicAI.sokinSummary.totalViews}</span>
                          <span className="skd-stat-label">Vues totales</span>
                        </div>
                        <div className="skd-stat skd-stat--sm">
                          <span className="skd-stat-value">{basicAI.sokinSummary.avgSocialScore.toFixed(0)}</span>
                          <span className="skd-stat-label">Score social moy.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* ── Recommandations IA ── */}
                {basicAI.recommendations.length > 0 && (
                  <section className="skd-card skd-card--ai skd-card--recs">
                    <h2 className="skd-card-title">💡 Recommandations IA</h2>
                    <ul className="skd-recs-list">
                      {basicAI.recommendations.map((rec, i) => (
                        <li key={i} className="skd-rec-item">{rec}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            {/* ═══ AI ANALYTICS — DEEP (premium) ═══ */}
            {deepAI && (
              <>
                <div className="skd-ai-deep-header">
                  <span className="skd-ai-deep-badge">✨ Analyse premium</span>
                </div>

                {/* ── Funnel de conversion ── */}
                <section className="skd-card skd-card--deep">
                  <h2 className="skd-card-title">🔄 Funnel de conversion</h2>
                  <div className="skd-funnel">
                    <div className="skd-funnel-step">
                      <span className="skd-funnel-val">{deepAI.funnelAnalysis.activeListings}</span>
                      <span className="skd-funnel-label">Annonces</span>
                    </div>
                    <span className="skd-funnel-arrow">→</span>
                    <div className="skd-funnel-step">
                      <span className="skd-funnel-val">{deepAI.funnelAnalysis.totalNegotiations}</span>
                      <span className="skd-funnel-label">Négociations</span>
                    </div>
                    <span className="skd-funnel-arrow">→</span>
                    <div className="skd-funnel-step">
                      <span className="skd-funnel-val">{deepAI.funnelAnalysis.ordersCompleted}</span>
                      <span className="skd-funnel-label">Commandes</span>
                    </div>
                  </div>
                  <div className="skd-funnel-rates">
                    <div className="skd-funnel-rate">
                      <span className="skd-funnel-rate-val">
                        {(deepAI.funnelAnalysis.negotiationConversionRate * 100).toFixed(1)}%
                      </span>
                      <span className="skd-funnel-rate-label">Conv. négociation</span>
                    </div>
                    <div className="skd-funnel-rate">
                      <span className="skd-funnel-rate-val">
                        {(deepAI.funnelAnalysis.cartAbandonment * 100).toFixed(1)}%
                      </span>
                      <span className="skd-funnel-rate-label">Abandon panier</span>
                    </div>
                    <div className="skd-funnel-rate">
                      <span className="skd-funnel-rate-val">
                        {(deepAI.funnelAnalysis.overallConversionRate * 100).toFixed(1)}%
                      </span>
                      <span className="skd-funnel-rate-label">Conv. globale</span>
                    </div>
                  </div>
                </section>

                {/* ── Audience ── */}
                <section className="skd-card skd-card--deep">
                  <h2 className="skd-card-title">👥 Segmentation audience</h2>
                  {deepAI.audienceSegmentation.cityBreakdown.length > 0 && (
                    <div className="skd-audience-block">
                      <h3 className="skd-audience-subtitle">Par ville</h3>
                      <div className="skd-audience-bars">
                        {deepAI.audienceSegmentation.cityBreakdown.slice(0, 5).map((c) => (
                          <div key={c.city} className="skd-audience-bar-row">
                            <span className="skd-audience-bar-label">{c.city}</span>
                            <div className="skd-audience-bar-track">
                              <div
                                className="skd-audience-bar-fill"
                                style={{ width: `${Math.min(c.percent, 100)}%` }}
                              />
                            </div>
                            <span className="skd-audience-bar-pct">{c.percent.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {deepAI.audienceSegmentation.categoryBreakdown.length > 0 && (
                    <div className="skd-audience-block">
                      <h3 className="skd-audience-subtitle">Par catégorie</h3>
                      <div className="skd-audience-cats">
                        {deepAI.audienceSegmentation.categoryBreakdown.slice(0, 5).map((cat) => (
                          <div key={cat.category} className="skd-audience-cat-row">
                            <span className="skd-audience-cat-name">{cat.category}</span>
                            <span className="skd-audience-cat-count">{cat.count} ventes</span>
                            <span className="skd-audience-cat-rev">
                              {(cat.revenueCents / 100).toLocaleString()} FC
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="skd-audience-retention">
                    <span className="skd-audience-retention-label">Taux de rétention acheteurs</span>
                    <span className="skd-audience-retention-val">
                      {(deepAI.audienceSegmentation.buyerRetentionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </section>

                {/* ── Vélocité ── */}
                <section className="skd-card skd-card--deep">
                  <h2 className="skd-card-title">⚡ Vélocité de vente</h2>
                  <div className="skd-velocity">
                    <span className="skd-velocity-badge" data-level={deepAI.velocityScore.label}>
                      {deepAI.velocityScore.label === "SLOW" ? "🐢 Lent" :
                       deepAI.velocityScore.label === "NORMAL" ? "🚶 Normal" :
                       deepAI.velocityScore.label === "FAST" ? "🚀 Rapide" : "⚡ En accélération"}
                    </span>
                    <span className="skd-velocity-score">{deepAI.velocityScore.score}/100</span>
                  </div>
                  <p className="skd-card-hint">{deepAI.velocityScore.insight}</p>
                </section>

                {/* ── Contexte compétitif ── */}
                <section className="skd-card skd-card--deep">
                  <h2 className="skd-card-title">🏅 Contexte compétitif</h2>
                  <p className="skd-card-text">
                    Rang <strong>{deepAI.competitorContext.categoryRank}</strong> sur{" "}
                    <strong>{deepAI.competitorContext.totalSellersInCategory}</strong> vendeurs dans votre catégorie
                  </p>
                  {deepAI.competitorContext.strengthAreas.length > 0 && (
                    <div className="skd-competitor-block">
                      <h3 className="skd-competitor-label">✅ Points forts</h3>
                      <div className="skd-competitor-tags">
                        {deepAI.competitorContext.strengthAreas.map((s, i) => (
                          <span key={i} className="skd-competitor-tag skd-competitor-tag--strength">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {deepAI.competitorContext.improvementAreas.length > 0 && (
                    <div className="skd-competitor-block">
                      <h3 className="skd-competitor-label">📌 À améliorer</h3>
                      <div className="skd-competitor-tags">
                        {deepAI.competitorContext.improvementAreas.map((s, i) => (
                          <span key={i} className="skd-competitor-tag skd-competitor-tag--improve">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* ── Prédictions + Automatisation ── */}
                {deepAI.predictiveSuggestions.length > 0 && (
                  <section className="skd-card skd-card--deep">
                    <h2 className="skd-card-title">🔮 Prédictions IA</h2>
                    <ul className="skd-recs-list">
                      {deepAI.predictiveSuggestions.map((s, i) => (
                        <li key={i} className="skd-rec-item skd-rec-item--predict">{s}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {deepAI.automationTriggers.length > 0 && (
                  <section className="skd-card skd-card--deep">
                    <h2 className="skd-card-title">🤖 Agents IA suggérés</h2>
                    <div className="skd-automation-list">
                      {deepAI.automationTriggers.map((t, i) => (
                        <div key={i} className="skd-automation-item">
                          <span className="skd-automation-agent">{t.agent}</span>
                          <span className="skd-automation-action">{t.action}</span>
                          <span className="skd-automation-priority" data-priority={t.priority}>
                            {t.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ── Deep insights locked — upsell ── */}
            {deepLocked && !deepAI && (
              <section className="skd-card skd-card--deep-locked">
                <div className="skd-deep-locked-icon">🔒</div>
                <h2 className="skd-card-title">Analyse IA avancée</h2>
                <p className="skd-card-text">
                  Funnel de conversion, segmentation audience, vélocité de vente,
                  prédictions IA et agents automatisés — réservés aux abonnés premium.
                </p>
                <button
                  className="skd-btn-primary skd-btn--mt"
                  onClick={() => navigate("/forfaits")}
                >
                  Débloquer l'analyse premium →
                </button>
              </section>
            )}

            {/* ═══ TENDANCES GLOBALES SO-KIN ═══ */}
            {globalTrends && (
              <section className="skd-card skd-card--trends">
                <h2 className="skd-card-title">🌍 Tendances globales</h2>
                <p className="skd-card-subtitle">Données des 7 derniers jours sur So-Kin</p>

                {/* Hashtags en vogue */}
                {globalTrends.topHashtags.length > 0 && (
                  <div className="skd-gt-block">
                    <h3 className="skd-gt-label">🔥 Hashtags populaires</h3>
                    <div className="skd-gt-tags">
                      {globalTrends.topHashtags.slice(0, 8).map((h) => (
                        <span
                          key={h.hashtag}
                          className="skd-gt-tag"
                          data-trend={h.trend}
                        >
                          {h.hashtag}
                          <span className="skd-gt-tag-stat">{h.usageCount}×</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hashtags émergents */}
                {globalTrends.emergingHashtags.length > 0 && (
                  <div className="skd-gt-block">
                    <h3 className="skd-gt-label">🆕 Hashtags émergents</h3>
                    <div className="skd-gt-tags">
                      {globalTrends.emergingHashtags.slice(0, 5).map((h) => (
                        <span key={h} className="skd-gt-tag skd-gt-tag--emerging">{h}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formats qui performent */}
                {globalTrends.topTypes.length > 0 && (
                  <div className="skd-gt-block">
                    <h3 className="skd-gt-label">📐 Formats performants</h3>
                    <div className="skd-gt-formats">
                      {globalTrends.topTypes.slice(0, 5).map((t) => (
                        <div key={t.postType} className="skd-gt-format-row">
                          <span className="skd-gt-format-type">{t.postType}</span>
                          <div className="skd-gt-format-stats">
                            <span>{t.postCount} posts</span>
                            <span>👁️ {t.avgViews} moy.</span>
                            <span>❤️ {t.avgEngagementRate}%</span>
                          </div>
                          <span className="skd-gt-format-trend" data-trend={t.trend}>
                            {t.trend === 'UP' ? '📈' : t.trend === 'STABLE' ? '➡️' : '📉'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Premium upsell si pas premium So-Kin ── */}
            {!prem && (
              <section className="skd-card skd-card--upsell">
                <h2 className="skd-card-title">✨ Débloquez plus</h2>
                <p className="skd-card-text">
                  Timing optimal, hashtags chauds, ville dominante, conseils IA…
                  Passez à un forfait premium pour débloquer toutes les analytics.
                </p>
                <button
                  className="skd-btn-primary skd-btn--mt"
                  onClick={() => navigate("/forfaits")}
                >
                  Voir les forfaits
                </button>
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Bottom Nav ── */}
      <SoKinMobileNav hidden={scrollDir === "down"} />
      <div className="sk-sub-bnav-spacer" />
    </div>
  );
}
