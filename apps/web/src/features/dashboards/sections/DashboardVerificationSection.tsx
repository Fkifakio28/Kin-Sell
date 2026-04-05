import { useState, useEffect, useCallback } from 'react';
import { verification, type VerificationStatusResponse, type CredibilityScoreResponse } from '../../../lib/services/verification.service';

// ══════════════════════════════════════════════
// DASHBOARD VERIFICATION SECTION — Badge vérifié
// ══════════════════════════════════════════════

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  UNVERIFIED: { label: 'Non vérifié', color: 'var(--color-text-muted)', emoji: '○' },
  PENDING: { label: 'En attente', color: '#f0ad4e', emoji: '⏳' },
  VERIFIED: { label: 'Vérifié Kin-Sell', color: '#5cb85c', emoji: '✅' },
  REJECTED: { label: 'Rejeté', color: '#d9534f', emoji: '✕' },
  AI_ELIGIBLE: { label: 'Crédibilité IA', color: '#6f58ff', emoji: '🤖' },
  PARTIALLY_VERIFIED: { label: 'Profil actif', color: '#5bc0de', emoji: '◐' },
  REVOKED: { label: 'Révoqué', color: '#d9534f', emoji: '⊘' },
  ADMIN_LOCKED_VERIFIED: { label: 'Vérifié (verrouillé)', color: '#5cb85c', emoji: '🔒' },
  ADMIN_LOCKED_REVOKED: { label: 'Révoqué (verrouillé)', color: '#d9534f', emoji: '🔒' },
};

interface Props {
  t: (key: string) => string;
  userId: string;
  businessId?: string;
  accountType?: 'USER' | 'BUSINESS';
}

export function DashboardVerificationSection({ t, userId, businessId, accountType = 'USER' }: Props) {
  const [statusData, setStatusData] = useState<VerificationStatusResponse | null>(null);
  const [credibility, setCredibility] = useState<CredibilityScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [status, cred] = await Promise.all([
        verification.getStatus(),
        accountType === 'BUSINESS' && businessId
          ? verification.getBusinessCredibility(businessId)
          : verification.getCredibility(),
      ]);
      setStatusData(status);
      setCredibility(cred);
    } catch {
      setError('Impossible de charger les données de vérification.');
    } finally {
      setLoading(false);
    }
  }, [accountType, businessId]);

  useEffect(() => { void load(); }, [load]);

  const handleRequest = async () => {
    try {
      setRequesting(true);
      setError('');
      await verification.requestVerification(accountType, businessId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la demande.');
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="ud-section animate-fade-in">
        <h2 style={{ marginBottom: 16 }}>✅ Vérification de compte</h2>
        <div className="ud-glass-panel" style={{ textAlign: 'center', padding: 32 }}>
          <span className="spinner" /> Chargement...
        </div>
      </div>
    );
  }

  const currentStatus = accountType === 'BUSINESS'
    ? statusData?.businesses.find(b => b.id === businessId)?.status ?? 'UNVERIFIED'
    : statusData?.userStatus ?? 'UNVERIFIED';
  const statusInfo = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.UNVERIFIED;
  const latestRequest = statusData?.latestRequest;
  const canRequest = ['UNVERIFIED', 'REJECTED', 'REVOKED'].includes(currentStatus);
  const isVerified = ['VERIFIED', 'ADMIN_LOCKED_VERIFIED'].includes(currentStatus);
  const isAI = currentStatus === 'AI_ELIGIBLE';

  return (
    <div className="ud-section animate-fade-in">
      <h2 style={{ marginBottom: 16 }}>✅ Vérification de compte</h2>

      {error && (
        <div style={{ background: 'rgba(217,83,79,0.15)', border: '1px solid rgba(217,83,79,0.3)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: '#ff6b6b' }}>
          {error}
        </div>
      )}

      {/* ─── STATUS BADGE ─── */}
      <div className="ud-glass-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{statusInfo.emoji}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {isVerified && 'Votre compte a été vérifié par l\'équipe Kin-Sell.'}
              {isAI && 'Votre compte présente une activité fiable selon notre IA.'}
              {currentStatus === 'PARTIALLY_VERIFIED' && 'Votre profil est actif — continuez pour améliorer votre score.'}
              {currentStatus === 'PENDING' && 'Votre demande est en cours de traitement.'}
              {currentStatus === 'REJECTED' && 'Votre demande a été refusée. Vous pouvez en soumettre une nouvelle.'}
              {currentStatus === 'REVOKED' && 'Votre badge a été révoqué. Vous pouvez demander une réévaluation.'}
              {currentStatus === 'UNVERIFIED' && 'Soumettez une demande pour obtenir votre badge vérifié.'}
            </div>
          </div>
        </div>
      </div>

      {/* ─── CREDIBILITY SCORE ─── */}
      {credibility && (
        <div className="ud-glass-panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>📊 Score de crédibilité IA</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <div style={{ position: 'relative', width: 80, height: 80 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={credibility.score >= 80 ? '#5cb85c' : credibility.score >= 60 ? '#6f58ff' : credibility.score >= 40 ? '#f0ad4e' : '#d9534f'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(credibility.score / 100) * 213.6} 213.6`}
                  transform="rotate(-90 40 40)"
                />
                <text x="40" y="44" textAnchor="middle" fill="var(--color-text-primary)" fontSize="18" fontWeight="700">
                  {credibility.score}
                </text>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {credibility.eligible ? '🟢 Éligible à la vérification' : '🔴 Pas encore éligible'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                {credibility.recommendation}
              </div>
            </div>
          </div>

          {/* ─── METRICS DETAIL ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <MetricCard label="Transactions" value={credibility.metrics.completedOrders} target={28} />
            <MetricCard label="Note moyenne" value={credibility.metrics.avgRating} target={3.5} suffix="/5" />
            <MetricCard label="Avis reçus" value={credibility.metrics.reviewCount} target={5} />
            <MetricCard label="Annonces actives" value={credibility.metrics.listingsCount} target={3} />
            <MetricCard label="Ancienneté" value={credibility.metrics.accountAgeDays} target={30} suffix="j" />
            <MetricCard label="Activité" value={credibility.metrics.activityScore} target={40} suffix="/100" />
          </div>
        </div>
      )}

      {/* ─── 3 TIERS ─── */}
      <div className="ud-glass-panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>🏅 Niveaux de badge</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TierCard
            emoji="◐" title="Profil actif"
            description="Activité régulière sur la plateforme"
            active={currentStatus === 'PARTIALLY_VERIFIED'}
          />
          <TierCard
            emoji="🤖" title="Crédibilité IA"
            description="Ce compte présente une activité fiable selon notre analyse automatique"
            active={currentStatus === 'AI_ELIGIBLE'}
          />
          <TierCard
            emoji="✅" title="Vérifié Kin-Sell"
            description="Compte vérifié manuellement par l'équipe Kin-Sell"
            active={isVerified}
          />
        </div>
      </div>

      {/* ─── REQUEST BUTTON ─── */}
      {canRequest && (
        <div className="ud-glass-panel" style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleRequest}
            disabled={requesting}
            className="btn btn-primary"
            style={{ padding: '12px 32px', fontSize: 15, fontWeight: 600, borderRadius: 12 }}
          >
            {requesting ? 'Envoi en cours...' : 'Demander la vérification'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
            Votre profil sera examiné par notre IA puis validé par un administrateur.
          </div>
        </div>
      )}

      {/* ─── REQUEST HISTORY ─── */}
      {latestRequest?.history && latestRequest.history.length > 0 && (
        <div className="ud-glass-panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600 }}>📋 Historique</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {latestRequest.history.map((h) => {
              const toInfo = STATUS_LABELS[h.toStatus] ?? STATUS_LABELS.UNVERIFIED;
              return (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span>
                    <span style={{ color: toInfo.color }}>{toInfo.emoji} {h.action}</span>
                    {h.reason && <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>— {h.reason}</span>}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(h.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────

function MetricCard({ label, value, target, suffix = '' }: { label: string; value: number; target: number; suffix?: string }) {
  const ratio = Math.min(1, value / target);
  const color = ratio >= 1 ? '#5cb85c' : ratio >= 0.6 ? '#f0ad4e' : '#d9534f';
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}{suffix}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
    </div>
  );
}

function TierCard({ emoji, title, description, active }: { emoji: string; title: string; description: string; active: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderRadius: 10,
      background: active ? 'rgba(111,88,255,0.12)' : 'rgba(255,255,255,0.03)',
      border: active ? '1px solid rgba(111,88,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: active ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{description}</div>
      </div>
      {active && <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-accent)', fontWeight: 600 }}>Actif</span>}
    </div>
  );
}
