/**
 * AdminIncentivesPanel — CRUD coupons, redemptions, quotas dashboard
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { request } from "../../lib/api-client";

/* ── Types ── */
type CouponItem = {
  id: string;
  code: string;
  kind: string;
  discountPercent: number | null;
  targetScope: string;
  maxUses: number;
  usedCount: number;
  maxUsesPerUser: number;
  status: string;
  segment: string;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  recipient: { id: string; email: string; profile?: { displayName: string } } | null;
  _count: { redemptions: number };
};

type RedemptionItem = {
  id: string;
  couponId: string;
  originalAmountUsdCents: number;
  discountAmountUsdCents: number;
  finalAmountUsdCents: number;
  status: string;
  reason: string | null;
  createdAt: string;
  coupon: { code: string; kind: string; discountPercent: number | null };
  user: { id: string; email: string; profile?: { displayName: string } };
};

type QuotaItem = {
  id: string;
  userId: string;
  monthKey: string;
  couponCount: number;
  coupon100Count: number;
  cpcCount: number;
  cpiCount: number;
  cpaCount: number;
  discount80Count: number;
  addonGainCount: number;
  user: { id: string; email: string; profile?: { displayName: string } };
};

type SubTab = "coupons" | "create" | "redemptions" | "quotas";

/* ── Palette ── */
const C = {
  bg: "var(--ad-bg, #120b2b)",
  card: "var(--ad-surface, rgba(35, 24, 72, 0.66))",
  text: "var(--ad-text-1, #ffffff)",
  text2: "var(--ad-text-2, #c7bedf)",
  text3: "var(--ad-text-3, #9d92bb)",
  border: "var(--ad-border, rgba(180, 160, 255, 0.24))",
  accent: "#6f58ff",
  success: "#4caf50",
  danger: "#ff5252",
  warn: "#ffd93d",
} as const;

const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
  background: `${bg}20`, color, border: `1px solid ${bg}40`,
});

const statusColor: Record<string, string> = {
  ACTIVE: C.success, DRAFT: C.text3, PAUSED: C.warn, EXPIRED: C.text3, REVOKED: C.danger,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "rgba(111, 88, 255, 0.04)", color: C.text, fontSize: 13, fontFamily: "inherit",
};
const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 110 };
const btnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.accent}40`,
  background: `${C.accent}15`, color: C.accent, fontWeight: 600, fontSize: 13,
  cursor: "pointer", fontFamily: "inherit",
};
const btnDanger: React.CSSProperties = { ...btnStyle, border: `1px solid ${C.danger}40`, background: `${C.danger}15`, color: C.danger };

const money = (cents: number) => `${(cents / 100).toFixed(2)}$`;

export default function AdminIncentivesPanel() {
  const [tab, setTab] = useState<SubTab>("coupons");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Coupons list
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [couponsTotal, setCouponsTotal] = useState(0);
  const [couponsPage, setCouponsPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterKind, setFilterKind] = useState("ALL");

  // Redemptions
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
  const [redemptionsPage, setRedemptionsPage] = useState(1);

  // Quotas
  const [quotas, setQuotas] = useState<QuotaItem[]>([]);

  // Create form
  const [form, setForm] = useState({
    kind: "PLAN_DISCOUNT",
    discountPercent: 10,
    targetScope: "ALL_PLANS",
    maxUses: 1,
    maxUsesPerUser: 1,
    expiresAt: "",
    status: "ACTIVE",
    segment: "STANDARD",
    recipientUserId: "",
  });

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /* ── Load coupons ── */
  const loadCoupons = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(couponsPage));
      qs.set("limit", "20");
      if (filterStatus !== "ALL") qs.set("status", filterStatus);
      if (filterKind !== "ALL") qs.set("kind", filterKind);
      const res = await request<{ coupons: CouponItem[]; total: number }>(`/incentives/admin/coupons?${qs}`);
      if (mounted.current) { setCoupons(res.coupons); setCouponsTotal(res.total); }
    } catch { if (mounted.current) setErr("Erreur chargement coupons"); }
    if (mounted.current) setBusy(false);
  }, [couponsPage, filterStatus, filterKind]);

  const loadRedemptions = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(redemptionsPage));
      qs.set("limit", "20");
      const res = await request<{ redemptions: RedemptionItem[]; total: number }>(`/incentives/admin/redemptions?${qs}`);
      if (mounted.current) { setRedemptions(res.redemptions); setRedemptionsTotal(res.total); }
    } catch { if (mounted.current) setErr("Erreur chargement rédemptions"); }
    if (mounted.current) setBusy(false);
  }, [redemptionsPage]);

  const loadQuotas = useCallback(async () => {
    setBusy(true);
    try {
      const res = await request<QuotaItem[]>("/incentives/admin/quotas");
      if (mounted.current) setQuotas(res);
    } catch { if (mounted.current) setErr("Erreur chargement quotas"); }
    if (mounted.current) setBusy(false);
  }, []);

  useEffect(() => {
    if (tab === "coupons") loadCoupons();
    if (tab === "redemptions") loadRedemptions();
    if (tab === "quotas") loadQuotas();
  }, [tab, loadCoupons, loadRedemptions, loadQuotas]);

  /* ── Create coupon ── */
  const handleCreate = async () => {
    setErr(null); setMsg(null);
    if (!form.expiresAt) { setErr("Date d'expiration requise"); return; }
    setBusy(true);
    try {
      const body = {
        kind: form.kind,
        discountPercent: form.discountPercent,
        targetScope: form.targetScope,
        maxUses: form.maxUses,
        maxUsesPerUser: form.maxUsesPerUser,
        expiresAt: new Date(form.expiresAt).toISOString(),
        status: form.status,
        segment: form.segment,
        recipientUserId: form.recipientUserId || undefined,
      };
      const coupon = await request<CouponItem>("/incentives/admin/coupons", { method: "POST", body });
      setMsg(`Coupon créé : ${coupon.code}`);
      setTab("coupons");
    } catch (e: any) {
      setErr(e?.message ?? "Erreur création coupon");
    }
    setBusy(false);
  };

  /* ── Revoke coupon ── */
  const handleRevoke = async (id: string) => {
    setErr(null); setMsg(null);
    setBusy(true);
    try {
      await request(`/incentives/admin/coupons/${id}/revoke`, { method: "POST" });
      setMsg("Coupon révoqué");
      loadCoupons();
    } catch { setErr("Erreur révocation"); }
    setBusy(false);
  };

  /* ── Tabs ── */
  const TabBtn = ({ k, label }: { k: SubTab; label: string }) => (
    <button
      type="button"
      onClick={() => { setTab(k); setMsg(null); setErr(null); }}
      style={{
        padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: tab === k ? 600 : 400,
        border: tab === k ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
        background: tab === k ? `${C.accent}15` : "transparent",
        color: tab === k ? C.accent : C.text2, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );

  const totalPages = Math.ceil(couponsTotal / 20);
  const totalRedemptionPages = Math.ceil(redemptionsTotal / 20);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 16 }}>🎟️ Coupons & Incentives</h2>

      {/* Alerts */}
      {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: `${C.success}15`, color: C.success, marginBottom: 12, fontSize: 13 }}>{msg}</div>}
      {err && <div style={{ padding: "10px 16px", borderRadius: 8, background: `${C.danger}15`, color: C.danger, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn k="coupons" label="📋 Coupons" />
        <TabBtn k="create" label="➕ Créer" />
        <TabBtn k="redemptions" label="📊 Rédemptions" />
        <TabBtn k="quotas" label="📈 Quotas" />
      </div>

      {/* ══════ COUPONS LIST ══════ */}
      {tab === "coupons" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCouponsPage(1); }} style={selectStyle}>
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="PAUSED">Paused</option>
              <option value="EXPIRED">Expired</option>
              <option value="REVOKED">Revoked</option>
            </select>
            <select value={filterKind} onChange={e => { setFilterKind(e.target.value); setCouponsPage(1); }} style={selectStyle}>
              <option value="ALL">Tous les types</option>
              <option value="PLAN_DISCOUNT">Plan Discount</option>
              <option value="ADDON_DISCOUNT">Addon Discount</option>
              <option value="ADDON_FREE_GAIN">Addon Free</option>
              <option value="CPC">CPC</option>
              <option value="CPI">CPI</option>
              <option value="CPA">CPA</option>
            </select>
            <span style={{ fontSize: 12, color: C.text3 }}>{couponsTotal} coupon(s)</span>
          </div>

          {busy ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Chargement…</p>
          ) : coupons.length === 0 ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Aucun coupon trouvé.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Code", "Type", "Réduction", "Statut", "Uses", "Destinataire", "Expire", "Actions"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.text2, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(c => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600, color: C.accent }}>{c.code}</td>
                      <td style={{ padding: "8px 10px", color: C.text2 }}>{c.kind}</td>
                      <td style={{ padding: "8px 10px", color: C.text }}>{c.discountPercent != null ? `${c.discountPercent}%` : "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={badgeStyle(statusColor[c.status] ?? C.text3, statusColor[c.status] ?? C.text3)}>{c.status}</span>
                      </td>
                      <td style={{ padding: "8px 10px", color: C.text2 }}>{c.usedCount}/{c.maxUses}</td>
                      <td style={{ padding: "8px 10px", color: C.text2, fontSize: 11 }}>
                        {c.recipient ? (c.recipient.profile?.displayName ?? c.recipient.email) : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", color: C.text3, fontSize: 11 }}>{new Date(c.expiresAt).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {c.status === "ACTIVE" && (
                          <button type="button" style={{ ...btnDanger, padding: "4px 10px", fontSize: 11 }} onClick={() => handleRevoke(c.id)}>Révoquer</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <button type="button" disabled={couponsPage <= 1} onClick={() => setCouponsPage(p => p - 1)} style={btnStyle}>← Préc</button>
              <span style={{ color: C.text2, fontSize: 13, padding: "8px 0" }}>{couponsPage}/{totalPages}</span>
              <button type="button" disabled={couponsPage >= totalPages} onClick={() => setCouponsPage(p => p + 1)} style={btnStyle}>Suiv →</button>
            </div>
          )}
        </div>
      )}

      {/* ══════ CREATE FORM ══════ */}
      {tab === "create" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, maxWidth: 520 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16 }}>Nouveau coupon</h3>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ color: C.text2, fontSize: 12 }}>
              Type
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} style={{ ...selectStyle, display: "block", width: "100%", marginTop: 4 }}>
                <option value="PLAN_DISCOUNT">Plan Discount</option>
                <option value="ADDON_DISCOUNT">Addon Discount</option>
                <option value="ADDON_FREE_GAIN">Addon Free Gain</option>
                <option value="CPC">CPC</option>
                <option value="CPI">CPI</option>
                <option value="CPA">CPA</option>
              </select>
            </label>

            <label style={{ color: C.text2, fontSize: 12 }}>
              Réduction (%)
              <input type="number" min={0} max={100} value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: Number(e.target.value) }))} style={{ ...inputStyle, display: "block", width: "100%", marginTop: 4 }} />
            </label>

            <label style={{ color: C.text2, fontSize: 12 }}>
              Scope cible
              <select value={form.targetScope} onChange={e => setForm(f => ({ ...f, targetScope: e.target.value }))} style={{ ...selectStyle, display: "block", width: "100%", marginTop: 4 }}>
                <option value="ALL_PLANS">Tous les plans</option>
                <option value="USER_PLANS">Plans utilisateur</option>
                <option value="BUSINESS_PLANS">Plans business</option>
                <option value="ALL_ADDONS">Tous add-ons</option>
                <option value="SPECIFIC">Spécifique</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ color: C.text2, fontSize: 12, flex: 1 }}>
                Max uses
                <input type="number" min={1} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} style={{ ...inputStyle, display: "block", width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ color: C.text2, fontSize: 12, flex: 1 }}>
                Max / user
                <input type="number" min={1} value={form.maxUsesPerUser} onChange={e => setForm(f => ({ ...f, maxUsesPerUser: Number(e.target.value) }))} style={{ ...inputStyle, display: "block", width: "100%", marginTop: 4 }} />
              </label>
            </div>

            <label style={{ color: C.text2, fontSize: 12 }}>
              Date d'expiration
              <input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={{ ...inputStyle, display: "block", width: "100%", marginTop: 4 }} />
            </label>

            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ color: C.text2, fontSize: 12, flex: 1 }}>
                Statut
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...selectStyle, display: "block", width: "100%", marginTop: 4 }}>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </label>
              <label style={{ color: C.text2, fontSize: 12, flex: 1 }}>
                Segment
                <select value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))} style={{ ...selectStyle, display: "block", width: "100%", marginTop: 4 }}>
                  <option value="STANDARD">Standard</option>
                  <option value="TESTER">Tester</option>
                </select>
              </label>
            </div>

            <label style={{ color: C.text2, fontSize: 12 }}>
              User ID destinataire (optionnel)
              <input type="text" value={form.recipientUserId} onChange={e => setForm(f => ({ ...f, recipientUserId: e.target.value }))} placeholder="Laisser vide = tous" style={{ ...inputStyle, display: "block", width: "100%", marginTop: 4 }} />
            </label>
          </div>

          <button type="button" disabled={busy} onClick={handleCreate} style={{ ...btnStyle, marginTop: 20, width: "100%" }}>
            {busy ? "Création…" : "Créer le coupon"}
          </button>
        </div>
      )}

      {/* ══════ REDEMPTIONS ══════ */}
      {tab === "redemptions" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>Historique des rédemptions</h3>
          {busy ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Chargement…</p>
          ) : redemptions.length === 0 ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Aucune rédemption.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Code", "User", "Original", "Réduction", "Final", "Statut", "Date"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.text2, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                      <td style={{ padding: "8px 10px", fontFamily: "monospace", color: C.accent }}>{r.coupon.code}</td>
                      <td style={{ padding: "8px 10px", color: C.text2, fontSize: 11 }}>{r.user.profile?.displayName ?? r.user.email}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{money(r.originalAmountUsdCents)}</td>
                      <td style={{ padding: "8px 10px", color: C.success, fontWeight: 600 }}>-{money(r.discountAmountUsdCents)}</td>
                      <td style={{ padding: "8px 10px", color: C.text, fontWeight: 600 }}>{money(r.finalAmountUsdCents)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={badgeStyle(r.status === "APPLIED" ? C.success : C.danger, r.status === "APPLIED" ? C.success : C.danger)}>{r.status}</span>
                      </td>
                      <td style={{ padding: "8px 10px", color: C.text3, fontSize: 11 }}>{new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalRedemptionPages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              <button type="button" disabled={redemptionsPage <= 1} onClick={() => setRedemptionsPage(p => p - 1)} style={btnStyle}>← Préc</button>
              <span style={{ color: C.text2, fontSize: 13, padding: "8px 0" }}>{redemptionsPage}/{totalRedemptionPages}</span>
              <button type="button" disabled={redemptionsPage >= totalRedemptionPages} onClick={() => setRedemptionsPage(p => p + 1)} style={btnStyle}>Suiv →</button>
            </div>
          )}
        </div>
      )}

      {/* ══════ QUOTAS ══════ */}
      {tab === "quotas" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>Quotas mensuels</h3>
          {busy ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Chargement…</p>
          ) : quotas.length === 0 ? (
            <p style={{ color: C.text3, fontSize: 13 }}>Aucun quota ce mois-ci.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["User", "Mois", "Coupons", "100%", "80%", "CPC", "CPI", "CPA", "Addon"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.text2, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotas.map(q => (
                    <tr key={q.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                      <td style={{ padding: "8px 10px", color: C.text2, fontSize: 11 }}>{q.user.profile?.displayName ?? q.user.email}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.monthKey}</td>
                      <td style={{ padding: "8px 10px", color: C.text, fontWeight: 600 }}>{q.couponCount}/7</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.coupon100Count}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.discount80Count}/3</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.cpcCount}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.cpiCount}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.cpaCount}</td>
                      <td style={{ padding: "8px 10px", color: C.text3 }}>{q.addonGainCount}/1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
