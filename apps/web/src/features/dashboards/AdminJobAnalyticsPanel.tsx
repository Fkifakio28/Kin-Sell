/**
 * AdminJobAnalyticsPanel — Chantier J5
 *
 * Admin UI pour :
 *   - Consulter les JobMarketSnapshot (filtrage country/city/category/onlyOverride)
 *   - Forcer un override manuel (upsert isManualOverride=true)
 *   - Retirer un override (unflag) ou supprimer le snapshot
 *   - Déclencher un refresh manuel (skip les overrides)
 *   - Voir les derniers ExternalIngestionRun focus JOB
 *   - Monitorer Gemini regional-job-context (cache hit/miss, reset)
 */
import { useCallback, useEffect, useState } from "react";
import {
  admin,
  type AdminJobSnapshot,
  type AdminJobIngestionRun,
  type JobGeminiMetrics,
  type JobSnapshotRefreshReport,
  type AdminJobDataGap,
} from "../../lib/services/admin.service";

const C = {
  bg: "var(--ad-bg, #120b2b)",
  card: "var(--ad-surface, rgba(35, 24, 72, 0.66))",
  text: "#ffffff",
  text2: "#c7bedf",
  text3: "#9d92bb",
  border: "rgba(180, 160, 255, 0.24)",
  accent: "#6f58ff",
  cyan: "#22D3EE",
  green: "#4ecdc4",
  amber: "#ffd93d",
  danger: "#ff5c5c",
  success: "#22C55E",
} as const;

const COUNTRY_CODES = ["CD", "GA", "CG", "AO", "CI", "GN", "SN", "MA"] as const;

const fmtDate = (s: string) => new Date(s).toLocaleDateString("fr-FR");
const fmtDateTime = (s: string) => new Date(s).toLocaleString("fr-FR");
const fmtUsd = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;

type Filters = {
  country: string;
  countryCode: string;
  city: string;
  category: string;
  onlyOverride: boolean;
};

const defaultForm = {
  country: "",
  countryCode: "",
  city: "",
  category: "",
  openJobs: 0,
  applicants: 0,
  avgSalaryUsd: "",
  trend7dPercent: "",
  topSkills: "",
  sourceNotes: "",
};

export function AdminJobAnalyticsPanel() {
  const [filters, setFilters] = useState<Filters>({
    country: "",
    countryCode: "",
    city: "",
    category: "",
    onlyOverride: false,
  });
  const [snapshots, setSnapshots] = useState<AdminJobSnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AdminJobIngestionRun[]>([]);
  const [gemini, setGemini] = useState<JobGeminiMetrics | null>(null);
  const [lastRefresh, setLastRefresh] = useState<JobSnapshotRefreshReport | null>(null);
  const [editing, setEditing] = useState<AdminJobSnapshot | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [busy, setBusy] = useState(false);
  const [dataGaps, setDataGaps] = useState<AdminJobDataGap[]>([]);
  const [dataGapsTotal, setDataGapsTotal] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snaps, g, r, gaps] = await Promise.all([
        admin.jobSnapshots({
          country: filters.country || undefined,
          countryCode: filters.countryCode || undefined,
          city: filters.city || undefined,
          category: filters.category || undefined,
          onlyOverride: filters.onlyOverride || undefined,
          limit: 100,
        }),
        admin.jobGeminiMetrics(),
        admin.jobIngestionRuns(20),
        admin.jobDataGaps(true, 30),
      ]);
      setSnapshots(snaps.items);
      setTotal(snaps.total);
      setGemini(g);
      setRuns(r.runs);
      setDataGaps(gaps.gaps);
      setDataGapsTotal(gaps.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openNew = () => {
    setEditing(null);
    setForm(defaultForm);
  };

  const openEdit = (s: AdminJobSnapshot) => {
    setEditing(s);
    setForm({
      country: s.country,
      countryCode: s.countryCode ?? "",
      city: s.city ?? "",
      category: s.category,
      openJobs: s.openJobs,
      applicants: s.applicants,
      avgSalaryUsd: s.avgSalaryUsdCents != null ? String(s.avgSalaryUsdCents / 100) : "",
      trend7dPercent: s.trend7dPercent != null ? String(s.trend7dPercent) : "",
      topSkills: s.topSkills.join(", "),
      sourceNotes: s.sourceNotes ?? "",
    });
  };

  const save = async () => {
    if (!form.country || !form.category) {
      alert("Pays + Catégorie obligatoires");
      return;
    }
    setBusy(true);
    try {
      await admin.upsertJobSnapshot({
        country: form.country,
        countryCode: (form.countryCode || null) as any,
        city: form.city || null,
        category: form.category,
        openJobs: Number(form.openJobs) || 0,
        applicants: Number(form.applicants) || 0,
        avgSalaryUsdCents: form.avgSalaryUsd ? Math.round(Number(form.avgSalaryUsd) * 100) : null,
        topSkills: form.topSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        trend7dPercent: form.trend7dPercent ? Number(form.trend7dPercent) : null,
        sourceNotes: form.sourceNotes || null,
      });
      setEditing(null);
      setForm(defaultForm);
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unflag = async (id: string) => {
    if (!confirm("Retirer l'override manuel ? Le snapshot sera recalculé automatiquement la prochaine nuit.")) return;
    setBusy(true);
    try {
      await admin.clearJobSnapshotOverride(id, "unflag");
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Supprimer définitivement ce snapshot ?")) return;
    setBusy(true);
    try {
      await admin.clearJobSnapshotOverride(id, "delete");
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const triggerRefresh = async () => {
    if (!confirm("Lancer le recalcul immédiat ? Les overrides manuels sont préservés.")) return;
    setBusy(true);
    try {
      const r = await admin.refreshJobSnapshots();
      setLastRefresh(r);
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetGemini = async () => {
    if (!confirm("Reset métriques Gemini ?")) return;
    await admin.resetJobGeminiMetrics();
    await reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🧑‍💼 Analytique Emploi — Admin</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={openNew} style={btnPrimary}>
            + Nouveau override
          </button>
          <button onClick={triggerRefresh} disabled={busy} style={btnSecondary}>
            🔄 Refresh manuel
          </button>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {lastRefresh && (
        <div style={{ ...card, padding: 12, fontSize: 12, color: C.text2 }}>
          Dernier refresh : <b>{lastRefresh.zonesCreated} créés</b> · <b>{lastRefresh.zonesUpdated} màj</b> ·{" "}
          <b>{lastRefresh.zonesSkippedOverride} ignorés (override)</b> · {lastRefresh.externalSignalsUsed} signaux
          externes · {Math.round(lastRefresh.durationMs / 1000)}s
        </div>
      )}

      {/* Gemini metrics */}
      {gemini && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: C.text2 }}>Gemini Regional Job Context</h3>
            <button onClick={resetGemini} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 11 }}>
              Reset
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, fontSize: 13 }}>
            <Stat label="Total calls" value={gemini.totalCalls} color={C.text} />
            <Stat label="Cache hits" value={gemini.cached} color={C.green} />
            <Stat label="Gemini called" value={gemini.geminiCalled} color={C.cyan} />
            <Stat label="Gemini failed" value={gemini.geminiFailed} color={C.danger} />
            <Stat label="Fallback" value={gemini.fallback} color={C.amber} />
          </div>
        </div>
      )}

      {/* K3 — Market data gaps */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: C.text2 }}>
            Zones sans données — priorité admin ({dataGapsTotal} ouvertes)
          </h3>
        </div>
        {dataGaps.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>
            Aucune zone orpheline — toutes les requêtes advisor trouvent un snapshot exact. 🎉
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.text3 }}>
                  <th style={th}>Catégorie</th>
                  <th style={th}>Pays</th>
                  <th style={th}>Ville</th>
                  <th style={th}>Résolu via</th>
                  <th style={{ ...th, textAlign: "right" }}>Demandes</th>
                  <th style={th}>Dernière vue</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {dataGaps.map((g) => (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={td}>{g.category}</td>
                    <td style={td}>{g.country} ({g.countryCode ?? "—"})</td>
                    <td style={td}>{g.city ?? "—"}</td>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background:
                          g.scopeResolved === "NONE" ? C.danger :
                          g.scopeResolved === "GEMINI_LIVE" ? C.accent :
                          g.scopeResolved === "AFRICA_AGGREGATE" ? C.amber : C.cyan,
                        color: "#fff",
                      }}>
                        {g.scopeResolved}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{g.requestCount}</td>
                    <td style={td}>{new Date(g.lastSeenAt).toLocaleString()}</td>
                    <td style={td}>
                      <button
                        onClick={async () => {
                          await admin.resolveJobDataGap(g.id);
                          reload();
                        }}
                        style={{ ...btnSecondary, padding: "3px 8px", fontSize: 10 }}
                      >
                        Marquer résolu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <input
            placeholder="Pays"
            value={filters.country}
            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
            style={input}
          />
          <select
            value={filters.countryCode}
            onChange={(e) => setFilters({ ...filters, countryCode: e.target.value })}
            style={input}
          >
            <option value="">Tout code pays</option>
            {COUNTRY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Ville"
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            style={input}
          />
          <input
            placeholder="Catégorie"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            style={input}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.text2 }}>
            <input
              type="checkbox"
              checked={filters.onlyOverride}
              onChange={(e) => setFilters({ ...filters, onlyOverride: e.target.checked })}
            />
            Overrides seuls
          </label>
          <button onClick={reload} style={btnSecondary} disabled={loading}>
            {loading ? "…" : "🔍 Filtrer"}
          </button>
        </div>
      </div>

      {/* Form */}
      {(editing || form.country || form.category) && (editing || form.country !== "") && (
        <div style={card}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 14, color: C.amber }}>
            {editing ? "✏️ Éditer override" : "➕ Nouveau override manuel"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <Field label="Pays *">
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={input} />
            </Field>
            <Field label="Code pays">
              <select
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                style={input}
              >
                <option value="">—</option>
                {COUNTRY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ville">
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={input} />
            </Field>
            <Field label="Catégorie *">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input} />
            </Field>
            <Field label="Offres ouvertes">
              <input
                type="number"
                value={form.openJobs}
                onChange={(e) => setForm({ ...form, openJobs: Number(e.target.value) })}
                style={input}
              />
            </Field>
            <Field label="Candidats">
              <input
                type="number"
                value={form.applicants}
                onChange={(e) => setForm({ ...form, applicants: Number(e.target.value) })}
                style={input}
              />
            </Field>
            <Field label="Salaire moyen USD">
              <input
                type="number"
                value={form.avgSalaryUsd}
                onChange={(e) => setForm({ ...form, avgSalaryUsd: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Trend 7j (%)">
              <input
                type="number"
                value={form.trend7dPercent}
                onChange={(e) => setForm({ ...form, trend7dPercent: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Top skills (csv)" full>
              <input value={form.topSkills} onChange={(e) => setForm({ ...form, topSkills: e.target.value })} style={input} />
            </Field>
            <Field label="Notes source" full>
              <input
                value={form.sourceNotes}
                onChange={(e) => setForm({ ...form, sourceNotes: e.target.value })}
                style={input}
                placeholder="ex: étude OIT 2026, terrain partenaire X…"
              />
            </Field>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={save} disabled={busy} style={btnPrimary}>
              {busy ? "…" : editing ? "💾 Sauver" : "➕ Créer"}
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setForm(defaultForm);
              }}
              style={btnSecondary}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={card}>
        <div style={{ marginBottom: 10, fontSize: 12, color: C.text3 }}>
          {total} snapshot{total > 1 ? "s" : ""} — affichage {snapshots.length}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: C.text3, textAlign: "left" }}>
                <th style={th}>Date</th>
                <th style={th}>Zone</th>
                <th style={th}>Catégorie</th>
                <th style={th}>Offres</th>
                <th style={th}>Candidats</th>
                <th style={th}>Saturation</th>
                <th style={th}>Salaire moy.</th>
                <th style={th}>Trend 7j</th>
                <th style={th}>Top skills</th>
                <th style={th}>Statut</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                  <td style={td}>{fmtDate(s.snapshotDate)}</td>
                  <td style={td}>
                    {s.country}
                    {s.city ? ` · ${s.city}` : ""}
                    {s.countryCode ? ` (${s.countryCode})` : ""}
                  </td>
                  <td style={td}>{s.category}</td>
                  <td style={td}>{s.openJobs}</td>
                  <td style={td}>{s.applicants}</td>
                  <td style={{ ...td, color: s.saturationIndex >= 3 ? C.danger : s.saturationIndex >= 1.5 ? C.amber : C.green }}>
                    {s.saturationIndex.toFixed(2)}
                  </td>
                  <td style={td}>{fmtUsd(s.avgSalaryUsdCents)}</td>
                  <td style={{ ...td, color: (s.trend7dPercent ?? 0) > 0 ? C.green : (s.trend7dPercent ?? 0) < 0 ? C.danger : C.text3 }}>
                    {s.trend7dPercent != null ? `${s.trend7dPercent > 0 ? "+" : ""}${s.trend7dPercent}%` : "—"}
                  </td>
                  <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.topSkills.slice(0, 3).join(", ")}
                    {s.topSkills.length > 3 ? "…" : ""}
                  </td>
                  <td style={td}>
                    {s.isManualOverride ? (
                      <span style={{ color: C.amber, fontWeight: 700 }}>🔒 MANUEL</span>
                    ) : (
                      <span style={{ color: C.text3 }}>auto</span>
                    )}
                  </td>
                  <td style={td}>
                    <button onClick={() => openEdit(s)} style={{ ...btnSmall, color: C.cyan }}>
                      ✏️
                    </button>
                    {s.isManualOverride && (
                      <button onClick={() => unflag(s.id)} style={{ ...btnSmall, color: C.amber }}>
                        🔓
                      </button>
                    )}
                    <button onClick={() => del(s.id)} style={{ ...btnSmall, color: C.danger }}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ingestion runs */}
      <div style={card}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 14, color: C.text2 }}>
          Derniers runs ingestion JOB ({runs.length})
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: C.text3, textAlign: "left" }}>
                <th style={th}>Date</th>
                <th style={th}>Source</th>
                <th style={th}>Statut</th>
                <th style={th}>Fetched</th>
                <th style={th}>Stored</th>
                <th style={th}>Errors</th>
                <th style={th}>Latence</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                  <td style={td}>{fmtDateTime(r.startedAt)}</td>
                  <td style={td}>{r.source?.name ?? r.sourceId}</td>
                  <td style={{ ...td, color: r.status === "SUCCESS" ? C.green : r.status === "FAILED" ? C.danger : C.amber }}>
                    {r.status}
                  </td>
                  <td style={td}>{r.recordsFetched}</td>
                  <td style={td}>{r.recordsStored}</td>
                  <td style={td}>{r.errors}</td>
                  <td style={td}>{r.latencyMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──
const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 20,
  backdropFilter: "blur(10px)",
};
const input: React.CSSProperties = {
  background: "rgba(10,5,35,.5)",
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  background: C.accent,
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: C.text2,
  border: `1px solid ${C.border}`,
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};
const btnSmall: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 6px",
};
const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 500, borderBottom: `1px solid ${C.border}` };
const td: React.CSSProperties = { padding: "6px 6px", verticalAlign: "middle" };
const errorBox: React.CSSProperties = {
  background: "rgba(255,92,92,.1)",
  border: `1px solid ${C.danger}`,
  color: C.danger,
  padding: 12,
  borderRadius: 8,
  fontSize: 13,
};

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ color: C.text3, fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 11, color: C.text3 }}>{label}</span>
      {children}
    </label>
  );
}

export default AdminJobAnalyticsPanel;
