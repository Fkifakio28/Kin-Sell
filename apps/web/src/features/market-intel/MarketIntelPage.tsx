import { useEffect, useMemo, useState } from "react";
import {
  marketIntel,
  MARKET_COUNTRIES,
  formatEurCents,
  formatLocalPrice,
  seasonLabel,
  type MarketCountry,
  type MarketProductRow,
  type MarketSalaryRow,
  type MarketTrendRow,
  type ArbitrageRow,
  type MarketMeResponse,
} from "../../lib/services/market-intel.service";
import "./market-intel.css";

type TabKey = "products" | "salaries" | "trends" | "arbitrage";

type AsyncState<T> = { loading: boolean; data: T | null; error: string | null };

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fn()
      .then((data) => { if (!cancelled) setState({ loading: false, data, error: null }); })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, data: null, error: (err as Error)?.message ?? "Erreur inconnue" });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function MarketIntelPage() {
  const [country, setCountry] = useState<MarketCountry>("CI");
  const meQ = useAsync<MarketMeResponse>(() => marketIntel.me(), []);

  const features = meQ.data?.features ?? [];
  const hasBasic = features.includes("MARKET_INTEL_BASIC");
  const hasPremium = features.includes("MARKET_INTEL_PREMIUM");
  const hasArbitrage = features.includes("ARBITRAGE_ENGINE");
  const isAdmin = meQ.data?.isAdmin ?? false;

  const availableTabs = useMemo<TabKey[]>(() => {
    const t: TabKey[] = [];
    if (hasBasic) t.push("products", "salaries");
    if (hasPremium) t.push("trends");
    if (hasArbitrage) t.push("arbitrage");
    return t;
  }, [hasBasic, hasPremium, hasArbitrage]);

  const [tab, setTab] = useState<TabKey>("products");
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  if (meQ.loading) return <div className="market-intel"><Loading /></div>;

  // Aucun abonnement → locked full screen
  if (availableTabs.length === 0) {
    return (
      <div className="market-intel">
        <header className="mi-head">
          <div>
            <h1>🌍 Intelligence marché</h1>
            <p className="mi-sub">Accès réservé aux forfaits Pro Vendeur / Business / Scale.</p>
          </div>
        </header>
        <ErrorView message="Abonnement requis pour accéder à Kin-Sell Analytique+." feature="MARKET_INTEL_BASIC" />
      </div>
    );
  }

  return (
    <div className="market-intel">
      <header className="mi-head">
        <div>
          <h1>🌍 Intelligence marché {isAdmin ? <span className="mi-admin-badge">ADMIN</span> : null}</h1>
          <p className="mi-sub">
            {isAdmin
              ? `Vue brute admin — ${MARKET_COUNTRIES.length} pays, toutes données.`
              : `Réponses ciblées pour votre forfait ${meQ.data?.planCode ?? ""} — ${MARKET_COUNTRIES.length} pays, mise à jour 24h.`}
          </p>
        </div>
        <CountryPicker value={country} onChange={setCountry} />
      </header>

      <nav className="mi-tabs" role="tablist">
        {hasBasic && <TabBtn active={tab === "products"}  onClick={() => setTab("products")}>📦 Marché</TabBtn>}
        {hasBasic && <TabBtn active={tab === "salaries"}  onClick={() => setTab("salaries")}>👷 Métiers</TabBtn>}
        {hasPremium && <TabBtn active={tab === "trends"}    onClick={() => setTab("trends")}>📈 Tendances</TabBtn>}
        {hasArbitrage && <TabBtn active={tab === "arbitrage"} onClick={() => setTab("arbitrage")}>🔀 Arbitrage</TabBtn>}
      </nav>

      <section className="mi-body">
        {tab === "products"  && <ProductsTab country={country} />}
        {tab === "salaries"  && <SalariesTab country={country} />}
        {tab === "trends"    && <TrendsTab country={country} />}
        {tab === "arbitrage" && <ArbitrageTab />}
      </section>
    </div>
  );
}

function CountryPicker({ value, onChange }: { value: MarketCountry; onChange: (c: MarketCountry) => void }) {
  return (
    <div className="mi-countries">
      {MARKET_COUNTRIES.map((c) => (
        <button
          key={c.code}
          type="button"
          className={`mi-country ${value === c.code ? "active" : ""}`}
          onClick={() => onChange(c.code)}
          title={c.label}
        >
          <span className="flag">{c.flag}</span>
          <span className="code">{c.code}</span>
        </button>
      ))}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={`mi-tab ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ProductsTab({ country }: { country: MarketCountry }) {
  const q = useAsync(() => marketIntel.products(country, { limit: 100 }), [country]);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} feature="MARKET_INTEL_BASIC" />;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Empty label="Aucune observation prix pour ce pays — le crawler tourne, patientez 24h." />;

  return (
    <table className="mi-table">
      <thead>
        <tr>
          <th>Produit</th>
          <th>Catégorie</th>
          <th>Prix médian local</th>
          <th>Médiane €</th>
          <th>Min – Max</th>
          <th>Échantillon</th>
          <th>Confiance</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r: MarketProductRow) => (
          <tr key={`${r.productSlug}-${r.collectedAt}`}>
            <td><strong>{r.productName}</strong>{r.brand ? <span className="brand"> · {r.brand}</span> : null}</td>
            <td>{r.categoryId}</td>
            <td>{formatLocalPrice(r.priceMedianLocal, r.localCurrency)}</td>
            <td><strong>{formatEurCents(r.priceMedianEurCents)}</strong></td>
            <td className="muted">
              {formatLocalPrice(r.priceMinLocal, r.localCurrency)} – {formatLocalPrice(r.priceMaxLocal, r.localCurrency)}
            </td>
            <td>{r.sampleSize}</td>
            <td><ConfidenceBar value={r.confidence} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SalariesTab({ country }: { country: MarketCountry }) {
  const q = useAsync(() => marketIntel.salaries(country, { limit: 100 }), [country]);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} feature="MARKET_INTEL_BASIC" />;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Empty label="Pas encore d'observations salariales pour ce pays." />;

  return (
    <table className="mi-table">
      <thead>
        <tr>
          <th>Métier</th>
          <th>Niveau</th>
          <th>Salaire médian</th>
          <th>Médiane €/{items[0]?.unit ?? "mois"}</th>
          <th>Min – Max</th>
          <th>Offres</th>
          <th>Confiance</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r: MarketSalaryRow) => (
          <tr key={`${r.jobSlug}-${r.collectedAt}`}>
            <td><strong>{r.jobName}</strong></td>
            <td>{r.seniorityLevel}</td>
            <td>{formatLocalPrice(r.salaryMedianLocal, r.localCurrency)}</td>
            <td><strong>{formatEurCents(r.salaryMedianEurCents)}</strong></td>
            <td className="muted">
              {formatLocalPrice(r.salaryMinLocal, r.localCurrency)} – {formatLocalPrice(r.salaryMaxLocal, r.localCurrency)}
            </td>
            <td>{r.sampleSize}</td>
            <td><ConfidenceBar value={r.confidence} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendsTab({ country }: { country: MarketCountry }) {
  const [scope, setScope] = useState<"product" | "job">("product");
  const q = useAsync(() => marketIntel.trends(country, scope, "weekly", 50), [country, scope]);

  if (q.error) return <ErrorView message={q.error} feature="MARKET_INTEL_PREMIUM" />;
  const items = q.data?.items ?? [];

  return (
    <>
      <div className="mi-subtabs">
        <button className={scope === "product" ? "active" : ""} onClick={() => setScope("product")}>Produits</button>
        <button className={scope === "job" ? "active" : ""} onClick={() => setScope("job")}>Métiers</button>
      </div>
      {q.loading ? <Loading /> : items.length === 0 ? (
        <Empty label="Aucune tendance calculée cette semaine." />
      ) : (
        <ol className="mi-trend-list">
          {items.map((r: MarketTrendRow) => {
            const label = r.product?.displayName ?? r.job?.displayName ?? "—";
            const delta = r.deltaPct ?? 0;
            return (
              <li key={r.rank} className="mi-trend-row">
                <span className="rank">#{r.rank}</span>
                <span className="label">{label}</span>
                {r.season ? <span className="season">{seasonLabel(r.season)}</span> : null}
                <span className={`delta ${delta >= 0 ? "up" : "down"}`}>
                  {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
                </span>
                <span className="score">score {r.score.toFixed(2)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function ArbitrageTab() {
  const q = useAsync(() => marketIntel.arbitrage({ limit: 50 }), []);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} feature="ARBITRAGE_ENGINE" />;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Empty label="Pas encore d'opportunités d'arbitrage détectées. Réessayez après le prochain cycle 24h." />;

  return (
    <div className="mi-arb-grid">
      {items.map((r: ArbitrageRow) => (
        <article key={r.id} className="mi-arb-card">
          <header>
            <span className="scope">{r.scope === "product" ? "📦" : "👷"}</span>
            <strong>{r.entityLabel}</strong>
            <span className="arb-score" title="Score 0..1">{(r.score * 100).toFixed(0)}</span>
          </header>
          <div className="arb-flow">
            <div className="arb-side shortage">
              <div className="cc">{flag(r.shortageCountry)} {r.shortageCountry}</div>
              <div className="lbl">Pénurie</div>
              <div className="idx">Demande {(r.demandIndex * 100).toFixed(0)}</div>
            </div>
            <div className="arb-arrow">→</div>
            <div className="arb-side surplus">
              <div className="cc">{flag(r.surplusCountry)} {r.surplusCountry}</div>
              <div className="lbl">Abondance</div>
              <div className="idx">Offre {(r.supplyIndex * 100).toFixed(0)}</div>
            </div>
          </div>
          {r.priceDeltaEurCents ? (
            <p className="arb-delta">Écart médian : <strong>{formatEurCents(r.priceDeltaEurCents)}</strong>{r.distanceKm ? ` · ~${r.distanceKm} km` : ""}</p>
          ) : null}
          <p className="arb-rationale">{r.rationale}</p>
        </article>
      ))}
    </div>
  );
}

function flag(country: string) {
  return MARKET_COUNTRIES.find((c) => c.code === country)?.flag ?? "🌍";
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="conf-bar" title={`${pct.toFixed(0)}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function Loading() { return <div className="mi-loading">Chargement…</div>; }
function Empty({ label }: { label: string }) { return <div className="mi-empty">{label}</div>; }

function ErrorView({ message, feature }: { message: string; feature: string }) {
  const locked = useMemo(() => /403|Abonnement/i.test(message), [message]);
  if (locked) {
    return (
      <div className="mi-locked">
        <div className="lock-icon">🔒</div>
        <h3>Fonctionnalité premium</h3>
        <p>{message}</p>
        <a className="mi-cta" href="/forfaits">Voir les forfaits</a>
        <small>Feature : {feature}</small>
      </div>
    );
  }
  return <div className="mi-error">Erreur : {message}</div>;
}
