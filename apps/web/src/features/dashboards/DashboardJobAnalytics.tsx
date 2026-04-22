/**
 * DashboardJobAnalytics — Chantier C Phase 7
 *
 * Dashboard emploi unifié :
 *  - Snapshot personnel (candidat + éventuellement recruteur)
 *  - Demand map (catégories et villes qui recrutent) — cap freemium
 *  - Insights sur mes candidatures (freemium)
 *
 * Consomme les endpoints /analytics/jobs/* (Phase 3) et respecte
 * le design system (variables CSS uniquement).
 */

import { useEffect, useMemo, useState, type FC } from "react";
import {
  jobAnalytics,
  type JobDemandMap,
  type JobMarketSnapshot,
  type JobApplicationsInsights,
  type JobDirectAnswer,
  type RegionalJobContext,
  type ScoredJobInsight,
} from "../../lib/services/ai.service";
import { FrustrationPanel } from "../../components/FrustrationPanel";
import { useAuth } from "../../app/providers/AuthProvider";
import "./dashboard-job-analytics.css";

interface Props {
  hide?: boolean;
  accountType?: "user" | "business";
}

export const DashboardJobAnalytics: FC<Props> = ({ hide, accountType = "user" }) => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<JobMarketSnapshot | null>(null);
  const [demand, setDemand] = useState<JobDemandMap | null>(null);
  const [apps, setApps] = useState<JobApplicationsInsights | null>(null);
  const [directAnswers, setDirectAnswers] = useState<JobDirectAnswer[]>([]);
  const [regional, setRegional] = useState<RegionalJobContext | null>(null);
  const [regionalLoading, setRegionalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dérive une catégorie pivot (première hotCategorie user)
  const pivotCategory = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.asCandidate.hotCategories[0]?.category ?? null;
  }, [snapshot]);

  useEffect(() => {
    if (hide) return;
    let cancelled = false;
    (async () => {
      try {
        const [snap, dem, ap, da] = await Promise.allSettled([
          jobAnalytics.marketSnapshot(),
          jobAnalytics.demandMap({ limit: 10 }),
          jobAnalytics.myApplicationsInsights(),
          jobAnalytics.directAnswers(),
        ]);
        if (cancelled) return;
        if (snap.status === "fulfilled") setSnapshot(snap.value);
        if (dem.status === "fulfilled") setDemand(dem.value);
        if (ap.status === "fulfilled") setApps(ap.value);
        if (da.status === "fulfilled") setDirectAnswers(da.value.answers ?? []);
        if (
          snap.status === "rejected" &&
          dem.status === "rejected" &&
          ap.status === "rejected"
        ) {
          setError("Impossible de charger les données emploi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hide]);

  // Regional context — chargé une fois qu'on a city/country/pivotCategory
  useEffect(() => {
    if (hide) return;
    const city = user?.profile?.city;
    const country = user?.profile?.country;
    if (!city || !country || !pivotCategory) return;
    let cancelled = false;
    setRegionalLoading(true);
    (async () => {
      try {
        const r = await jobAnalytics.regionalContext(pivotCategory, city, country);
        if (!cancelled) setRegional(r);
      } catch {
        /* silent — enrichissement best-effort */
      } finally {
        if (!cancelled) setRegionalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hide, user?.profile?.city, user?.profile?.country, pivotCategory]);

  if (hide) return null;

  return (
    <section className={`dja-root dja-root--${accountType}`} aria-label="Dashboard emploi">
      <header className="dja-header">
        <h2 className="dja-title">💼 Kin-Sell Emploi · Analytique</h2>
        <p className="dja-subtitle">
          Visualisez la demande du marché, votre alignement et vos candidatures.
        </p>
      </header>

      <FrustrationPanel accountType={accountType} />

      {directAnswers.length > 0 && <DirectAnswersCard answers={directAnswers} />}

      {loading && <div className="dja-loading">Chargement des données emploi…</div>}
      {error && !loading && <div className="dja-error">{error}</div>}

      {!loading && snapshot && <MarketSnapshotCard data={snapshot} />}

      {(regional || regionalLoading) && (
        <RegionalContextCard
          data={regional}
          loading={regionalLoading}
          category={pivotCategory}
          city={user?.profile?.city ?? null}
          country={user?.profile?.country ?? null}
        />
      )}

      {!loading && apps && <ApplicationsInsightsCard data={apps} />}
      {!loading && demand && <DemandMapCard data={demand} />}
    </section>
  );
};

/* ──────────────────────────────────────── */
/* Market Snapshot                          */
/* ──────────────────────────────────────── */

function MarketSnapshotCard({ data }: { data: JobMarketSnapshot }) {
  const c = data.asCandidate;
  const r = data.asRecruiter;
  return (
    <div className="dja-card">
      <h3 className="dja-card-title">Votre marché</h3>
      <div className="dja-kpi-row">
        <Kpi label="Offres pour vous" value={c.openJobsForMe.toString()} />
        <Kpi
          label="Alignement moyen"
          value={c.avgAlignmentScore != null ? `${Math.round(c.avgAlignmentScore)}%` : "—"}
        />
        {r && <Kpi label="Vos offres actives" value={r.activeJobs.toString()} />}
        {r && <Kpi label="Pool candidats" value={r.candidatePool.toString()} />}
      </div>
      {c.hotCategories.length > 0 && (
        <div className="dja-chips-block">
          <span className="dja-chips-label">Catégories qui recrutent</span>
          <div className="dja-chips">
            {c.hotCategories.slice(0, 6).map((h) => (
              <span key={h.category} className="dja-chip">
                {h.category}
                <em>{h.jobs}</em>
              </span>
            ))}
          </div>
        </div>
      )}
      {r && (
        <div className="dja-saturation">
          Saturation du pool :{" "}
          <strong className={`dja-sat dja-sat--${r.poolSaturation.toLowerCase()}`}>
            {r.poolSaturation}
          </strong>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────── */
/* Applications insights                    */
/* ──────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Envoyées",
  SHORTLISTED: "Pré-sélectionnées",
  INTERVIEW: "Entretiens",
  ACCEPTED: "Acceptées",
  REJECTED: "Refusées",
  WITHDRAWN: "Retirées",
};

const FRUSTRATION_LABELS: Record<string, string> = {
  NONE: "Rythme stable",
  LOW_RESPONSE_RATE: "Taux de réponse faible",
  STALE: "Candidatures sans suivi",
  LOW_ALIGNMENT: "Alignement insuffisant",
};

function ApplicationsInsightsCard({ data }: { data: JobApplicationsInsights }) {
  const statusEntries = Object.entries(data.byStatus).filter(([, n]) => n > 0);
  return (
    <div className="dja-card">
      <h3 className="dja-card-title">Mes candidatures</h3>
      <div className="dja-kpi-row">
        <Kpi label="Total" value={data.totalApplications.toString()} />
        <Kpi label="Taux de réponse" value={`${Math.round(data.responseRate * 100)}%`} />
        <Kpi
          label="Délai moyen"
          value={data.avgResponseDelayHours != null ? `${Math.round(data.avgResponseDelayHours)}h` : "—"}
        />
      </div>
      {statusEntries.length > 0 && (
        <div className="dja-statuses">
          {statusEntries.map(([st, n]) => (
            <div key={st} className="dja-status">
              <span className="dja-status-label">{STATUS_LABELS[st] ?? st}</span>
              <span className="dja-status-value">{n}</span>
            </div>
          ))}
        </div>
      )}
      {data.frustrationSignal !== "NONE" && (
        <div className="dja-frustration-signal">
          <span className="dja-frustration-dot" />
          {FRUSTRATION_LABELS[data.frustrationSignal]}
        </div>
      )}
      {data.bestAlignmentCategory && (
        <p className="dja-best-cat">
          Meilleure catégorie d'alignement : <strong>{data.bestAlignmentCategory}</strong>
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────── */
/* Demand map                                */
/* ──────────────────────────────────────── */

function DemandMapCard({ data }: { data: JobDemandMap }) {
  if (!data.zones.length) {
    return (
      <div className="dja-card">
        <h3 className="dja-card-title">Demand map</h3>
        <p className="dja-empty">Aucune zone détectée pour le moment.</p>
      </div>
    );
  }
  return (
    <div className="dja-card">
      <h3 className="dja-card-title">
        Zones qui recrutent
        <span className="dja-scope-badge">{data.scope === "CROSS_BORDER" ? "International" : "National"}</span>
      </h3>
      <div className="dja-zones">
        {data.zones.map((z, i) => (
          <div key={`${z.countryCode ?? ""}-${z.city}-${z.category}-${i}`} className={`dja-zone${z.locked ? " dja-zone--locked" : ""}`}>
            <div className="dja-zone-head">
              <strong className="dja-zone-city">{z.city}</strong>
              <span className="dja-zone-country">{z.country}</span>
            </div>
            <span className="dja-zone-cat">{z.category}</span>
            <div className="dja-zone-metrics">
              <span>
                <em>Offres</em>
                <b>{z.locked ? "🔒" : z.openJobs}</b>
              </span>
              <span>
                <em>Candidats</em>
                <b>{z.locked ? "🔒" : z.applicants}</b>
              </span>
              {z.avgSalaryUsd != null && !z.locked && (
                <span>
                  <em>Salaire moy.</em>
                  <b>{z.avgSalaryUsd} $</b>
                </span>
              )}
            </div>
            {z.topSkills.length > 0 && (
              <div className="dja-zone-skills">
                {z.topSkills.slice(0, 4).map((s) => <span key={s} className="dja-skill">{s}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
      {data.hiddenCount > 0 && (
        <a href="/pricing" className="dja-hidden-cta">
          <span className="dja-hidden-cta-icon">🔓</span>
          <span className="dja-hidden-cta-text">
            <strong>{data.hiddenCount} zone{data.hiddenCount > 1 ? "s" : ""} supplémentaire{data.hiddenCount > 1 ? "s" : ""}</strong>
            {" "}réservée{data.hiddenCount > 1 ? "s" : ""} aux forfaits Premium
          </span>
          <span className="dja-hidden-cta-arrow">→</span>
        </a>
      )}
    </div>
  );
}

/* ──────────────────────────────────────── */
/* KPI mini-widget                          */
/* ──────────────────────────────────────── */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="dja-kpi">
      <span className="dja-kpi-value">{value}</span>
      <span className="dja-kpi-label">{label}</span>
    </div>
  );
}

/* ──────────────────────────────────────── */
/* DirectAnswersCard — J4 rule-based        */
/* ──────────────────────────────────────── */

function DirectAnswersCard({ answers }: { answers: JobDirectAnswer[] }) {
  const sorted = [...answers].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return (
    <div className="dja-card dja-card--answers">
      <h3 className="dja-card-title">🎯 Conseils personnalisés</h3>
      <ul className="dja-answers">
        {sorted.slice(0, 6).map((a, i) => {
          const sevLabel =
            a.severity === "CRITICAL" ? "Critique" : a.severity === "WARN" ? "Attention" : "Info";
          return (
            <li
              key={`${a.rule ?? "ans"}-${i}`}
              className={`dja-answer dja-answer--${a.severity.toLowerCase()}`}
            >
              <div className="dja-answer-head">
                <span className={`dja-answer-sev dja-answer-sev--${a.severity.toLowerCase()}`}>
                  {sevLabel}
                </span>
                {a.rule && <span className="dja-answer-rule">{a.rule}</span>}
              </div>
              <p className="dja-answer-pain">{a.pain}</p>
              <p className="dja-answer-action">{a.action}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ──────────────────────────────────────── */
/* RegionalContextCard — J1 Gemini          */
/* ──────────────────────────────────────── */

function RegionalContextCard({
  data,
  loading,
  category,
  city,
  country,
}: {
  data: RegionalJobContext | null;
  loading: boolean;
  category: string | null;
  city: string | null;
  country: string | null;
}) {
  if (loading) {
    return (
      <div className="dja-card dja-card--regional">
        <h3 className="dja-card-title">🌍 Contexte régional (IA)</h3>
        <p className="dja-loading">Analyse du marché en cours…</p>
      </div>
    );
  }
  if (!data || !data.signals?.length) return null;
  const primary: ScoredJobInsight = data.signals[0];
  const s = primary.data;
  const trendIcon = s.trend === "GROWING" ? "📈" : s.trend === "DECLINING" ? "📉" : "➡️";
  const demandColor =
    s.demandLevel === "HIGH"
      ? "dja-demand--high"
      : s.demandLevel === "MEDIUM"
        ? "dja-demand--medium"
        : s.demandLevel === "LOW"
          ? "dja-demand--low"
          : "dja-demand--unknown";
  const satPct =
    s.saturation === "HIGH" ? 90 : s.saturation === "MEDIUM" ? 55 : s.saturation === "LOW" ? 20 : 0;

  return (
    <div className="dja-card dja-card--regional">
      <h3 className="dja-card-title">
        🌍 Contexte régional (IA)
        {category && city && country && (
          <span className="dja-regional-scope">
            {category} · {city}, {country}
          </span>
        )}
      </h3>

      <div className="dja-regional-grid">
        <div className={`dja-regional-demand ${demandColor}`}>
          <span className="dja-regional-label">Demande</span>
          <strong>{s.demandLevel}</strong>
        </div>
        <div className="dja-regional-trend">
          <span className="dja-regional-label">Tendance</span>
          <strong>{trendIcon} {s.trend}</strong>
        </div>
        {s.salaryRange && (
          <div className="dja-regional-salary">
            <span className="dja-regional-label">Salaire (USD)</span>
            <strong>
              {s.salaryRange.minUsd} – {s.salaryRange.maxUsd}
            </strong>
          </div>
        )}
        <div className="dja-regional-sat">
          <span className="dja-regional-label">Saturation · {s.saturation}</span>
          <div className="dja-sat-bar">
            <div className="dja-sat-fill" style={{ width: `${satPct}%` }} />
          </div>
        </div>
      </div>

      {s.topSkills.length > 0 && (
        <div className="dja-regional-skills">
          <span className="dja-regional-label">Compétences demandées</span>
          <div className="dja-chips">
            {s.topSkills.slice(0, 8).map((sk) => (
              <span key={sk} className="dja-skill">{sk}</span>
            ))}
          </div>
        </div>
      )}

      {s.insight && <p className="dja-regional-insight">{s.insight}</p>}

      {s.crossBorderOpportunity && (
        <div className="dja-regional-crossborder">
          ✈️ <strong>Opportunité transfrontalière :</strong> {s.crossBorderOpportunity}
        </div>
      )}

      {s.sources?.length > 0 && (
        <p className="dja-regional-sources">
          Sources : {s.sources.slice(0, 3).join(" · ")}
        </p>
      )}

      <p className="dja-regional-conf">
        Confiance : {primary.confidence.level} ({Math.round((primary.confidence.score ?? 0) * 100)}%)
      </p>
    </div>
  );
}

export default DashboardJobAnalytics;
