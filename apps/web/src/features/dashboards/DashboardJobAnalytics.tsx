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

import { useEffect, useState, type FC } from "react";
import {
  jobAnalytics,
  type JobDemandMap,
  type JobMarketSnapshot,
  type JobApplicationsInsights,
} from "../../lib/services/ai.service";
import { FrustrationPanel } from "../../components/FrustrationPanel";
import "./dashboard-job-analytics.css";

interface Props {
  hide?: boolean;
  accountType?: "user" | "business";
}

export const DashboardJobAnalytics: FC<Props> = ({ hide, accountType = "user" }) => {
  const [snapshot, setSnapshot] = useState<JobMarketSnapshot | null>(null);
  const [demand, setDemand] = useState<JobDemandMap | null>(null);
  const [apps, setApps] = useState<JobApplicationsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hide) return;
    let cancelled = false;
    (async () => {
      try {
        const [snap, dem, ap] = await Promise.allSettled([
          jobAnalytics.marketSnapshot(),
          jobAnalytics.demandMap({ limit: 10 }),
          jobAnalytics.myApplicationsInsights(),
        ]);
        if (cancelled) return;
        if (snap.status === "fulfilled") setSnapshot(snap.value);
        if (dem.status === "fulfilled") setDemand(dem.value);
        if (ap.status === "fulfilled") setApps(ap.value);
        if (snap.status === "rejected" && dem.status === "rejected" && ap.status === "rejected") {
          setError("Impossible de charger les données emploi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hide]);

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

      {loading && <div className="dja-loading">Chargement des données emploi…</div>}
      {error && !loading && <div className="dja-error">{error}</div>}

      {!loading && snapshot && <MarketSnapshotCard data={snapshot} />}
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
        <p className="dja-hidden-note">
          {data.hiddenCount} zone{data.hiddenCount > 1 ? "s" : ""} supplémentaire{data.hiddenCount > 1 ? "s" : ""} en Premium.
        </p>
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

export default DashboardJobAnalytics;
