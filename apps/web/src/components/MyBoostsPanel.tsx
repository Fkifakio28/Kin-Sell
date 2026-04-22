/**
 * MyBoostsPanel — Phase 5
 * Widget "Mes boosts actifs" + portefeuille
 *
 * Affiche:
 * - Solde wallet + bouton recharger (admin crédite pour l'instant)
 * - Liste des campagnes actives avec progression budget + boutons pause/resume/cancel
 */
import { useCallback, useEffect, useState, type FC } from 'react';
import { boostApi, type BoostCampaign, type WalletSnapshot } from '../lib/services/boost.service';

const formatUsd = (cents: number) => `${(cents / 100).toFixed(2)} $`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const TARGET_LABEL: Record<string, string> = {
  LISTING: '📦 Annonce',
  POST: '📱 Publication',
  PROFILE: '👤 Profil',
  SHOP: '🏪 Boutique',
};
const SCOPE_LABEL: Record<string, string> = {
  LOCAL: '📍 Local',
  NATIONAL: '🌍 National',
  CROSS_BORDER: '🌐 International',
};

export const MyBoostsPanel: FC = () => {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [campaigns, setCampaigns] = useState<BoostCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, c] = await Promise.all([
        boostApi.getWallet().catch(() => ({ wallet: null as WalletSnapshot | null })),
        boostApi.listMyCampaigns(),
      ]);
      setWallet(w.wallet);
      setCampaigns(c.campaigns);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doPause = async (id: string) => {
    setBusyId(id);
    try { await boostApi.pause(id); await load(); } catch (e: any) { alert(e?.message ?? 'Erreur'); }
    finally { setBusyId(null); }
  };
  const doResume = async (id: string) => {
    setBusyId(id);
    try { await boostApi.resume(id); await load(); } catch (e: any) { alert(e?.message ?? 'Erreur'); }
    finally { setBusyId(null); }
  };
  const doCancel = async (id: string) => {
    if (!confirm('Annuler cette campagne ? Le budget restant sera remboursé.')) return;
    setBusyId(id);
    try {
      const r = await boostApi.cancel(id);
      alert(`Remboursement : ${formatUsd(r.refundedUsdCents)}`);
      await load();
    } catch (e: any) { alert(e?.message ?? 'Erreur'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="ud-section">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>🚀 Mes boosts</h2>

      {/* Wallet */}
      <div
        className="glass-card"
        style={{
          padding: 16,
          borderRadius: 12,
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid var(--glass-border, rgba(180,160,255,0.22))',
          background: 'var(--glass-bg, rgba(35,24,72,0.5))',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #c7bedf)' }}>💳 Portefeuille Boost</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginTop: 4 }}>
            {wallet ? formatUsd(wallet.balanceUsdCents) : '—'}
          </div>
        </div>
        {wallet && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-text-secondary, #c7bedf)' }}>
            <div>Total crédité : {formatUsd(wallet.totalCreditedUsdCents)}</div>
            <div>Total dépensé : {formatUsd(wallet.totalDebitedUsdCents)}</div>
          </div>
        )}
      </div>

      {loading && <p style={{ color: 'var(--color-text-secondary, #c7bedf)' }}>Chargement…</p>}
      {error && <p style={{ color: 'var(--color-danger, #F44336)' }}>Erreur : {error}</p>}

      {!loading && campaigns.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary, #c7bedf)' }}>
          Aucune campagne boost. Lancez-en une depuis une annonce ou publication So-Kin.
        </p>
      )}

      {campaigns.map((c) => {
        const pctSpent = c.budgetUsdCents > 0 ? Math.min(100, (c.budgetSpentUsdCents / c.budgetUsdCents) * 100) : 0;
        const isActive = c.status === 'ACTIVE';
        const isPaused = c.status === 'PAUSED';
        const isFinished = c.status === 'EXPIRED' || c.status === 'CANCELED' || c.status === 'EXHAUSTED';
        return (
          <div
            key={c.id}
            className="glass-card"
            style={{
              padding: 14,
              borderRadius: 12,
              marginBottom: 12,
              border: '1px solid var(--glass-border, rgba(180,160,255,0.22))',
              background: 'var(--glass-bg, rgba(35,24,72,0.5))',
              opacity: isFinished ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {TARGET_LABEL[c.target] ?? c.target} · {SCOPE_LABEL[c.scope] ?? c.scope}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #c7bedf)', marginTop: 2 }}>
                  Du {formatDate(c.startsAt)} au {formatDate(c.expiresAt)}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: isActive ? 'rgba(76,175,80,0.2)' : isPaused ? 'rgba(255,193,7,0.2)' : 'rgba(244,67,54,0.2)',
                  color: isActive ? 'var(--color-success, #4CAF50)' : isPaused ? 'var(--color-warning, #FFC107)' : 'var(--color-danger, #F44336)',
                }}
              >
                {c.status}
              </span>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span>💰 {formatUsd(c.budgetSpentUsdCents)} / {formatUsd(c.budgetUsdCents)}</span>
                <span>{pctSpent.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pctSpent}%`,
                    height: '100%',
                    background: 'var(--color-primary, #6f58ff)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-secondary, #c7bedf)', marginBottom: 10 }}>
              <span>👁 {c.totalImpressions.toLocaleString()}</span>
              <span>👆 {c.totalClicks}</span>
              <span>✉️ {c.totalContacts}</span>
            </div>

            {!isFinished && (
              <div style={{ display: 'flex', gap: 8 }}>
                {isActive && (
                  <button
                    onClick={() => doPause(c.id)}
                    disabled={busyId === c.id}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid var(--glass-border, rgba(180,160,255,0.22))',
                      background: 'transparent',
                      color: 'var(--color-text-primary, #fff)',
                      cursor: 'pointer',
                    }}
                  >
                    ⏸ Pause
                  </button>
                )}
                {isPaused && (
                  <button
                    onClick={() => doResume(c.id)}
                    disabled={busyId === c.id}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid var(--color-primary, #6f58ff)',
                      background: 'var(--color-primary, #6f58ff)',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    ▶ Reprendre
                  </button>
                )}
                <button
                  onClick={() => doCancel(c.id)}
                  disabled={busyId === c.id}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid var(--color-danger, #F44336)',
                    background: 'transparent',
                    color: 'var(--color-danger, #F44336)',
                    cursor: 'pointer',
                  }}
                >
                  ✕ Annuler
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MyBoostsPanel;
