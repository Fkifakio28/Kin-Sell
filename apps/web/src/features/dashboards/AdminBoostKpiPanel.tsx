/**
 * AdminBoostKpiPanel — Phase 5
 * Affiche les KPI globales du module Boost (campagnes actives, dépenses, CTR, top annonceurs).
 */
import { useEffect, useState, type FC } from 'react';
import { boostApi, type AdminBoostKpi } from '../../lib/services/boost.service';

const formatUsd = (cents: number) => `${(cents / 100).toFixed(2)} $`;
const formatNumber = (n: number) => n.toLocaleString('fr-FR');

const AdminBoostKpiPanel: FC = () => {
  const [kpi, setKpi] = useState<AdminBoostKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creditForm, setCreditForm] = useState({ userId: '', amount: '10', description: '' });
  const [crediting, setCrediting] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await boostApi.getAdminKpi();
      setKpi(data);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCredit = async () => {
    const cents = Math.round(Number(creditForm.amount) * 100);
    if (!creditForm.userId || cents <= 0) {
      setCreditMsg('userId + montant > 0 requis');
      return;
    }
    setCrediting(true);
    setCreditMsg(null);
    try {
      await boostApi.adminCredit(creditForm.userId, cents, creditForm.description || undefined);
      setCreditMsg(`✓ ${formatUsd(cents)} crédités à ${creditForm.userId}`);
      setCreditForm({ userId: '', amount: '10', description: '' });
    } catch (e: any) {
      setCreditMsg(`✗ ${e?.message ?? 'Erreur'}`);
    } finally {
      setCrediting(false);
    }
  };

  return (
    <div className="ad-content-block">
      <h2 className="ad-content-title">🚀 Boost — KPI globales</h2>
      <p className="ad-content-subtitle" style={{ color: 'var(--ad-text-3)', marginBottom: 16 }}>
        Vue temps réel des campagnes boost, dépenses et performance. Créditez un utilisateur pour lui offrir du budget boost.
      </p>

      {loading && <p className="ad-content-subtitle">Chargement des KPI…</p>}
      {error && <p className="ad-content-subtitle" style={{ color: 'var(--color-danger)' }}>Erreur : {error}</p>}

      {kpi && (
        <>
          <div
            className="ad-stats-row"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}
          >
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>{kpi.activeCampaigns}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Campagnes actives</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{kpi.expiredLast24h}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Expirées (24h)</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>{formatUsd(kpi.totalSpentCents)}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Dépensé total</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatUsd(kpi.totalBudgetCents)}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Budget alloué</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(kpi.totalImpressions)}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Impressions totales</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(kpi.totalClicks)}</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Clics totaux</div>
            </div>
            <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>{(kpi.ctr * 100).toFixed(2)}%</div>
              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>CTR global</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 16, borderRadius: 12, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 12 }}>🏆 Top 10 annonceurs</h3>
            {kpi.topAdvertisers.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Aucun annonceur actif.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'var(--ad-text-3)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Utilisateur</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Dépensé</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Impressions</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Clics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.topAdvertisers.map((t, i) => (
                      <tr key={t.userId} style={{ borderTop: '1px solid var(--ad-border)' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                          #{i + 1} {t.userId.slice(0, 10)}…
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--color-success)' }}>{formatUsd(t.spentCents)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatNumber(t.impressions)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatNumber(t.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 16, borderRadius: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 12 }}>💳 Créditer un portefeuille</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
              <input
                placeholder="userId cible"
                value={creditForm.userId}
                onChange={(e) => setCreditForm((f) => ({ ...f, userId: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 13, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}
              />
              <input
                type="number"
                min={0.01}
                step={0.01}
                placeholder="Montant USD"
                value={creditForm.amount}
                onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 13, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}
              />
            </div>
            <input
              placeholder="Description (optionnel)"
              value={creditForm.description}
              onChange={(e) => setCreditForm((f) => ({ ...f, description: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 13, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', marginBottom: 10 }}
            />
            <button
              onClick={handleCredit}
              disabled={crediting}
              className="ad-btn ad-btn--accent"
              style={{ fontSize: 13, padding: '8px 20px' }}
            >
              {crediting ? '⏳ Envoi…' : '💳 Créditer'}
            </button>
            {creditMsg && (
              <p style={{ fontSize: 12, marginTop: 8, color: creditMsg.startsWith('✓') ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {creditMsg}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBoostKpiPanel;
