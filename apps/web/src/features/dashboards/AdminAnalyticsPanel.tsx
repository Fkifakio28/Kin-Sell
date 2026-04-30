/**
 * AdminAnalyticsPanel — Kin-Sell Analytique enrichi
 *
 * Service A : Market Intelligence (prix, tendances, concurrence, géographie, opportunités)
 * Service B : Case Study Studio (génération d'études de marché exportables)
 *
 * Palette admin : fond #F8FAFC, cartes #FFFFFF, texte #0F172A,
 *                 accent cyan #22D3EE, vert marché #34D399, ambre #F59E0B, danger #EF4444
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { admin } from "../../lib/services/admin.service";
import { AdminJobAnalyticsPanel } from "./AdminJobAnalyticsPanel";
import type {
  AnalytiqueData,
  MarketIntelligenceData,
  CaseStudyData,
  ExportHistoryItem,
  IaSource,
} from "../../lib/services/admin.service";

// ── Palette — Dark admin theme ──
const C = {
  bg: "var(--ad-bg, #120b2b)",
  card: "var(--ad-surface, rgba(35, 24, 72, 0.66))",
  text: "var(--ad-text-1, #ffffff)",
  text2: "var(--ad-text-2, #c7bedf)",
  text3: "var(--ad-text-3, #9d92bb)",
  border: "var(--ad-border, rgba(180, 160, 255, 0.24))",
  accent: "#6f58ff",
  cyan: "#22D3EE",
  green: "#4ecdc4",
  amber: "#ffd93d",
  danger: "#ff5c5c",
  success: "#22C55E",
} as const;

const money = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

// ── Tier definitions ──
const TIERS = [
  { key: "basic", label: "Basic", color: C.text2, desc: "Usage interne" },
  { key: "pro", label: "Pro", color: C.cyan, desc: "Premières études vendables" },
  { key: "business", label: "Business", color: C.green, desc: "Usage commercial externe" },
  { key: "premium", label: "Premium / Agency", color: C.amber, desc: "White-label, revente, export de masse" },
] as const;

type Tab = "overview" | "market-intel" | "case-study" | "exports" | "sources" | "jobs";

// ── Small helpers ──
const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}
  >
    {children}
  </span>
);

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 20,
      backdropFilter: "blur(10px)",
      ...style,
    }}
  >
    {children}
  </div>
);

const KpiCard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
  <Card style={{ textAlign: "center", padding: 16 }}>
    <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.accent }}>{value}</div>
    <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</div>}
  </Card>
);

const SectionTitle = ({ icon, text }: { icon: string; text: string }) => (
  <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "24px 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
    <span>{icon}</span> {text}
  </h3>
);

const TabBtn = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 18px",
      borderRadius: 8,
      border: active ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
      background: active ? `${C.accent}15` : C.card,
      color: active ? C.accent : C.text2,
      fontWeight: active ? 600 : 400,
      fontSize: 13,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
);

const ScoreBar = ({ value, max = 100, color }: { value: number; max?: number; color: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div style={{ flex: 1, height: 6, background: `${C.border}80`, borderRadius: 3 }}>
      <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", borderRadius: 3, background: color }} />
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, color }}>{value}</span>
  </div>
);

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function AdminAnalyticsPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);

  // Overview data
  const [overview, setOverview] = useState<AnalytiqueData | null>(null);

  // Market Intelligence
  const [miData, setMiData] = useState<MarketIntelligenceData | null>(null);
  const [miCity, setMiCity] = useState("");
  const [miCategory, setMiCategory] = useState("");
  const [miPeriod, setMiPeriod] = useState("30d");

  // Case Study
  const [csCity, setCsCity] = useState("");
  const [csCategory, setCsCategory] = useState("");
  const [csPeriod, setCsPeriod] = useState("30d");
  const [csTier, setCsTier] = useState("basic");
  const [csData, setCsData] = useState<CaseStudyData | null>(null);
  const [csGenerating, setCsGenerating] = useState(false);

  // Exports
  const [exports, setExports] = useState<ExportHistoryItem[]>([]);

  // Sources
  const [sources, setSources] = useState<IaSource[]>([]);
  const [sourceForm, setSourceForm] = useState({ type: "URL" as "URL" | "FILE", name: "", url: "", fileType: "", notes: "" });
  const [sourceMsg, setSourceMsg] = useState<string | null>(null);

  // Avoid double-fetch
  const fetchedRef = useRef(false);

  // ── Load overview on mount ──
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await admin.analytique();
      setOverview(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      loadOverview();
    }
  }, [loadOverview]);

  // ── Market Intelligence ──
  const loadMI = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (miCity) params.city = miCity;
      if (miCategory) params.category = miCategory;
      params.period = miPeriod;
      const data = await admin.marketIntelligence(params);
      setMiData(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [miCity, miCategory, miPeriod]);

  useEffect(() => {
    if (tab === "market-intel") loadMI();
  }, [tab, loadMI]);

  // ── Generate Case Study ──
  const generateStudy = async () => {
    if (!csCategory || !csCity) return;
    setCsGenerating(true);
    try {
      const data = await admin.generateCaseStudy({ category: csCategory, city: csCity, period: csPeriod, tier: csTier });
      setCsData(data);
    } catch { /* ignore */ }
    setCsGenerating(false);
  };

  // ── Load exports ──
  useEffect(() => {
    if (tab === "exports") {
      admin.exportHistory().then(setExports).catch(() => {});
    }
    if (tab === "sources") {
      admin.iaSources("analytique").then(r => setSources(r.sources)).catch(() => {});
    }
  }, [tab]);

  // ── CSV Export ──
  const exportCSV = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "")}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    admin.logExport({ type: "market-intelligence", title: filename, tier: csTier, format: "CSV", size: `${(csv.length / 1024).toFixed(1)} KB` }).catch(() => {});
  };

  // ── XML Export ──
  const exportXML = (data: Record<string, unknown>, rootTag: string, filename: string) => {
    const toXml = (obj: unknown, tag: string): string => {
      if (Array.isArray(obj)) return obj.map((item, i) => toXml(item, "item")).join("");
      if (typeof obj === "object" && obj !== null) {
        const inner = Object.entries(obj as Record<string, unknown>).map(([k, v]) => toXml(v, k)).join("");
        return `<${tag}>${inner}</${tag}>`;
      }
      return `<${tag}>${String(obj ?? "")}</${tag}>`;
    };
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(data, rootTag)}`;
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    admin.logExport({ type: "case-study", title: filename, tier: csTier, format: "XML", size: `${(xml.length / 1024).toFixed(1)} KB` }).catch(() => {});
  };

  // ── PDF Export (structured text report with external intelligence) ──
  const exportPDF = (study: CaseStudyData) => {
    const ext = study.externalIntelligence;
    const content = [
      study.title,
      `Généré le : ${new Date(study.generatedAt).toLocaleDateString("fr-FR")}`,
      `Tier: ${study.tier.toUpperCase()}`,
      "",
      "═══════════════════════════════════════",
      "RÉSUMÉ EXÉCUTIF",
      "═══════════════════════════════════════",
      study.executiveSummary,
      "",
      "═══════════════════════════════════════",
      "DONNÉES MARCHÉ (INTERNES KIN-SELL)",
      "═══════════════════════════════════════",
      `Articles actifs: ${study.marketData.totalListings}`,
      `Nouvelles publications: ${study.marketData.newListings}`,
      `Prix moyen: ${money(study.marketData.avgPriceUsdCents)}`,
      `Prix min: ${money(study.marketData.minPriceUsdCents)}`,
      `Prix max: ${money(study.marketData.maxPriceUsdCents)}`,
      `Prix médian: ${money(study.marketData.medianPriceUsdCents)}`,
      `Vendeurs: ${study.marketData.sellerCount}`,
      `Commandes livrées: ${study.marketData.ordersDelivered}`,
      `Revenu: ${money(study.marketData.revenueUsdCents)}`,
      "",
      "═══════════════════════════════════════",
      "ANALYSE INTERNE",
      "═══════════════════════════════════════",
      `Concurrence: ${study.analysis.competitionLevel}`,
      `Tendance: ${study.analysis.trendDirection}`,
      `Score demande: ${study.analysis.demandScore}/100`,
      `Score offre: ${study.analysis.supplyScore}/100`,
      `Score opportunité: ${study.analysis.opportunityScore}/100`,
      "",
      // External Intelligence section
      ...(ext?.available ? [
        "═══════════════════════════════════════",
        "INTELLIGENCE EXTERNE (DONNÉES FUSIONNÉES)",
        "═══════════════════════════════════════",
        `Confiance: ${ext.confidence}%`,
        ...(ext.fusedOpportunityScore != null ? [`Score opportunité fusionné (interne+externe): ${ext.fusedOpportunityScore}/100`] : []),
        ...(ext.externalDemand ? [`Demande externe: ${ext.externalDemand}`] : []),
        ...(ext.externalTrend ? [`Tendance externe: ${ext.externalTrend}`] : []),
        ...(ext.externalPriceRange ? [`Fourchette prix externe: ${money(ext.externalPriceRange.minUsdCents)} — ${money(ext.externalPriceRange.maxUsdCents)}`] : []),
        ...(ext.pricingAdjustmentPercent != null && Math.abs(ext.pricingAdjustmentPercent) > 1 ? [`Ajustement prix recommandé: ${ext.pricingAdjustmentPercent > 0 ? "+" : ""}${ext.pricingAdjustmentPercent.toFixed(1)}%`] : []),
        "",
        "── Prévisions de demande ──",
        ...(ext.demandForecast.sevenDays ? [`7 jours: ${ext.demandForecast.sevenDays}`] : []),
        ...(ext.demandForecast.thirtyDays ? [`30 jours: ${ext.demandForecast.thirtyDays}`] : []),
        ...(ext.seasonalNote ? ["", `Saisonnalité: ${ext.seasonalNote}`] : []),
        ...(ext.activeTriggers.length > 0 ? [
          "",
          "── Alertes & Triggers actifs ──",
          ...ext.activeTriggers.map((t, i) => `  ${i + 1}. [${t.trigger}] ${t.explanation} (sévérité: ${t.severity}/100)\n     → Action: ${t.recommendedAction}`),
        ] : []),
        ...(ext.fusionExplanation ? ["", `Analyse fusion: ${ext.fusionExplanation}`] : []),
        ...(ext.sourceAttribution.length > 0 ? ["", `Sources: ${ext.sourceAttribution.join(", ")}`] : []),
        "",
      ] : [
        "═══════════════════════════════════════",
        "INTELLIGENCE EXTERNE",
        "═══════════════════════════════════════",
        "Aucune donnée externe disponible pour cette catégorie/ville.",
        "",
      ]),
      "═══════════════════════════════════════",
      "RECOMMANDATIONS (INTERNES + EXTERNES)",
      "═══════════════════════════════════════",
      ...study.recommendations.map((r, i) => `${i + 1}. ${r}`),
      "",
      "───────────────────────────────────────",
      `Rapport généré par Kin-Sell IA · ${new Date().toLocaleDateString("fr-FR")}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${study.id}-report.txt`;
    a.click();
    URL.revokeObjectURL(url);
    admin.logExport({ type: "case-study", title: study.title, tier: study.tier, format: "PDF", size: `${(content.length / 1024).toFixed(1)} KB` }).catch(() => {});
  };

  // ── Unique categories from overview ──
  const categories = overview?.trendingCategories?.map(c => c.category) ?? [];
  const cities = overview?.topCities?.map(c => c.city) ?? [];

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════

  return (
    <div className="ad-content-block" style={{ background: C.bg, minHeight: 400 }}>
      <h2 className="ad-content-title" style={{ color: C.text }}>📈 Kin-Sell Analytique</h2>
      <p style={{ color: C.text2, marginBottom: 20, fontSize: 13 }}>
        Market Intelligence · Case Study Studio · Études de marché exportables
      </p>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <TabBtn active={tab === "overview"} label="📊 Vue globale" onClick={() => setTab("overview")} />
        <TabBtn active={tab === "market-intel"} label="🔍 Market Intelligence" onClick={() => setTab("market-intel")} />
        <TabBtn active={tab === "case-study"} label="📋 Case Study Studio" onClick={() => setTab("case-study")} />
        <TabBtn active={tab === "jobs"} label="🧑‍💼 Analytique Emploi" onClick={() => setTab("jobs")} />
        <TabBtn active={tab === "exports"} label="📦 Historique exports" onClick={() => setTab("exports")} />
        <TabBtn active={tab === "sources"} label="🔗 Sources & Enrichissement" onClick={() => setTab("sources")} />
      </div>

      {loading && <p style={{ color: C.text3, fontSize: 13 }}>Chargement…</p>}

      {/* ════════════════ TAB: Overview ════════════════ */}
      {tab === "overview" && overview && renderOverview(overview, categories, cities)}

      {/* ════════════════ TAB: Market Intelligence ════════════════ */}
      {tab === "market-intel" && renderMarketIntel(
        miData, miCity, setMiCity, miCategory, setMiCategory, miPeriod, setMiPeriod,
        categories, cities, loadMI, loading,
        (rows, fn) => exportCSV(rows, fn)
      )}

      {/* ════════════════ TAB: Case Study Studio ════════════════ */}
      {tab === "case-study" && renderCaseStudy(
        csData, csCity, setCsCity, csCategory, setCsCategory, csPeriod, setCsPeriod,
        csTier, setCsTier, csGenerating, generateStudy,
        categories, cities,
        (d) => exportPDF(d),
        (d, r, f) => exportXML(d, r, f)
      )}

      {/* ════════════════ TAB: Exports ════════════════ */}
      {tab === "exports" && renderExports(exports)}

      {/* ════════════════ TAB: Jobs Analytics (J5) ════════════════ */}
      {tab === "jobs" && <AdminJobAnalyticsPanel />}

      {/* ════════════════ TAB: Sources & Enrichissement ════════════════ */}
      {tab === "sources" && (
        <>
          <SectionTitle icon="🔗" text="Sources de données externes" />
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>➕ Ajouter une source</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <select value={sourceForm.type} onChange={e => setSourceForm(f => ({ ...f, type: e.target.value as "URL" | "FILE" }))} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card, minWidth: 100 }}>
                <option value="URL">🔗 Lien URL</option>
                <option value="FILE">📄 Fichier (XML/PDF/Word)</option>
              </select>
              <input placeholder="Nom de la source" value={sourceForm.name} onChange={e => setSourceForm(f => ({ ...f, name: e.target.value }))} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card, flex: 1, minWidth: 150 }} />
              {sourceForm.type === "URL" ? (
                <input placeholder="https://..." value={sourceForm.url} onChange={e => setSourceForm(f => ({ ...f, url: e.target.value }))} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card, flex: 1, minWidth: 200 }} />
              ) : (
                <select value={sourceForm.fileType} onChange={e => setSourceForm(f => ({ ...f, fileType: e.target.value }))} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card, minWidth: 100 }}>
                  <option value="">Type de fichier</option>
                  <option value="XML">XML</option>
                  <option value="PDF">PDF</option>
                  <option value="DOCX">Word (DOCX)</option>
                  <option value="CSV">CSV</option>
                </select>
              )}
              <input placeholder="Notes (optionnel)" value={sourceForm.notes} onChange={e => setSourceForm(f => ({ ...f, notes: e.target.value }))} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card, minWidth: 150 }} />
              <button disabled={!sourceForm.name || (sourceForm.type === "URL" && !sourceForm.url)} onClick={async () => {
                setSourceMsg(null);
                try {
                  await admin.iaAddSource({ domain: "analytique", ...sourceForm });
                  setSourceMsg("✅ Source ajoutée");
                  setSourceForm({ type: "URL", name: "", url: "", fileType: "", notes: "" });
                  admin.iaSources("analytique").then(r => setSources(r.sources)).catch(() => {});
                } catch { setSourceMsg("❌ Erreur"); }
              }} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (!sourceForm.name || (sourceForm.type === "URL" && !sourceForm.url)) ? 0.4 : 1 }}>
                Ajouter
              </button>
            </div>
            {sourceMsg && <p style={{ fontSize: 12, color: sourceMsg.startsWith("✅") ? C.success : C.danger, marginTop: 6 }}>{sourceMsg}</p>}
          </Card>

          {sources.length > 0 ? (
            <Card>
              <div className="ad-table-wrap">
                <table className="ad-table" style={{ fontSize: 12 }}>
                  <thead><tr><th>Type</th><th>Nom</th><th>URL / Fichier</th><th>Notes</th><th>Ajouté le</th><th>Action</th></tr></thead>
                  <tbody>
                    {sources.map(s => (
                      <tr key={s.id}>
                        <td><Badge color={s.type === "URL" ? C.cyan : C.amber}>{s.type === "URL" ? "🔗 URL" : `📄 ${s.fileType || "Fichier"}`}</Badge></td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url || "—"}</td>
                        <td style={{ fontSize: 11, color: C.text3 }}>{s.notes || "—"}</td>
                        <td style={{ fontSize: 11 }}>{new Date(s.addedAt).toLocaleDateString("fr-FR")}</td>
                        <td>
                          <button onClick={async () => { await admin.iaDeleteSource(s.id); admin.iaSources("analytique").then(r => setSources(r.sources)).catch(() => {}); }} style={{ background: "none", border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card><p style={{ color: C.text3, fontSize: 13, textAlign: "center" }}>Aucune source externe ajoutée. Ajoutez des liens URL, fichiers XML, PDF ou Word pour enrichir l'IA Analytique.</p></Card>
          )}
        </>
      )}

      {/* ── Tier Comparison ── */}
      {(tab === "case-study" || tab === "market-intel") && (
        <>
          <SectionTitle icon="📊" text="Comparaison des Tiers" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Fonctionnalité</th>
                    {TIERS.map(t => (
                      <th key={t.key} style={{ textAlign: "center" }}>
                        <Badge color={t.color}>{t.label}</Badge>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Données marché de base", "✅", "✅", "✅", "✅"],
                    ["Export CSV", "❌", "✅", "✅", "✅"],
                    ["Export XML structuré", "❌", "✅", "✅", "✅"],
                    ["Export PDF rapport", "❌", "❌", "✅", "✅"],
                    ["Case Study Studio", "❌", "✅", "✅", "✅"],
                    ["Analyse concurrentielle", "❌", "❌", "✅", "✅"],
                    ["Score d'opportunité", "❌", "❌", "✅", "✅"],
                    ["Recommandations IA", "❌", "❌", "✅", "✅"],
                    ["White-label / Revente", "❌", "❌", "❌", "✅"],
                    ["Export de masse", "❌", "❌", "❌", "✅"],
                  ].map(([feat, ...vals], i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{feat}</td>
                      {vals.map((v, j) => (
                        <td key={j} style={{ textAlign: "center", fontSize: 14 }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════
function renderOverview(d: AnalytiqueData, categories: string[], cities: string[]) {
  return (
    <>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Utilisateurs" value={d.users.total} sub={`+${d.users.new24h} (24h) · +${d.users.new7d} (7j)`} color={C.accent} />
        <KpiCard label="Articles actifs" value={d.listings.active} sub={`+${d.listings.new24h} (24h) / ${d.listings.total} total`} color={C.cyan} />
        <KpiCard label="Commandes (7j)" value={d.orders.last7d} sub={money(d.orders.revenue7dCents)} color={C.green} />
        <KpiCard label="Revenu (30j)" value={money(d.orders.revenue30dCents)} sub={`${d.orders.delivered30d} livrées`} color={C.amber} />
        <KpiCard label="Comptes Business" value={d.businesses} color={C.success} />
        <KpiCard label="Articles boostés" value={d.listings.boosted} color={C.danger} />
        <KpiCard label="Prix moyen" value={money(d.listings.avgPriceUsdCents)} color={C.text2} />
        <KpiCard label="Commandes total" value={d.orders.total} color={C.text2} />
      </div>

      {/* Trending Categories */}
      <SectionTitle icon="🔥" text="Catégories tendance (30j)" />
      <Card>
        <div className="ad-table-wrap">
          <table className="ad-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Catégorie</th><th>Articles</th></tr></thead>
            <tbody>
              {d.trendingCategories.map((c, i) => (
                <tr key={i}><td>{c.category}</td><td>{c.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Price by category */}
      <SectionTitle icon="💰" text="Prix par catégorie" />
      <Card>
        <div className="ad-table-wrap">
          <table className="ad-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Catégorie</th><th>Articles</th><th>Prix moy.</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              {d.categoryPrices.map((c, i) => (
                <tr key={i}>
                  <td>{c.category}</td>
                  <td>{c.count}</td>
                  <td style={{ color: C.accent, fontWeight: 600 }}>{money(c.avgPrice)}</td>
                  <td>{money(c.minPrice)}</td>
                  <td>{money(c.maxPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Cities */}
      <SectionTitle icon="🏙️" text="Top villes" />
      <Card>
        <div className="ad-table-wrap">
          <table className="ad-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Ville</th><th>Articles actifs</th></tr></thead>
            <tbody>
              {d.topCities.map((c, i) => (
                <tr key={i}><td>{c.city || "Non spécifié"}</td><td>{c.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Sellers */}
      {d.topSellers.length > 0 && (
        <>
          <SectionTitle icon="🏆" text="Top vendeurs (30j)" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead><tr><th>#</th><th>Vendeur</th><th>Commandes</th><th>Revenu</th></tr></thead>
                <tbody>
                  {d.topSellers.map((s, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{s.sellerName}</td>
                      <td>{s.orderCount}</td>
                      <td style={{ color: C.green, fontWeight: 600 }}>{money(s.revenueUsdCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Recent Orders */}
      {d.recentOrders.length > 0 && (
        <>
          <SectionTitle icon="📦" text="Commandes récentes (7j)" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead><tr><th>ID</th><th>Statut</th><th>Montant</th><th>Ville</th><th>Catégories</th><th>Date</th></tr></thead>
                <tbody>
                  {d.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontSize: 11, fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                      <td><Badge color={o.status === "DELIVERED" ? C.success : o.status === "PENDING" ? C.amber : C.text2}>{o.status}</Badge></td>
                      <td>{money(o.totalUsdCents)}</td>
                      <td>{o.city || "—"}</td>
                      <td>{o.categories.join(", ") || "—"}</td>
                      <td>{new Date(o.createdAt).toLocaleDateString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════
// MARKET INTELLIGENCE TAB
// ═══════════════════════════════════════
function renderMarketIntel(
  data: MarketIntelligenceData | null,
  city: string, setCity: (v: string) => void,
  category: string, setCategory: (v: string) => void,
  period: string, setPeriod: (v: string) => void,
  categories: string[], cities: string[],
  reload: () => void, loading: boolean,
  onExportCSV: (rows: Record<string, unknown>[], fn: string) => void,
) {
  const selectStyle: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
    fontSize: 12, color: C.text, background: C.card, minWidth: 120,
  };

  return (
    <>
      {/* Filters */}
      <Card style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <select value={city} onChange={e => setCity(e.target.value)} style={selectStyle}>
          <option value="">Toutes les villes</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
          <option value="90d">90 jours</option>
        </select>
        <button
          onClick={reload}
          style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.accent}`, background: `${C.accent}15`, color: C.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          🔄 Actualiser
        </button>
      </Card>

      {loading && <p style={{ color: C.text3, fontSize: 13 }}>Chargement Market Intelligence…</p>}

      {data && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Articles analysés" value={data.summary.totalListings} color={C.accent} />
            <KpiCard label="Prix moyen" value={money(data.summary.avgPrice)} color={C.cyan} />
            <KpiCard label="Prix min" value={money(data.summary.minPrice)} color={C.green} />
            <KpiCard label="Prix max" value={money(data.summary.maxPrice)} color={C.amber} />
          </div>

          {/* Category Distribution */}
          <SectionTitle icon="📊" text="Répartition par catégorie" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Catégorie</th><th>Articles</th><th>Prix moy.</th><th>Part marché</th></tr></thead>
                <tbody>
                  {data.categoryDistribution.map((c, i) => {
                    const comp = data.competition.find(x => x.category === c.category);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{c.category}</td>
                        <td>{c.count}</td>
                        <td style={{ color: C.cyan }}>{money(c.avgPrice)}</td>
                        <td>{comp ? `${comp.share}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                onClick={() => onExportCSV(
                  data.categoryDistribution.map(c => ({ category: c.category, articles: c.count, prixMoyen: (c.avgPrice / 100).toFixed(2) })),
                  "market-intel-categories.csv"
                )}
                style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}15`, color: C.green, fontSize: 11, cursor: "pointer" }}
              >
                📥 Export CSV
              </button>
            </div>
          </Card>

          {/* City Distribution */}
          <SectionTitle icon="🏙️" text="Répartition géographique" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Ville</th><th>Articles</th><th>Prix moy.</th></tr></thead>
                <tbody>
                  {data.cityDistribution.map((c, i) => (
                    <tr key={i}>
                      <td>{c.city}</td>
                      <td>{c.count}</td>
                      <td style={{ color: C.cyan }}>{money(c.avgPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Trends */}
          <SectionTitle icon="📈" text="Tendances récentes" />
          <Card>
            <div className="ad-table-wrap">
              <table className="ad-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Catégorie</th><th>Nouvelles publications</th></tr></thead>
                <tbody>
                  {data.trends.map((t, i) => (
                    <tr key={i}>
                      <td>{t.category}</td>
                      <td style={{ fontWeight: 600, color: C.green }}>+{t.newListings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Supply/Demand */}
          {data.supplyDemand.length > 0 && (
            <>
              <SectionTitle icon="⚖️" text="Offre vs Demande" />
              <Card>
                <div className="ad-table-wrap">
                  <table className="ad-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Catégorie</th><th>Ville</th><th>Demande</th><th>Offre</th><th>Tendance</th><th>Prix moy.</th></tr></thead>
                    <tbody>
                      {data.supplyDemand.map((sd, i) => (
                        <tr key={i}>
                          <td>{sd.category}</td>
                          <td>{sd.city}</td>
                          <td><ScoreBar value={sd.demandScore} color={C.cyan} /></td>
                          <td><ScoreBar value={sd.supplyScore} color={C.green} /></td>
                          <td>
                            <Badge color={sd.trend === "UP" ? C.success : sd.trend === "DOWN" ? C.danger : C.text3}>
                              {sd.trend === "UP" ? "↑" : sd.trend === "DOWN" ? "↓" : "→"} {sd.trend}
                            </Badge>
                          </td>
                          <td>{money(sd.avgPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* Opportunities */}
          {data.opportunities.length > 0 && (
            <>
              <SectionTitle icon="🎯" text="Opportunités détectées" />
              <Card>
                <div className="ad-table-wrap">
                  <table className="ad-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Catégorie</th><th>Ville</th><th>Score opportunité</th><th>Demande</th><th>Offre</th><th>Tendance</th></tr></thead>
                    <tbody>
                      {data.opportunities.map((op, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{op.category}</td>
                          <td>{op.city}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <ScoreBar value={op.opportunityScore} color={op.opportunityScore > 70 ? C.success : op.opportunityScore > 40 ? C.amber : C.text3} />
                            </div>
                          </td>
                          <td>{op.demandScore}</td>
                          <td>{op.supplyScore}</td>
                          <td><Badge color={op.trend === "UP" ? C.success : op.trend === "DOWN" ? C.danger : C.text3}>{op.trend}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* External Intelligence Forecasts */}
          {data.externalIntelligence?.available && data.externalIntelligence.forecasts.length > 0 && (
            <>
              <SectionTitle icon="🌐" text="Intelligence Externe (Données Fusionnées)" />
              <Card>
                <div className="ad-table-wrap">
                  <table className="ad-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Catégorie</th><th>Prévision 7j</th><th>Ajustement prix</th><th>Confiance</th><th>Alertes</th></tr></thead>
                    <tbody>
                      {data.externalIntelligence.forecasts.map((f, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{f.category}</td>
                          <td><Badge color={f.demandForecast7d === "RISING" ? C.success : f.demandForecast7d === "DECLINING" ? C.danger : C.text3}>{f.demandForecast7d}</Badge></td>
                          <td style={{ color: f.pricingAdjustPercent > 0 ? C.success : f.pricingAdjustPercent < 0 ? C.danger : C.text2 }}>
                            {f.pricingAdjustPercent > 0 ? "+" : ""}{f.pricingAdjustPercent.toFixed(1)}%
                          </td>
                          <td><ScoreBar value={f.confidence} color={f.confidence > 60 ? C.success : f.confidence > 30 ? C.amber : C.text3} /></td>
                          <td style={{ fontSize: 11, maxWidth: 200 }}>{f.triggers.length > 0 ? f.triggers.join(" · ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.externalIntelligence.sourceAttribution.length > 0 && (
                  <p style={{ color: C.text3, fontSize: 10, marginTop: 8, fontStyle: "italic" }}>
                    Sources : {data.externalIntelligence.sourceAttribution.join(", ")}
                  </p>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════
// CASE STUDY STUDIO TAB
// ═══════════════════════════════════════
function renderCaseStudy(
  data: CaseStudyData | null,
  city: string, setCity: (v: string) => void,
  category: string, setCategory: (v: string) => void,
  period: string, setPeriod: (v: string) => void,
  tier: string, setTier: (v: string) => void,
  generating: boolean, generate: () => void,
  categories: string[], cities: string[],
  onPDF: (d: CaseStudyData) => void,
  onXML: (d: Record<string, unknown>, root: string, fn: string) => void,
) {
  const selectStyle: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
    fontSize: 12, color: C.text, background: C.card, minWidth: 120,
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>📋 Générer une étude de marché</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <select value={city} onChange={e => setCity(e.target.value)} style={selectStyle}>
            <option value="">Choisir une ville</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle}>
            <option value="">Choisir une catégorie</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={selectStyle}>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="90d">90 jours</option>
          </select>
          <select value={tier} onChange={e => setTier(e.target.value)} style={selectStyle}>
            {TIERS.map(t => <option key={t.key} value={t.key}>{t.label} — {t.desc}</option>)}
          </select>
          <button
            onClick={generate}
            disabled={generating || !category || !city}
            style={{
              padding: "8px 20px", borderRadius: 8,
              border: "none", background: C.accent, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: generating || !category || !city ? "not-allowed" : "pointer",
              opacity: generating || !category || !city ? 0.5 : 1,
            }}
          >
            {generating ? "⏳ Génération…" : "🚀 Générer l'étude"}
          </button>
        </div>
      </Card>

      {/* Study Result */}
      {data && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{data.title}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>
                Généré le {new Date(data.generatedAt).toLocaleDateString("fr-FR")} · Tier: <Badge color={TIERS.find(t => t.key === data.tier)?.color ?? C.text2}>{data.tier.toUpperCase()}</Badge>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => onPDF(data)}
                style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.amber}`, background: `${C.amber}15`, color: C.amber, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
              >
                📄 PDF
              </button>
              <button
                onClick={() => onXML(data.metadata as Record<string, unknown>, "KinSellCaseStudy", `${data.id}.xml`)}
                style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}15`, color: C.green, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
              >
                📥 XML
              </button>
            </div>
          </div>

          {/* Executive Summary */}
          <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}30`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 6 }}>Résumé exécutif</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{data.executiveSummary}</div>
          </div>

          {/* Market Data Grid */}
          <SectionTitle icon="📊" text="Données marché" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <KpiCard label="Articles actifs" value={data.marketData.totalListings} color={C.accent} />
            <KpiCard label="Nouvelles pub." value={data.marketData.newListings} color={C.cyan} />
            <KpiCard label="Prix moyen" value={money(data.marketData.avgPriceUsdCents)} color={C.green} />
            <KpiCard label="Prix médian" value={money(data.marketData.medianPriceUsdCents)} color={C.text2} />
            <KpiCard label="Vendeurs" value={data.marketData.sellerCount} color={C.amber} />
            <KpiCard label="Commandes livrées" value={data.marketData.ordersDelivered} color={C.success} />
            <KpiCard label="Revenu" value={money(data.marketData.revenueUsdCents)} color={C.green} />
          </div>

          {/* Analysis */}
          <SectionTitle icon="🔬" text="Analyse" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Concurrence</div>
              <Badge color={data.analysis.competitionLevel === "Élevée" ? C.danger : data.analysis.competitionLevel === "Modérée" ? C.amber : C.success}>
                {data.analysis.competitionLevel}
              </Badge>
            </Card>
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Tendance</div>
              <Badge color={data.analysis.trendDirection === "UP" ? C.success : data.analysis.trendDirection === "DOWN" ? C.danger : C.text3}>
                {data.analysis.trendDirection === "UP" ? "↑ Hausse" : data.analysis.trendDirection === "DOWN" ? "↓ Baisse" : "→ Stable"}
              </Badge>
            </Card>
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Score demande</div>
              <ScoreBar value={data.analysis.demandScore} color={C.cyan} />
            </Card>
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Score offre</div>
              <ScoreBar value={data.analysis.supplyScore} color={C.green} />
            </Card>
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Score opportunité</div>
              <ScoreBar value={data.analysis.opportunityScore} color={data.analysis.opportunityScore > 70 ? C.success : data.analysis.opportunityScore > 40 ? C.amber : C.text3} />
            </Card>
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <>
              <SectionTitle icon="💡" text="Recommandations (Internes + Externes)" />
              <Card>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: C.text, lineHeight: 1.8 }}>
                  {data.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {/* External Intelligence */}
          {data.externalIntelligence?.available && (
            <>
              <SectionTitle icon="🌐" text="Intelligence Externe Fusionnée" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                {data.externalIntelligence.fusedOpportunityScore != null && (
                  <Card style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Score fusionné</div>
                    <ScoreBar value={data.externalIntelligence.fusedOpportunityScore} color={data.externalIntelligence.fusedOpportunityScore > 70 ? C.success : data.externalIntelligence.fusedOpportunityScore > 40 ? C.amber : C.text3} />
                  </Card>
                )}
                {data.externalIntelligence.externalDemand && (
                  <Card style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Demande externe</div>
                    <Badge color={data.externalIntelligence.externalDemand === "HIGH" ? C.success : data.externalIntelligence.externalDemand === "MEDIUM" ? C.amber : C.text3}>{data.externalIntelligence.externalDemand}</Badge>
                  </Card>
                )}
                {data.externalIntelligence.demandForecast.sevenDays && (
                  <Card style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Prévision 7j</div>
                    <Badge color={data.externalIntelligence.demandForecast.sevenDays === "RISING" ? C.success : data.externalIntelligence.demandForecast.sevenDays === "DECLINING" ? C.danger : C.text3}>{data.externalIntelligence.demandForecast.sevenDays}</Badge>
                  </Card>
                )}
                {data.externalIntelligence.pricingAdjustmentPercent != null && Math.abs(data.externalIntelligence.pricingAdjustmentPercent) > 1 && (
                  <Card style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Ajustement prix</div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: data.externalIntelligence.pricingAdjustmentPercent > 0 ? C.success : C.danger }}>
                      {data.externalIntelligence.pricingAdjustmentPercent > 0 ? "+" : ""}{data.externalIntelligence.pricingAdjustmentPercent.toFixed(1)}%
                    </span>
                  </Card>
                )}
                <Card style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Confiance</div>
                  <ScoreBar value={data.externalIntelligence.confidence} color={data.externalIntelligence.confidence > 60 ? C.success : data.externalIntelligence.confidence > 30 ? C.amber : C.text3} />
                </Card>
              </div>
              {data.externalIntelligence.activeTriggers.length > 0 && (
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>⚡ Alertes actives</div>
                  {data.externalIntelligence.activeTriggers.map((t, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: i < data.externalIntelligence!.activeTriggers.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: t.severity > 70 ? C.danger : t.severity > 40 ? C.amber : C.text2 }}>[{t.trigger}]</span>{" "}
                      <span style={{ color: C.text }}>{t.explanation}</span>
                      <div style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>→ {t.recommendedAction}</div>
                    </div>
                  ))}
                </Card>
              )}
              {data.externalIntelligence.seasonalNote && (
                <Card style={{ marginBottom: 12, padding: 14 }}>
                  <span style={{ fontSize: 12 }}>🗓️ <strong>Saisonnalité :</strong> {data.externalIntelligence.seasonalNote}</span>
                </Card>
              )}
              {data.externalIntelligence.sourceAttribution.length > 0 && (
                <p style={{ color: C.text3, fontSize: 10, fontStyle: "italic" }}>
                  Sources : {data.externalIntelligence.sourceAttribution.join(", ")}
                </p>
              )}
            </>
          )}

          {/* Metadata */}
          <SectionTitle icon="🏷️" text="Métadonnées (export XML)" />
          <Card style={{ background: "#F1F5F9", fontFamily: "monospace", fontSize: 11, overflowX: "auto" }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(data.metadata, null, 2)}</pre>
          </Card>
        </Card>
      )}
    </>
  );
}

// ═══════════════════════════════════════
// EXPORTS TAB
// ═══════════════════════════════════════
function renderExports(items: ExportHistoryItem[]) {
  return (
    <>
      <SectionTitle icon="📦" text="Historique des exports" />
      {items.length === 0 ? (
        <Card><p style={{ color: C.text3, fontSize: 13, textAlign: "center", margin: 0 }}>Aucun export enregistré</p></Card>
      ) : (
        <Card>
          <div className="ad-table-wrap">
            <table className="ad-table" style={{ fontSize: 12 }}>
              <thead><tr><th>ID</th><th>Type</th><th>Titre</th><th>Tier</th><th>Format</th><th>Taille</th><th>Date</th></tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>{e.id.slice(0, 12)}</td>
                    <td><Badge color={e.type === "case-study" ? C.amber : C.cyan}>{e.type}</Badge></td>
                    <td>{e.title}</td>
                    <td><Badge color={TIERS.find(t => t.key === e.tier)?.color ?? C.text2}>{e.tier}</Badge></td>
                    <td><Badge color={e.format === "CSV" ? C.green : e.format === "XML" ? C.accent : C.amber}>{e.format}</Badge></td>
                    <td>{e.size}</td>
                    <td>{new Date(e.createdAt).toLocaleDateString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
