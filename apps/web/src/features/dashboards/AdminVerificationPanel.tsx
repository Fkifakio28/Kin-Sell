import { useState, useEffect, useCallback } from 'react';
import {
  verification,
  type VerificationRequestData,
  type VerificationListResponse,
  type VerificationKpi,
} from '../../lib/services/verification.service';

// ══════════════════════════════════════════════
// Admin Verification Center — Extracted Component
// ══════════════════════════════════════════════

// ── Palette admin ──
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', textSec: '#475569',
  border: '#CBD5E1', accent: '#0EA5E9', success: '#10B981', warn: '#F59E0B', danger: '#EF4444',
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  UNVERIFIED:            { bg: '#F1F5F9', color: '#475569', label: 'Non vérifié' },
  PENDING:               { bg: '#FEF3C7', color: '#92400E', label: 'En attente' },
  VERIFIED:              { bg: '#D1FAE5', color: '#065F46', label: 'Vérifié' },
  AI_ELIGIBLE:           { bg: '#CFFAFE', color: '#155E75', label: 'Éligible IA' },
  PARTIALLY_VERIFIED:    { bg: '#FEF3C7', color: '#92400E', label: 'Partiel' },
  REJECTED:              { bg: '#FEE2E2', color: '#991B1B', label: 'Rejeté' },
  REVOKED:               { bg: '#FEE2E2', color: '#991B1B', label: 'Révoqué' },
  ADMIN_LOCKED_VERIFIED: { bg: '#D1FAE5', color: '#065F46', label: '🔒 Vérifié' },
  ADMIN_LOCKED_REVOKED:  { bg: '#FEE2E2', color: '#991B1B', label: '🔒 Révoqué' },
};

const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, outline: 'none' };
const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 100 };
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', fontSize: 12, fontWeight: 600, border: `1px solid ${active ? C.accent : C.border}`,
  borderRadius: 6, background: active ? C.accent : C.card, color: active ? '#FFF' : C.textSec,
  cursor: 'pointer', transition: 'all 160ms ease',
});

// ── Helpers ──

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function scoreBadge(score: number | null | undefined) {
  if (score == null) return { bg: '#F1F5F9', color: '#475569', label: '—' };
  if (score >= 80) return { bg: '#D1FAE5', color: '#065F46', label: `${score}` };
  if (score >= 60) return { bg: '#CFFAFE', color: '#155E75', label: `${score}` };
  if (score >= 40) return { bg: '#FEF3C7', color: '#92400E', label: `${score}` };
  return { bg: '#FEE2E2', color: '#991B1B', label: `${score}` };
}

function scoreBar(score: number | null | undefined) {
  if (score == null) return null;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? C.success : pct >= 60 ? C.accent : pct >= 40 ? C.warn : C.danger;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 5, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 300ms ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}</span>
    </div>
  );
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function generateListCsv(rows: VerificationRequestData[]) {
  const header = 'Compte,Email,Type,Statut,Score IA,Source,Trust Score,Date,Note Admin\n';
  return header + rows.map(r => [
    r.user?.profile?.displayName ?? r.business?.publicName ?? '—',
    r.user?.email ?? '—',
    r.userId ? 'User' : 'Business',
    r.status, r.aiScore ?? '—', r.source,
    r.user?.trustScore ?? '—',
    r.createdAt?.slice(0, 10) ?? '—',
    r.adminNote ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function generateListXml(rows: VerificationRequestData[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<verifications exported="' + new Date().toISOString() + '" count="' + rows.length + '">\n';
  for (const r of rows) {
    xml += '  <request id="' + esc(r.id) + '">\n';
    xml += '    <account>' + esc(r.user?.profile?.displayName ?? r.business?.publicName ?? '—') + '</account>\n';
    xml += '    <email>' + esc(r.user?.email ?? '—') + '</email>\n';
    xml += '    <type>' + (r.userId ? 'USER' : 'BUSINESS') + '</type>\n';
    xml += '    <status>' + esc(r.status) + '</status>\n';
    xml += '    <source>' + esc(r.source) + '</source>\n';
    xml += '    <aiScore>' + (r.aiScore ?? '') + '</aiScore>\n';
    xml += '    <trustScore>' + (r.user?.trustScore ?? '') + '</trustScore>\n';
    xml += '    <aiRecommendation>' + esc(r.aiRecommendation ?? '') + '</aiRecommendation>\n';
    xml += '    <adminNote>' + esc(r.adminNote ?? '') + '</adminNote>\n';
    xml += '    <createdAt>' + esc(r.createdAt?.slice(0, 10) ?? '') + '</createdAt>\n';
    xml += '  </request>\n';
  }
  xml += '</verifications>';
  return xml;
}

function generateDetailXml(r: VerificationRequestData) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<verificationDetail exported="' + new Date().toISOString() + '">\n';
  xml += '  <request id="' + esc(r.id) + '">\n';
  xml += '    <status>' + esc(r.status) + '</status>\n';
  xml += '    <source>' + esc(r.source) + '</source>\n';
  xml += '    <aiScore>' + (r.aiScore ?? '') + '</aiScore>\n';
  xml += '    <freshAiScore>' + (r.freshAiScore ?? '') + '</freshAiScore>\n';
  xml += '    <aiRecommendation>' + esc(r.aiRecommendation ?? '') + '</aiRecommendation>\n';
  xml += '    <freshRecommendation>' + esc(r.freshRecommendation ?? '') + '</freshRecommendation>\n';
  xml += '    <adminLocked>' + r.adminLocked + '</adminLocked>\n';
  xml += '    <adminNote>' + esc(r.adminNote ?? '') + '</adminNote>\n';
  xml += '    <createdAt>' + esc(r.createdAt) + '</createdAt>\n';
  xml += '    <updatedAt>' + esc(r.updatedAt) + '</updatedAt>\n';
  xml += '  </request>\n';
  if (r.user) {
    xml += '  <user>\n';
    xml += '    <email>' + esc(r.user.email) + '</email>\n';
    xml += '    <trustScore>' + r.user.trustScore + '</trustScore>\n';
    xml += '    <displayName>' + esc(r.user.profile?.displayName ?? '') + '</displayName>\n';
    xml += '    <verificationStatus>' + esc(r.user.profile?.verificationStatus ?? '') + '</verificationStatus>\n';
    xml += '  </user>\n';
  }
  if (r.business) {
    xml += '  <business>\n';
    xml += '    <publicName>' + esc(r.business.publicName) + '</publicName>\n';
    xml += '    <verificationStatus>' + esc(r.business.verificationStatus ?? '') + '</verificationStatus>\n';
    xml += '  </business>\n';
  }
  if (r.freshMetrics) {
    const m = r.freshMetrics;
    xml += '  <metrics>\n';
    xml += '    <completedOrders>' + m.completedOrders + '</completedOrders>\n';
    xml += '    <avgRating>' + m.avgRating + '</avgRating>\n';
    xml += '    <reviewCount>' + m.reviewCount + '</reviewCount>\n';
    xml += '    <avgResponseTimeMinutes>' + m.avgResponseTimeMinutes + '</avgResponseTimeMinutes>\n';
    xml += '    <disputeCount>' + m.disputeCount + '</disputeCount>\n';
    xml += '    <reportCount>' + m.reportCount + '</reportCount>\n';
    xml += '    <accountAgeDays>' + m.accountAgeDays + '</accountAgeDays>\n';
    xml += '    <activityScore>' + m.activityScore + '</activityScore>\n';
    xml += '    <listingsCount>' + m.listingsCount + '</listingsCount>\n';
    xml += '  </metrics>\n';
  }
  if (r.history && r.history.length > 0) {
    xml += '  <history>\n';
    for (const h of r.history) xml += '    <entry action="' + esc(h.action) + '" from="' + esc(h.fromStatus) + '" to="' + esc(h.toStatus) + '" source="' + esc(h.source) + '" date="' + esc(h.createdAt) + '" reason="' + esc(h.reason ?? '') + '" />\n';
    xml += '  </history>\n';
  }
  xml += '</verificationDetail>';
  return xml;
}

function printDetailPdf() {
  const el = document.getElementById('ver-detail-print');
  if (!el) return;
  const win = window.open('', '_blank');
  if (!win) return;
  const safeHtml = el.cloneNode(true) as HTMLElement;
  safeHtml.querySelectorAll('script,iframe,object,embed,form').forEach(n => n.remove());
  win.document.write('<html><head><title>Vérification — Kin-Sell Admin</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#0F172A;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #CBD5E1}th{background:#F8FAFC;font-weight:600;font-size:11px;text-transform:uppercase;color:#475569}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin:20px 0 8px;color:#0EA5E9;border-bottom:1px solid #CBD5E1;padding-bottom:4px}.meta{color:#475569;font-size:11px}.bar{display:inline-block;height:6px;border-radius:3px}</style></head><body>');
  win.document.write(safeHtml.innerHTML);
  win.document.write('</body></html>');
  win.document.close();
  win.onload = () => { win.print(); };
}


// ════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════

export default function AdminVerificationPanel() {
  // ── State ──
  const [kpi, setKpi] = useState<VerificationKpi | null>(null);
  const [requests, setRequests] = useState<VerificationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<VerificationRequestData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [acting, setActing] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterAccountType, setFilterAccountType] = useState('');
  const [filterMinTrust, setFilterMinTrust] = useState('');
  const [filterMaxTrust, setFilterMaxTrust] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'kpi' | 'list' | 'pending' | 'ai' | 'manual' | 'revoked'>('kpi');

  // ── Data loading ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiData, listData] = await Promise.all([
        verification.admin.getKpi(),
        verification.admin.getRequests({
          status: filterStatus || undefined,
          page,
          limit: 20,
          email: filterEmail || undefined,
          source: filterSource || undefined,
          accountType: (filterAccountType || undefined) as any,
          minTrustScore: filterMinTrust ? Number(filterMinTrust) : undefined,
          maxTrustScore: filterMaxTrust ? Number(filterMaxTrust) : undefined,
          dateFrom: filterDateFrom || undefined,
          dateTo: filterDateTo || undefined,
        }),
      ]);
      setKpi(kpiData);
      setRequests(listData);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterStatus, filterEmail, filterSource, filterAccountType, filterMinTrust, filterMaxTrust, filterDateFrom, filterDateTo, page]);

  useEffect(() => { void loadData(); }, [loadData]);

  // When switching tab presets, adjust filter
  const switchTab = (t: typeof tab) => {
    setTab(t);
    setPage(1);
    if (t === 'pending') setFilterStatus('PENDING');
    else if (t === 'ai') setFilterStatus('AI_ELIGIBLE');
    else if (t === 'manual') setFilterStatus('VERIFIED');
    else if (t === 'revoked') setFilterStatus('REVOKED');
    else { setFilterStatus(''); }
  };

  // ── Actions ──
  const handleAction = async (id: string, action: 'approve' | 'reject' | 'revoke' | 'lockVerified' | 'lockRevoked' | 'reactivate') => {
    setActing(true);
    try {
      await verification.admin[action](id, actionNote || undefined);
      setActionNote('');
      if (detail?.id === id) {
        // Refresh detail
        const refreshed = await verification.admin.getDetail(id);
        setDetail(refreshed);
      }
      await loadData();
    } catch { /* ignore */ }
    setActing(false);
  };

  const handleAiScan = async () => {
    setActing(true);
    try {
      const result = await verification.admin.runAiScan();
      setScanResult(JSON.stringify(result, null, 2));
      await loadData();
    } catch { /* ignore */ }
    setActing(false);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await verification.admin.getDetail(id);
      setDetail(data);
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  // ════════════════════════════════════════
  //  DETAIL VIEW
  // ════════════════════════════════════════
  if (detail) {
    const sb = STATUS_BADGE[detail.status] ?? { bg: '#F1F5F9', color: '#475569', label: detail.status };
    const score = detail.freshAiScore ?? detail.aiScore;
    const metrics = detail.freshMetrics ?? (detail.metricsSnapshot as any);
    const recommendation = detail.freshRecommendation ?? detail.aiRecommendation;

    return (
      <div style={{ background: C.bg, borderRadius: 12, padding: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.card, borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.textSec }}>← Retour</button>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Dossier de vérification</h2>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={printDetailPdf} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>📄 PDF</button>
            <button onClick={() => downloadFile(generateDetailXml(detail), `verification-${detail.id.slice(0, 8)}.xml`, 'application/xml')} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>📋 XML</button>
          </div>
        </div>

        <div id="ver-detail-print" style={{ padding: 20 }}>
          <h1 style={{ fontSize: 16, color: C.text, margin: '0 0 4px' }}>
            {detail.user?.profile?.displayName ?? detail.business?.publicName ?? '—'}
          </h1>
          <p style={{ color: C.textSec, fontSize: 11, margin: '0 0 16px' }}>
            ID: {detail.id} · {detail.userId ? '👤 Utilisateur' : '🏪 Business'} · Créé le {new Date(detail.createdAt).toLocaleDateString('fr-FR')}
          </p>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
            <InfoCard label="Statut" badge={sb} />
            <InfoCard label="Source" value={detail.source === 'AI_AUTO' ? '🤖 IA Auto' : detail.source === 'USER_REQUEST' ? '👤 Demande user' : detail.source} />
            <InfoCard label="Score IA" value={score != null ? `${score}/100` : '—'} extra={scoreBar(score)} />
            <InfoCard label="Trust Score" value={detail.user?.trustScore != null ? `${detail.user.trustScore}/100` : '—'} extra={scoreBar(detail.user?.trustScore)} />
            <InfoCard label="Admin lock" value={detail.adminLocked ? '🔒 Oui' : 'Non'} />
            <InfoCard label="Email" value={detail.user?.email ?? '—'} />
            {detail.resolvedBy && <InfoCard label="Résolu par" value={detail.resolver?.profile?.displayName ?? detail.resolver?.email ?? detail.resolvedBy.slice(0, 12)} />}
            {detail.resolvedAt && <InfoCard label="Date résolution" value={new Date(detail.resolvedAt).toLocaleDateString('fr-FR')} />}
          </div>

          {/* AI Recommendation */}
          {recommendation && (
            <Section title="Décision IA — Pourquoi ce statut">
              <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.6 }}>{recommendation}</p>
            </Section>
          )}

          {/* Metrics (signals) */}
          {metrics && (
            <Section title="Signaux utilisés par l'IA">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                <MetricItem icon="📦" label="Transactions" val={metrics.completedOrders} />
                <MetricItem icon="⭐" label="Note moyenne" val={`${(metrics.avgRating ?? 0).toFixed(1)}/5`} />
                <MetricItem icon="💬" label="Avis reçus" val={metrics.reviewCount} />
                <MetricItem icon="⏱" label="Réactivité" val={`${metrics.avgResponseTimeMinutes ?? 0}min`} />
                <MetricItem icon="📅" label="Ancienneté" val={`${metrics.accountAgeDays}j`} />
                <MetricItem icon="🚨" label="Litiges" val={metrics.disputeCount} warn={metrics.disputeCount > 2} />
                <MetricItem icon="⚠️" label="Signalements" val={metrics.reportCount} warn={metrics.reportCount > 3} />
                <MetricItem icon="📋" label="Annonces" val={metrics.listingsCount} />
                <MetricItem icon="🔥" label="Score activité" val={`${metrics.activityScore}/100`} extra={scoreBar(metrics.activityScore)} />
                <MetricItem icon="✅" label="Profil complet" val={metrics.profileComplete ? 'Oui' : 'Non'} warn={!metrics.profileComplete} />
              </div>
            </Section>
          )}

          {/* Admin note */}
          {detail.adminNote && (
            <Section title="Note admin existante">
              <p style={{ fontSize: 12, color: C.text, margin: 0, background: '#FEF3C7', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.warn}20` }}>{detail.adminNote}</p>
            </Section>
          )}

          {/* Business info */}
          {detail.business && (
            <Section title="Informations Business">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: C.textSec }}>Nom public:</span> <strong>{detail.business.publicName}</strong></div>
                <div><span style={{ color: C.textSec }}>Statut vérif:</span> <strong>{detail.business.verificationStatus}</strong></div>
              </div>
            </Section>
          )}

          {/* History (audit trail) */}
          {(detail.history ?? []).length > 0 && (
            <Section title="Historique des décisions">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Action', 'De', 'Vers', 'Source', 'Raison', 'Date'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(detail.history ?? []).map(h => {
                    const tsb = STATUS_BADGE[h.toStatus] ?? { bg: '#F1F5F9', color: '#475569' };
                    return (
                      <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: C.accent }}>{h.action}</td>
                        <td style={{ padding: '6px 10px' }}><StatusBadgePill status={h.fromStatus} /></td>
                        <td style={{ padding: '6px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: tsb.bg, color: tsb.color }}>{h.toStatus}</span></td>
                        <td style={{ padding: '6px 10px', fontSize: 11 }}>{h.source}</td>
                        <td style={{ padding: '6px 10px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.reason ?? '—'}</td>
                        <td style={{ padding: '6px 10px', fontSize: 11 }}>{new Date(h.createdAt).toLocaleString('fr-FR')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}`, background: C.card, borderRadius: '0 0 12px 12px' }}>
          <textarea
            value={actionNote} onChange={e => setActionNote(e.target.value)}
            placeholder="Note / motif admin (optionnel)…"
            style={{ width: '100%', minHeight: 50, padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ActionBtn label="✅ Certifier" color={C.success} onClick={() => handleAction(detail.id, 'approve')} disabled={acting} />
            <ActionBtn label="✕ Rejeter" color={C.danger} onClick={() => handleAction(detail.id, 'reject')} disabled={acting} />
            <ActionBtn label="⊘ Révoquer" color={C.danger} onClick={() => handleAction(detail.id, 'revoke')} disabled={acting} />
            <ActionBtn label="🔒 Lock Vérifié" color={C.success} onClick={() => handleAction(detail.id, 'lockVerified')} disabled={acting} />
            <ActionBtn label="🔒 Lock Révoqué" color="#888" onClick={() => handleAction(detail.id, 'lockRevoked')} disabled={acting} />
            <ActionBtn label="♻ Réactiver" color={C.accent} onClick={() => handleAction(detail.id, 'reactivate')} disabled={acting} />
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════
  //  MAIN LIST VIEW
  // ════════════════════════════════════════
  const rows = requests?.requests ?? [];

  return (
    <div style={{ background: C.bg, borderRadius: 12, padding: 0 }}>
      {/* Title + scan */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.card, borderRadius: '12px 12px 0 0' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>✅ Centre de vérification</h2>
        <button onClick={handleAiScan} disabled={acting}
          style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, border: `1px solid ${C.accent}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer', opacity: acting ? 0.5 : 1 }}>
          {acting ? '…' : '🤖 Lancer scan IA'}
        </button>
      </div>

      {/* Scan result */}
      {scanResult && (
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
          <pre style={{ background: C.card, padding: 12, borderRadius: 8, fontSize: 11, maxHeight: 180, overflow: 'auto', margin: 0, border: `1px solid ${C.border}`, color: C.text }}>{scanResult}</pre>
          <button onClick={() => setScanResult(null)} style={{ marginTop: 6, background: 'none', border: 'none', fontSize: 11, color: C.textSec, cursor: 'pointer' }}>Fermer</button>
        </div>
      )}

      {/* KPI bandeau */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          {[
            { label: 'En attente', val: kpi.pending, color: C.warn },
            { label: 'Vérifiés', val: kpi.verified, color: C.success },
            { label: 'Éligibles IA', val: kpi.verifiedAi, color: C.accent },
            { label: 'Partiels', val: kpi.partiallyVerified, color: C.warn },
            { label: 'Rejetés', val: kpi.rejected, color: C.danger },
            { label: 'Révoqués', val: kpi.revoked, color: C.danger },
            { label: 'Risque élevé', val: kpi.highRisk, color: '#DC2626' },
            { label: 'Total', val: kpi.total, color: C.text },
          ].map(k => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.val}</div>
              <div style={{ fontSize: 9, color: C.textSec, marginTop: 2, fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {([
          { k: 'kpi' as const, l: '📊 Tous' },
          { k: 'pending' as const, l: '⏳ En attente' },
          { k: 'ai' as const, l: '🤖 Éligibles IA' },
          { k: 'manual' as const, l: '✅ Vérifiés' },
          { k: 'revoked' as const, l: '⊘ Révoqués' },
        ]).map(t => (
          <button key={t.k} onClick={() => switchTab(t.k)} style={tabBtn(tab === t.k)}>{t.l}</button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Filtrer par email…" value={filterEmail} onChange={e => setFilterEmail(e.target.value)} style={inputStyle} />
          <select value={filterAccountType} onChange={e => { setFilterAccountType(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">Tous types</option>
            <option value="USER">👤 Utilisateur</option>
            <option value="BUSINESS">🏪 Business</option>
          </select>
          <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">Toutes sources</option>
            <option value="USER_REQUEST">Demande user</option>
            <option value="AI_AUTO">IA Auto</option>
          </select>
          {tab === 'kpi' && (
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={selectStyle}>
              <option value="">Tous statuts</option>
              {Object.keys(STATUS_BADGE).map(s => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
            </select>
          )}
          <input type="number" placeholder="Trust min" value={filterMinTrust} onChange={e => setFilterMinTrust(e.target.value)} style={{ ...inputStyle, width: 80 }} />
          <input type="number" placeholder="Trust max" value={filterMaxTrust} onChange={e => setFilterMaxTrust(e.target.value)} style={{ ...inputStyle, width: 80 }} />
          <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={inputStyle} title="Date début" />
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={inputStyle} title="Date fin" />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textSec, fontWeight: 600 }}>{requests?.total ?? 0} résultat{(requests?.total ?? 0) > 1 ? 's' : ''}</span>
        </div>

        {/* Exports */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button onClick={() => downloadFile(generateListCsv(rows), 'verifications.csv', 'text/csv')}
            style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
            📄 Export CSV
          </button>
          <button onClick={() => downloadFile(generateListXml(rows), 'verifications.xml', 'application/xml')}
            style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
            📋 Export XML
          </button>
        </div>

        {/* KPI distribution (on kpi tab) */}
        {tab === 'kpi' && kpi && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Répartition par source</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {Object.entries(kpi.bySource ?? {}).map(([k, v]) => (
                <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{v as number}</div>
                  <div style={{ fontSize: 10, color: C.textSec, fontWeight: 600 }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textSec, fontSize: 13 }}>Chargement…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textSec, fontSize: 13 }}>Aucune vérification à afficher pour ce filtre.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: C.card }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Compte', 'Email', 'Type', 'Statut', 'Score IA', 'Trust', 'Source', 'Décision', 'Date', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const sb = STATUS_BADGE[r.status] ?? { bg: '#F1F5F9', color: '#475569', label: r.status };
                  const sco = scoreBadge(r.aiScore);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>{r.user?.profile?.displayName ?? r.business?.publicName ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: C.textSec }}>{r.user?.email ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#F1F5F9', color: C.textSec }}>{r.userId ? '👤 User' : '🏪 Biz'}</span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sb.bg, color: sb.color }}>{sb.label}</span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sco.bg, color: sco.color }}>{sco.label}</span>
                          {r.aiScore != null && scoreBar(r.aiScore)}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{scoreBar(r.user?.trustScore)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 10 }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: r.source === 'AI_AUTO' ? '#CFFAFE' : '#FEF3C7', color: r.source === 'AI_AUTO' ? '#155E75' : '#92400E' }}>
                          {r.source === 'AI_AUTO' ? '🤖 IA' : '👤 User'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 10, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.textSec }}>{r.aiRecommendation ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11 }}>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <button onClick={() => openDetail(r.id)} disabled={detailLoading}
                          style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 4, background: C.card, color: C.accent, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🔍 Dossier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {requests && requests.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...tabBtn(false), opacity: page <= 1 ? 0.4 : 1 }}>◀</button>
            <span style={{ fontSize: 12, color: C.textSec, alignSelf: 'center', fontWeight: 600 }}>Page {page} / {requests.pages}</span>
            <button disabled={page >= requests.pages} onClick={() => setPage(p => p + 1)} style={{ ...tabBtn(false), opacity: page >= requests.pages ? 0.4 : 1 }}>▶</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
//  Sub-components
// ════════════════════════════════════════

function InfoCard({ label, value, badge, extra }: {
  label: string;
  value?: string;
  badge?: { bg: string; color: string; label: string };
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.textSec, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {badge ? (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value ?? '—'}</div>
      )}
      {extra}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{title}</h2>
      {children}
    </>
  );
}

function MetricItem({ icon, label, val, warn, extra }: { icon: string; label: string; val: string | number; warn?: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ background: warn ? '#FEF2F2' : C.bg, border: `1px solid ${warn ? '#FCA5A520' : C.border}`, borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: C.textSec, marginBottom: 2 }}>{icon} {label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: warn ? C.danger : C.text }}>{val}</div>
      {extra}
    </div>
  );
}

function StatusBadgePill({ status }: { status: string }) {
  const sb = STATUS_BADGE[status] ?? { bg: '#F1F5F9', color: '#475569', label: status };
  return <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sb.bg, color: sb.color }}>{sb.label}</span>;
}

function ActionBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: color, color: '#FFF', cursor: 'pointer', opacity: disabled ? 0.5 : 1, transition: 'all 160ms ease' }}>
      {disabled ? '…' : label}
    </button>
  );
}
