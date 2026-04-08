/**
 * IA ADS Kin-Sell — Popup Boost / Mise en avant
 * Affiché automatiquement après publication d'article(s)
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { adsBoostApi, type BoostProposal, type HighlightProposal } from '../lib/services/ads.service';
import './ads-boost-popup.css';

type AdsBoostPopupProps = {
  /** ID d'un listing unique (single publish) */
  listingId?: string;
  /** Nombre d'items importés en bulk */
  bulkImportedCount?: number;
  /** Business ID (pour highlight boutique) */
  businessId?: string;
  /** Callback fermeture */
  onClose: () => void;
  /** Callback après activation boost */
  onBoosted?: () => void;
};

export const AdsBoostPopup: FC<AdsBoostPopupProps> = ({
  listingId,
  bulkImportedCount,
  businessId,
  onClose,
  onBoosted,
}) => {
  const [boostProposal, setBoostProposal] = useState<BoostProposal | null>(null);
  const [highlightProposal, setHighlightProposal] = useState<HighlightProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAddon, setNeedsAddon] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (listingId) {
          const data = await adsBoostApi.getBoostProposal(listingId);
          if (!cancelled) setBoostProposal(data.proposal);
        } else if (bulkImportedCount && bulkImportedCount >= 5) {
          const data = await adsBoostApi.getHighlightProposal(bulkImportedCount);
          if (!cancelled) setHighlightProposal(data.proposal);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger la proposition.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [listingId, bulkImportedCount]);

  const handleActivateBoost = useCallback(async () => {
    if (!boostProposal || activating) return;
    setActivating(true);
    setError(null);
    setNeedsAddon(false);
    try {
      await adsBoostApi.activateBoost(boostProposal.listingId, boostProposal.suggestedDurationDays);
      setActivated(true);
      onBoosted?.();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setNeedsAddon(true);
        setError('Add-on Boost Visibilité requis pour booster vos articles.');
      } else {
        setError('Erreur lors du boost. Réessayez plus tard.');
      }
    } finally {
      setActivating(false);
    }
  }, [boostProposal, activating, onBoosted]);

  const handleActivateHighlight = useCallback(async () => {
    if (!highlightProposal || activating) return;
    setActivating(true);
    setError(null);
    setNeedsAddon(false);
    try {
      await adsBoostApi.activateHighlight(highlightProposal.suggestedDurationDays, businessId);
      setActivated(true);
      onBoosted?.();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setNeedsAddon(true);
        setError('Add-on Boost Visibilité requis pour la mise en avant.');
      } else {
        setError('Erreur lors de la mise en avant. Réessayez plus tard.');
      }
    } finally {
      setActivating(false);
    }
  }, [highlightProposal, activating, businessId, onBoosted]);

  const proposal = boostProposal || highlightProposal;
  const isBoost = !!boostProposal;

  return (
    <div className="ads-boost-overlay" onClick={onClose}>
      <div className="ads-boost-popup" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="ads-boost-header">
          <div className="ads-boost-icon">
            {isBoost ? '🚀' : highlightProposal?.type === 'SHOP_HIGHLIGHT' ? '🏪' : '👤'}
          </div>
          <h3 className="ads-boost-title">
            {loading ? 'IA ADS Kin-Sell' : isBoost ? 'Booster cet article' : 'Mise en avant'}
          </h3>
          <button type="button" className="ads-boost-close" onClick={onClose}>✕</button>
        </header>

        {/* Body */}
        <div className="ads-boost-body">
          {loading ? (
            <div className="ads-boost-loading">
              <span className="ads-boost-spinner" />
              <p>L'IA ADS Kin-Sell analyse votre publication…</p>
            </div>
          ) : error && !activated ? (
            <div className="ads-boost-error">
              <p>{error}</p>
              {needsAddon ? (
                <button
                  type="button"
                  className="ads-boost-btn ads-boost-btn--primary"
                  style={{ marginTop: 12 }}
                  onClick={() => { navigate('/forfaits'); onClose(); }}
                >
                  🛒 Souscrire au Boost Visibilité
                </button>
              ) : null}
            </div>
          ) : activated ? (
            <div className="ads-boost-success">
              <span className="ads-boost-success-icon">✅</span>
              <p>
                {isBoost
                  ? `Article boosté ! Il apparaîtra en priorité pendant ${boostProposal!.suggestedDurationDays} jours.`
                  : `Mise en avant activée ! Vos articles seront en priorité pendant ${highlightProposal!.suggestedDurationDays} jours.`}
              </p>
              <button type="button" className="ads-boost-btn ads-boost-btn--done" onClick={onClose}>OK</button>
            </div>
          ) : proposal ? (
            <>
              {/* AI Label */}
              <div className="ads-boost-ai-badge">
                <span>🤖</span> Recommandation IA ADS Kin-Sell
              </div>

              {/* Message */}
              <p className="ads-boost-message">{proposal.message}</p>

              {/* Benefits */}
              <ul className="ads-boost-benefits">
                {proposal.benefits.map((b: string, i: number) => (
                  <li key={i}>
                    <span className="ads-boost-check">✓</span>
                    {b}
                  </li>
                ))}
              </ul>

              {/* Stats */}
              {'estimatedExtraViews' in proposal && proposal.estimatedExtraViews && (
                <div className="ads-boost-stats">
                  <div className="ads-boost-stat">
                    <strong>{proposal.estimatedExtraViews.min}–{proposal.estimatedExtraViews.max}</strong>
                    <span>vues estimées</span>
                  </div>
                  <div className="ads-boost-stat">
                    <strong>{proposal.suggestedDurationDays}j</strong>
                    <span>durée suggérée</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="ads-boost-actions">
                <button
                  type="button"
                  className="ads-boost-btn ads-boost-btn--primary"
                  onClick={isBoost ? handleActivateBoost : handleActivateHighlight}
                  disabled={activating}
                >
                  {activating ? '⏳ En cours…' : isBoost ? '🚀 Booster cet article' : '⭐ Mettre en avant'}
                </button>
                <button type="button" className="ads-boost-btn ads-boost-btn--ghost" onClick={onClose}>
                  Plus tard
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
