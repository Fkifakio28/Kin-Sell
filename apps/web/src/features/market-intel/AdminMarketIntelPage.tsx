/**
 * AdminMarketIntelPage
 * ────────────────────
 * Vue admin dédiée /admin/market-intel.
 * Accès : ADMIN / SUPER_ADMIN (bypass billing côté backend).
 * Contenu :
 *  - Bandeau "Couverture" : sources, crawls récents, totaux, quota Gemini.
 *  - Formulaire "Lancer cycle agrégation" (crawl / aggregate / trends / arbitrage).
 *  - Onglets bruts : Produits / Salaires / Tendances / Arbitrage (toutes données, tous pays).
 * Rafraîchissement manuel uniquement (pas d'auto-refresh).
 */
import { useEffect, useState } from "react";
import {
  marketIntel,
  type MarketCoverage,
  type TriggerStep,
  type TriggerCrawlType,
} from "../../lib/services/market-intel.service";
import { MarketIntelPage } from "./MarketIntelPage";
import "./market-intel.css";

type AsyncState<T> = { data: T | null; loading: boolean; error: Error | null };
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancel = false;
    setState({ data: null, loading: true, error: null });
    fn()
      .then((d) => { if (!cancel) setState({ data: d, loading: false, error: null }); })
      .catch((e) => { if (!cancel) setState({ data: null, loading: false, error: e instanceof Error ? e : new Error(String(e)) }); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const ALL_STEPS: TriggerStep[] = ["crawl", "aggregate", "trends", "arbitrage"];
const CRAWL_TYPES: TriggerCrawlType[] = ["news", "marketplace", "classifieds", "jobs", "stats"];

export function AdminMarketIntelPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const coverageQ = useAsync<MarketCoverage>(() => marketIntel.coverage(), [reloadKey]);

  const [steps, setSteps] = useState<TriggerStep[]>(["aggregate", "trends", "arbitrage"]);
  const [crawlType, setCrawlType] = useState<TriggerCrawlType | "">("");
  const [batchSize, setBatchSize] = useState(20);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggleStep = (s: TriggerStep) =>
    setSteps((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));

  const runTrigger = async () => {
    if (steps.length === 0) {
      setErr("Sélectionne au moins une étape.");
      return;
    }
    setRunning(true);
    setErr(null);
    setReport(null);
    try {
      const res = await marketIntel.trigger({
        steps,
        crawlType: crawlType || undefined,
        crawlBatchSize: batchSize,
      });
      setReport(res.report);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur trigger");
    } finally {
      setRunning(false);
    }
  };

  const cov = coverageQ.data;

  return (
    <div className="market-intel">
      <header className="mi-head">
        <div>
          <h1>🛠️ Admin — Intelligence marché</h1>
          <p className="mi-sub">
            Vue brute complète. Pas de gating billing. Rafraîchissement manuel uniquement.
          </p>
        </div>
        <button className="mi-btn" onClick={() => setReloadKey((k) => k + 1)} disabled={coverageQ.loading}>
          🔄 {coverageQ.loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </header>

      {/* ── Couverture ── */}
      <section className="mi-card">
        <h2>📡 Couverture</h2>
        {coverageQ.loading && <p>Chargement couverture…</p>}
        {coverageQ.error && <p className="mi-error">{coverageQ.error.message}</p>}
        {cov && (
          <div className="mi-coverage-grid">
            <div>
              <h3>Totaux</h3>
              <ul className="mi-kv">
                <li>Produits : <b>{cov.totals.productCount}</b></li>
                <li>Prix observés : <b>{cov.totals.priceCount}</b></li>
                <li>Emplois : <b>{cov.totals.jobCount}</b></li>
                <li>Salaires : <b>{cov.totals.salaryCount}</b></li>
                <li>Tendances : <b>{cov.totals.trendCount}</b></li>
                <li>Arbitrages : <b>{cov.totals.arbCount}</b></li>
              </ul>
              <h3>Gemini ({cov.geminiQuota.date})</h3>
              <p>{cov.geminiQuota.used} / {cov.geminiQuota.cap} appels</p>
            </div>

            <div>
              <h3>Sources par pays</h3>
              <table className="mi-table">
                <thead><tr><th>Pays</th><th>Type</th><th>#</th></tr></thead>
                <tbody>
                  {cov.sourcesByCountry.map((r, i) => (
                    <tr key={i}><td>{r.countryCode}</td><td>{r.type}</td><td>{r._count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Crawls récents</h3>
              <table className="mi-table">
                <thead><tr><th>Source</th><th>Pays</th><th>Type</th><th>Dernier</th><th>Statut</th></tr></thead>
                <tbody>
                  {cov.recentCrawls.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.countryCode}</td>
                      <td>{r.type}</td>
                      <td>{r.lastCrawledAt ? new Date(r.lastCrawledAt).toLocaleString() : "—"}</td>
                      <td className={r.lastStatus === "OK" ? "mi-ok" : r.lastStatus === "ERROR" ? "mi-ko" : ""}>
                        {r.lastStatus ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Trigger manuel ── */}
      <section className="mi-card">
        <h2>⚙️ Lancer cycle agrégation</h2>
        <div className="mi-trigger">
          <div className="mi-steps">
            {ALL_STEPS.map((s) => (
              <label key={s} className="mi-chip">
                <input type="checkbox" checked={steps.includes(s)} onChange={() => toggleStep(s)} />
                {s}
              </label>
            ))}
          </div>
          <label>
            Type crawl :
            <select value={crawlType} onChange={(e) => setCrawlType(e.target.value as TriggerCrawlType | "")}>
              <option value="">(tous)</option>
              {CRAWL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Batch crawl :
            <input
              type="number"
              min={1}
              max={200}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
            />
          </label>
          <button className="mi-btn mi-btn-primary" onClick={runTrigger} disabled={running}>
            {running ? "⏳ En cours…" : "🚀 Lancer"}
          </button>
        </div>
        {err && <p className="mi-error">{err}</p>}
        {report && (
          <pre className="mi-report">{JSON.stringify(report, null, 2)}</pre>
        )}
      </section>

      {/* ── Données brutes ── */}
      <section className="mi-card">
        <h2>📊 Données brutes (tous pays, tous onglets)</h2>
        <p className="mi-sub">Admin bypass : les 4 onglets sont accessibles quel que soit le forfait.</p>
        <div className="mi-admin-inner">
          <MarketIntelPage />
        </div>
      </section>
    </div>
  );
}

export default AdminMarketIntelPage;
