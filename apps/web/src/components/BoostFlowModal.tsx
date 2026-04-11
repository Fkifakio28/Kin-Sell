/**
 * BoostFlowModal — Flow de boost simplifié ultra rapide (< 10 secondes)
 * Bottom sheet mobile / Modal desktop
 * Budget → Durée → Estimation → Lancer 🚀
 */
import { useState, useCallback, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { adsBoostApi } from '../lib/services/ads.service';
import './boost-flow-modal.css';

type BoostFlowModalProps = {
  postId: string;
  postTitle?: string;
  onClose: () => void;
  onBoosted?: () => void;
};

const BUDGET_OPTIONS = [
  { usd: 2, label: '2 $', reach: { min: 200, max: 500 }, clicks: { min: 15, max: 40 } },
  { usd: 5, label: '5 $', reach: { min: 500, max: 1500 }, clicks: { min: 40, max: 120 } },
  { usd: 10, label: '10 $', reach: { min: 1500, max: 4000 }, clicks: { min: 120, max: 350 } },
];

const DURATION_OPTIONS = [
  { days: 1, label: '24h' },
  { days: 3, label: '3 jours' },
  { days: 7, label: '7 jours' },
];

export const BoostFlowModal: FC<BoostFlowModalProps> = ({
  postId,
  postTitle,
  onClose,
  onBoosted,
}) => {
  const navigate = useNavigate();
  const [budgetIdx, setBudgetIdx] = useState(1);
  const [durationIdx, setDurationIdx] = useState(1);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAddon, setNeedsAddon] = useState(false);

  const budget = BUDGET_OPTIONS[budgetIdx];
  const duration = DURATION_OPTIONS[durationIdx];

  const handleLaunch = useCallback(async () => {
    if (activating) return;
    setActivating(true);
    setError(null);
    setNeedsAddon(false);
    try {
      await adsBoostApi.activateBoost(postId, duration.days);
      setActivated(true);
      onBoosted?.();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setNeedsAddon(true);
        setError('Add-on Boost Visibilité requis.');
      } else {
        setError('Erreur lors du boost. Réessayez.');
      }
    } finally {
      setActivating(false);
    }
  }, [postId, duration.days, activating, onBoosted]);

  return (
    <div className="bf-overlay" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Succès ── */}
        {activated ? (
          <div className="bf-success">
            <div className="bf-success-icon">🚀</div>
            <h3 className="bf-success-title">Promotion lancée !</h3>
            <p className="bf-success-msg">
              Votre post sera mis en avant pendant {duration.label}.
              Les résultats commencent en quelques minutes.
            </p>
            <button type="button" className="bf-btn bf-btn--done" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <header className="bf-header">
              <span className="bf-header-icon">🚀</span>
              <h3 className="bf-header-title">Booster ce post</h3>
              <button type="button" className="bf-close" onClick={onClose}>✕</button>
            </header>

            {postTitle && (
              <p className="bf-post-title">"{postTitle.length > 60 ? postTitle.slice(0, 60) + '…' : postTitle}"</p>
            )}

            {/* ── Budget ── */}
            <div className="bf-section">
              <label className="bf-section-label">💰 Budget</label>
              <div className="bf-options">
                {BUDGET_OPTIONS.map((b, i) => (
                  <button
                    key={b.usd}
                    type="button"
                    className={`bf-option${i === budgetIdx ? ' bf-option--active' : ''}`}
                    onClick={() => setBudgetIdx(i)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Durée ── */}
            <div className="bf-section">
              <label className="bf-section-label">⏱ Durée</label>
              <div className="bf-options">
                {DURATION_OPTIONS.map((d, i) => (
                  <button
                    key={d.days}
                    type="button"
                    className={`bf-option${i === durationIdx ? ' bf-option--active' : ''}`}
                    onClick={() => setDurationIdx(i)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Estimations ── */}
            <div className="bf-estimates">
              <div className="bf-estimate">
                <span className="bf-estimate-value">{budget.reach.min}–{budget.reach.max}</span>
                <span className="bf-estimate-label">👁 Portée estimée</span>
              </div>
              <div className="bf-estimate">
                <span className="bf-estimate-value">{budget.clicks.min}–{budget.clicks.max}</span>
                <span className="bf-estimate-label">👆 Clics estimés</span>
              </div>
            </div>

            {/* ── Erreur ── */}
            {error && (
              <div className="bf-error">
                <p>{error}</p>
                {needsAddon && (
                  <button
                    type="button"
                    className="bf-btn bf-btn--addon"
                    onClick={() => { navigate('/pricing'); onClose(); }}
                  >
                    🛒 Souscrire au Boost
                  </button>
                )}
              </div>
            )}

            {/* ── CTA ── */}
            <button
              type="button"
              className="bf-btn bf-btn--launch"
              disabled={activating}
              onClick={handleLaunch}
            >
              {activating ? '⏳ Lancement…' : '🚀 Lancer la promotion'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
