/**
 * BoostFlowModal — Refonte Phase 5
 * Flux boost unifié : Cible → Scope → Budget → Durée → Estimation temps réel → Lancer
 *
 * Respecte le Wallet (débit atomique côté backend), l'anti-abus et le pricing scope.
 */
import { useState, useEffect, useCallback, useMemo, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { boostApi, type BoostScope, type BoostTarget, type BoostEstimate, type WalletSnapshot } from '../lib/services/boost.service';
import './boost-flow-modal.css';

type BoostFlowModalProps = {
  targetId: string;
  target?: BoostTarget;
  targetTitle?: string;
  /** Alias rétro-compat (ancien prop postId) */
  postId?: string;
  postTitle?: string;
  onClose: () => void;
  onBoosted?: () => void;
};

const BUDGET_PRESETS_USD = [2, 5, 10, 20, 50];
const DURATION_PRESETS_DAYS = [1, 3, 7, 14, 30];

const SCOPE_OPTIONS: Array<{ value: BoostScope; label: string; hint: string; multiplier: number }> = [
  { value: 'LOCAL', label: '📍 Local', hint: 'Ma ville', multiplier: 1.0 },
  { value: 'NATIONAL', label: '🌍 National', hint: 'Mon pays', multiplier: 2.5 },
  { value: 'CROSS_BORDER', label: '🌐 International', hint: 'Multi-pays', multiplier: 5.0 },
];

const formatUsd = (cents: number) => `${(cents / 100).toFixed(2)} $`;

export const BoostFlowModal: FC<BoostFlowModalProps> = ({
  targetId,
  target = 'LISTING',
  targetTitle,
  postId,
  postTitle,
  onClose,
  onBoosted,
}) => {
  const navigate = useNavigate();
  const resolvedTargetId = targetId || postId || '';
  const resolvedTitle = targetTitle ?? postTitle;
  const [scope, setScope] = useState<BoostScope>('LOCAL');
  const [budgetUsd, setBudgetUsd] = useState<number>(5);
  const [durationDays, setDurationDays] = useState<number>(3);
  const [targetCountries, setTargetCountries] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);

  const budgetCents = Math.round(budgetUsd * 100);

  useEffect(() => {
    boostApi.getWallet()
      .then((r) => setWallet(r.wallet))
      .catch(() => setWallet(null));
  }, []);

  useEffect(() => {
    if (budgetCents < 100) return;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const est = await boostApi.estimate(scope, durationDays, budgetCents);
        setEstimate(est);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [scope, durationDays, budgetCents]);

  const walletOk = wallet ? wallet.balanceUsdCents >= budgetCents : true;

  const handleLaunch = useCallback(async () => {
    if (activating) return;
    if (!resolvedTargetId) {
      setError('Cible invalide.');
      return;
    }
    if (budgetCents < 100) {
      setError('Budget minimum: 1,00 $');
      return;
    }
    if (!walletOk) {
      setError('Solde insuffisant. Rechargez votre portefeuille.');
      setErrorCode(402);
      return;
    }
    setActivating(true);
    setError(null);
    setErrorCode(null);
    try {
      const countries = scope === 'CROSS_BORDER'
        ? targetCountries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
        : [];
      if (scope === 'CROSS_BORDER' && countries.length === 0) {
        setError('Sélectionnez au moins un pays pour le scope international.');
        setActivating(false);
        return;
      }
      await boostApi.createCampaign({
        target,
        targetId: resolvedTargetId,
        scope,
        targetCountries: countries,
        budgetUsdCents: budgetCents,
        durationDays,
      });
      setActivated(true);
      onBoosted?.();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      setErrorCode(e.status ?? null);
      if (e.status === 402) setError('Solde insuffisant — veuillez recharger votre portefeuille.');
      else if (e.status === 403) setError(e.message ?? 'Quota de campagnes atteint sur votre plan.');
      else if (e.status === 409) setError('Une campagne est déjà active sur cette cible.');
      else setError(e.message ?? 'Erreur lors de la création de la campagne.');
    } finally {
      setActivating(false);
    }
  }, [activating, resolvedTargetId, budgetCents, walletOk, scope, targetCountries, target, durationDays, onBoosted]);

  const scopeInfo = useMemo(() => SCOPE_OPTIONS.find((s) => s.value === scope)!, [scope]);

  const targetLabel = target === 'POST' ? 'Publication So-Kin'
    : target === 'SHOP' ? 'Ma boutique'
    : target === 'PROFILE' ? 'Mon profil'
    : 'Annonce';

  return (
    <div className="bf-overlay" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        {activated ? (
          <div className="bf-success">
            <div className="bf-success-icon">🚀</div>
            <h3 className="bf-success-title">Campagne lancée !</h3>
            <p className="bf-success-msg">
              Durée : {durationDays} jour{durationDays > 1 ? 's' : ''} · Budget : {formatUsd(budgetCents)}.
              Les premières impressions arrivent sous quelques minutes.
            </p>
            <button type="button" className="bf-btn bf-btn--done" onClick={onClose}>OK</button>
          </div>
        ) : (
          <>
            <header className="bf-header">
              <span className="bf-header-icon">🚀</span>
              <h3 className="bf-header-title">Booster — {targetLabel}</h3>
              <button type="button" className="bf-close" onClick={onClose}>✕</button>
            </header>

            {resolvedTitle && (
              <p className="bf-post-title">"{resolvedTitle.length > 60 ? resolvedTitle.slice(0, 60) + '…' : resolvedTitle}"</p>
            )}

            {wallet && (
              <div className={`bf-wallet ${walletOk ? '' : 'bf-wallet--low'}`}>
                <span>💳 Portefeuille</span>
                <strong>{formatUsd(wallet.balanceUsdCents)}</strong>
              </div>
            )}

            <div className="bf-section">
              <label className="bf-section-label">🎯 Portée géographique</label>
              <div className="bf-options">
                {SCOPE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`bf-option${s.value === scope ? ' bf-option--active' : ''}`}
                    onClick={() => setScope(s.value)}
                    title={`${s.hint} — x${s.multiplier}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="bf-hint">{scopeInfo.hint} · multiplicateur ×{scopeInfo.multiplier}</p>
            </div>

            {scope === 'CROSS_BORDER' && (
              <div className="bf-section">
                <label className="bf-section-label">🌍 Pays ciblés (codes ISO séparés par virgule)</label>
                <input
                  type="text"
                  className="bf-input"
                  placeholder="FR, CD, CA"
                  value={targetCountries}
                  onChange={(e) => setTargetCountries(e.target.value)}
                />
              </div>
            )}

            <div className="bf-section">
              <label className="bf-section-label">💰 Budget total : {formatUsd(budgetCents)}</label>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(Number(e.target.value))}
                className="bf-range"
              />
              <div className="bf-presets">
                {BUDGET_PRESETS_USD.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`bf-preset${u === budgetUsd ? ' bf-preset--active' : ''}`}
                    onClick={() => setBudgetUsd(u)}
                  >
                    {u} $
                  </button>
                ))}
              </div>
            </div>

            <div className="bf-section">
              <label className="bf-section-label">⏱ Durée : {durationDays} jour{durationDays > 1 ? 's' : ''}</label>
              <input
                type="range"
                min={1}
                max={90}
                step={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="bf-range"
              />
              <div className="bf-presets">
                {DURATION_PRESETS_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`bf-preset${d === durationDays ? ' bf-preset--active' : ''}`}
                    onClick={() => setDurationDays(d)}
                  >
                    {d}j
                  </button>
                ))}
              </div>
            </div>

            <div className="bf-estimates">
              {estimate ? (
                <>
                  <div className="bf-estimate">
                    <span className="bf-estimate-value">{estimate.estReachMin.toLocaleString()}–{estimate.estReachMax.toLocaleString()}</span>
                    <span className="bf-estimate-label">👁 Portée estimée</span>
                  </div>
                  <div className="bf-estimate">
                    <span className="bf-estimate-value">{estimate.estClicksMin}–{estimate.estClicksMax}</span>
                    <span className="bf-estimate-label">👆 Clics estimés</span>
                  </div>
                  <div className="bf-estimate">
                    <span className="bf-estimate-value">{formatUsd(estimate.dailyRateUsdCents)}</span>
                    <span className="bf-estimate-label">📅 Tarif / jour</span>
                  </div>
                </>
              ) : (
                <div className="bf-estimate">
                  <span className="bf-estimate-label">{estimating ? 'Calcul…' : "Saisissez un budget pour voir l'estimation"}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="bf-error">
                <p>{error}</p>
                {errorCode === 402 && (
                  <button
                    type="button"
                    className="bf-btn bf-btn--addon"
                    onClick={() => { navigate('/account?section=wallet'); onClose(); }}
                  >
                    💳 Recharger mon portefeuille
                  </button>
                )}
                {errorCode === 403 && (
                  <button
                    type="button"
                    className="bf-btn bf-btn--addon"
                    onClick={() => { navigate('/pricing'); onClose(); }}
                  >
                    ⬆ Passer à un plan supérieur
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              className="bf-btn bf-btn--launch"
              disabled={activating || budgetCents < 100}
              onClick={handleLaunch}
            >
              {activating ? '⏳ Lancement…' : `🚀 Lancer la campagne · ${formatUsd(budgetCents)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
