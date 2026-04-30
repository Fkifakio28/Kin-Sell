/**
 * MyIncentivesPanel — Chantier D Phase D3
 *
 * Panel "Mes avantages IA" — affiche :
 *   1. Les grants ACTIFS convertibles (bouton "Convertir en code")
 *   2. Les coupons ACTIFS utilisables (avec code, copie rapide, CTA /forfaits)
 *   3. L'historique (grants consommés/expirés + coupons utilisés)
 *
 * Consomme le backend D1 (/incentives/me/grants, /incentives/me/coupons,
 * /incentives/me/grants/:id/convert).
 *
 * Design : DESIGN-SYSTEM-LOCK — variables CSS uniquement, pas de couleurs hard-codées.
 */

import { useCallback, useEffect, useState, type FC } from "react";
import { Link } from "react-router-dom";
import {
  incentives as incentivesApi,
  type GrantSummary,
  type CouponSummary,
} from "../lib/api-client";
import "./my-incentives-panel.css";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysLeft(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "CPC":
      return "Avantage Clic";
    case "CPI":
      return "Avantage Installation";
    case "CPA":
      return "Avantage Action";
    case "ADDON_FREE_GAIN":
      return "Module offert";
    case "PLAN_DISCOUNT":
      return "Réduction forfait";
    default:
      return kind;
  }
}

export const MyIncentivesPanel: FC = () => {
  const [grants, setGrants] = useState<GrantSummary[]>([]);
  const [coupons, setCoupons] = useState<CouponSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gRes, cRes] = await Promise.all([
        incentivesApi.myGrants(),
        incentivesApi.myCoupons(),
      ]);
      setGrants(gRes.grants);
      setCoupons(cRes.coupons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleConvert = async (grantId: string) => {
    setConvertingId(grantId);
    setActionMessage(null);
    try {
      const res = await incentivesApi.convertGrant(grantId);
      setActionMessage(
        `✅ Code ${res.couponCode} généré (-${res.discountPercent}%). Expire le ${formatDate(res.expiresAt)}.`,
      );
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion impossible";
      setActionMessage(`❌ ${msg}`);
    } finally {
      setConvertingId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback : rien
    }
  };

  const convertibleGrants = grants.filter((g) => g.convertible);
  const historyGrants = grants.filter((g) => !g.convertible);
  const activeCoupons = coupons.filter(
    (c) => c.status === "ACTIVE" && new Date(c.expiresAt) > new Date() && c.usedCount < c.maxUses,
  );
  const historyCoupons = coupons.filter(
    (c) => !(c.status === "ACTIVE" && new Date(c.expiresAt) > new Date() && c.usedCount < c.maxUses),
  );

  return (
    <div className="mip-root">
      <header className="mip-header">
        <div>
          <h2 className="mip-title">🎁 Mes avantages IA</h2>
          <p className="mip-subtitle">
            Vos avantages générés par Kin-Sell Analytique — convertissez-les en codes promo
            pour réduire votre abonnement ou vos modules.
          </p>
        </div>
        <button
          type="button"
          className="mip-refresh-btn"
          onClick={reload}
          disabled={loading}
          aria-label="Rafraîchir"
        >
          ↻
        </button>
      </header>

      {actionMessage && (
        <div className="mip-action-msg" role="status">
          {actionMessage}
        </div>
      )}

      {error && (
        <div className="mip-error" role="alert">
          ❌ {error}
        </div>
      )}

      {loading ? (
        <div className="mip-loading">
          <span className="mip-spinner" aria-hidden="true" />
          Chargement de vos avantages…
        </div>
      ) : (
        <>
          {/* ═══ Avantages convertibles ═══ */}
          <section className="mip-section">
            <h3 className="mip-section-title">
              🚀 Avantages à convertir
              <span className="mip-count">{convertibleGrants.length}</span>
            </h3>

            {convertibleGrants.length === 0 ? (
              <div className="mip-empty">
                <p>Aucun avantage convertible pour l'instant.</p>
                <p className="mip-empty-hint">
                  Publiez, boostez et partagez vos contenus — Kin-Sell Analytique vous
                  récompensera automatiquement.
                </p>
              </div>
            ) : (
              <ul className="mip-grant-list">
                {convertibleGrants.map((grant) => (
                  <li key={grant.grantId} className="mip-grant-card">
                    <div className="mip-grant-info">
                      <span className="mip-grant-kind">{kindLabel(grant.kind)}</span>
                      <strong className="mip-grant-discount">
                        -{grant.discountPercent ?? 0}%
                      </strong>
                      <span className="mip-grant-expiry">
                        Expire dans {daysLeft(grant.expiresAt)} j · {formatDate(grant.expiresAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="mip-btn mip-btn-primary"
                      onClick={() => handleConvert(grant.grantId)}
                      disabled={convertingId === grant.grantId}
                    >
                      {convertingId === grant.grantId ? "Conversion…" : "Convertir en code"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ═══ Coupons actifs ═══ */}
          <section className="mip-section">
            <h3 className="mip-section-title">
              🎟️ Codes promo actifs
              <span className="mip-count">{activeCoupons.length}</span>
            </h3>

            {activeCoupons.length === 0 ? (
              <div className="mip-empty">
                <p>Aucun code promo actif pour l'instant.</p>
              </div>
            ) : (
              <ul className="mip-coupon-list">
                {activeCoupons.map((coupon) => (
                  <li key={coupon.couponId} className="mip-coupon-card">
                    <div className="mip-coupon-head">
                      <span className="mip-coupon-discount">
                        -{coupon.discountPercent ?? 0}%
                      </span>
                      <span className="mip-coupon-expiry">
                        Expire dans {daysLeft(coupon.expiresAt)} j
                      </span>
                    </div>
                    <div className="mip-coupon-code-row">
                      <code className="mip-coupon-code">{coupon.code}</code>
                      <button
                        type="button"
                        className="mip-btn mip-btn-secondary"
                        onClick={() => copyCode(coupon.code)}
                        aria-label={`Copier le code ${coupon.code}`}
                      >
                        {copiedCode === coupon.code ? "✓ Copié" : "Copier"}
                      </button>
                    </div>
                    <div className="mip-coupon-footer">
                      <span className="mip-coupon-meta">
                        Utilisations : {coupon.usedCount} / {coupon.maxUses}
                      </span>
                      <Link to="/forfaits" className="mip-coupon-cta">
                        Utiliser sur Forfaits →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ═══ Historique ═══ */}
          {(historyGrants.length > 0 || historyCoupons.length > 0) && (
            <section className="mip-section mip-history">
              <h3 className="mip-section-title mip-section-title--muted">
                📜 Historique
              </h3>
              <ul className="mip-history-list">
                {historyGrants.map((g) => (
                  <li key={g.grantId} className="mip-history-item">
                    <span className="mip-history-tag">{kindLabel(g.kind)}</span>
                    <span className="mip-history-desc">
                      {g.discountPercent != null ? `-${g.discountPercent}%` : "—"} ·{" "}
                      {g.status === "CONSUMED"
                        ? "Converti"
                        : g.status === "EXPIRED"
                          ? "Expiré"
                          : g.status === "REVOKED"
                            ? "Révoqué"
                            : "Inactif"}
                    </span>
                    <span className="mip-history-date">{formatDate(g.createdAt)}</span>
                  </li>
                ))}
                {historyCoupons.map((c) => (
                  <li key={c.couponId} className="mip-history-item">
                    <span className="mip-history-tag">Code</span>
                    <span className="mip-history-desc">
                      {c.code} · {c.discountPercent ?? 0}% ·{" "}
                      {c.usedCount >= c.maxUses
                        ? "Utilisé"
                        : new Date(c.expiresAt) <= new Date()
                          ? "Expiré"
                          : c.status}
                    </span>
                    <span className="mip-history-date">{formatDate(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default MyIncentivesPanel;
