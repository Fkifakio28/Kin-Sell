/**
 * AiSmartPopup — Popup intelligente de recommandation IA
 *
 * S'affiche automatiquement quand il y a des recommandations actives.
 * Design glassmorphism Kin-Sell, discret et élégant.
 */

import { useEffect, useState, useCallback } from "react";
import { aiRecommendations, aiTrials, type AiRecommendation } from "../lib/services/ai.service";
import { incentives as incentivesApi } from "../lib/services/incentives.service";
import { useNavigate } from "react-router-dom";

const ENGINE_ICONS: Record<string, string> = {
  ads: "📢",
  analytics: "📊",
  order: "📦",
  negotiation: "🤝",
  orchestrator: "🧠",
};

const ACTION_LABELS: Record<string, string> = {
  BOOST_ARTICLE: "Voir les forfaits Boost",
  BOOST_SHOP: "Voir les forfaits Boost",
  UPGRADE_PLAN: "Voir les forfaits",
  ACTIVATE_TRIAL: "Démarrer l'essai gratuit",
  VIEW_ANALYTICS: "Voir les analyses",
  ENABLE_AUTO_SALES: "Découvrir la vente auto",
  PRICE_ADVICE: "Conseils prix",
};

export default function AiSmartPopup() {
  const [recs, setRecs] = useState<AiRecommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const navigate = useNavigate();

  const loadRecommendations = useCallback(async () => {
    try {
      const data = await aiRecommendations.getActive();
      if (data && data.length > 0) {
        setRecs(data);
        setCurrentIndex(0);
        // Afficher après un court délai pour ne pas être intrusif
        setTimeout(() => setVisible(true), 2000);
      }
    } catch { /* not logged in or API error */ }
  }, []);

  useEffect(() => {
    loadRecommendations();
    // Recheck toutes les 5 minutes
    const interval = setInterval(loadRecommendations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadRecommendations]);

  const current = recs[currentIndex];
  if (!current || !visible) return null;

  const handleDismiss = async () => {
    setClosing(true);
    try {
      await aiRecommendations.dismiss(current.id);
    } catch { /* ignore */ }
    setTimeout(() => {
      if (currentIndex < recs.length - 1) {
        setCurrentIndex((i) => i + 1);
        setClosing(false);
      } else {
        setVisible(false);
        setClosing(false);
      }
    }, 300);
  };

  const handleAccept = async () => {
    try {
      await aiRecommendations.accept(current.id);

      if (current.actionType === "ACTIVATE_TRIAL" && current.actionTarget) {
        await aiTrials.activate(current.actionTarget);
      }

      const isBiz = current.accountType === 'BUSINESS';
      const dashPath = isBiz ? '/business/dashboard' : '/account';

      // ── Coupon / Grant IA embarqué dans actionData (Chantier D4) ──
      const actionData = (current.actionData ?? {}) as Record<string, unknown>;
      let couponCode = typeof actionData.couponCode === "string" ? actionData.couponCode : null;
      const grantId = typeof actionData.grantId === "string" ? actionData.grantId : null;
      const planCode = typeof actionData.planCode === "string"
        ? actionData.planCode
        : (current.actionType === "UPGRADE_PLAN" && current.actionTarget ? current.actionTarget : null);

      // Si un grant est proposé mais pas encore converti → conversion à la volée
      if (!couponCode && grantId) {
        try {
          const res = await incentivesApi.convertGrant(grantId);
          couponCode = res.couponCode;
        } catch { /* grant may already be consumed/expired — fallback redirection sans coupon */ }
      }

      const goPricingWithCoupon = () => {
        const params = new URLSearchParams();
        if (planCode) params.set("plan", planCode);
        if (couponCode) params.set("coupon", couponCode);
        const qs = params.toString();
        navigate(qs ? `/forfaits?${qs}` : "/forfaits");
      };

      if (current.actionType === "BOOST_ARTICLE" || current.actionType === "BOOST_SHOP" ||
        current.actionType === "UPGRADE_PLAN" || current.actionType === "ENABLE_AUTO_SALES") {
        goPricingWithCoupon();
      } else if (couponCode || planCode) {
        // Tout autre type mais avec coupon/plan embarqué → rediriger vers pricing
        goPricingWithCoupon();
      } else if (current.actionType === "VIEW_ANALYTICS") {
        if (isBiz) { sessionStorage.setItem('ud-section', 'analytics'); navigate(dashPath); }
        else { navigate(`${dashPath}?section=analytics`); }
      } else if (current.actionType === "PRICE_ADVICE") {
        if (isBiz) { sessionStorage.setItem('ud-section', 'dashboard'); navigate(dashPath); }
        else { navigate(`${dashPath}?section=overview`); }
      } else if (current.actionType === "ACTIVATE_TRIAL") {
        if (isBiz) { sessionStorage.setItem('ud-section', 'kinsell'); navigate(dashPath); }
        else { navigate(`${dashPath}?section=kinsell`); }
      }
    } catch { /* ignore */ }
    handleDismiss();
  };

  const icon = ENGINE_ICONS[current.engineKey] || "🤖";
  const actionLabel = ACTION_LABELS[current.actionType] || "En savoir plus";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 10000,
        maxWidth: 380,
        width: "calc(100vw - 48px)",
        opacity: closing ? 0 : 1,
        transform: closing ? "translateY(20px)" : "translateY(0)",
        transition: "all 0.3s ease",
        animation: closing ? undefined : "slideUpFade 0.4s ease",
      }}
    >
      <div
        style={{
          background: "rgba(18, 11, 43, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(111, 88, 255, 0.25)",
          borderRadius: 16,
          padding: "18px 20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 12px rgba(111,88,255,0.15)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
              {current.title}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              fontSize: 18,
              padding: "0 4px",
              lineHeight: 1,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <p style={{
          fontSize: 12.5,
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.6,
          margin: "0 0 14px",
          whiteSpace: "pre-line",
        }}>
          {current.message}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: "7px 14px",
              fontSize: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
            }}
          >
            Non merci
          </button>
          <button
            onClick={handleAccept}
            style={{
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: "linear-gradient(135deg, #6f58ff 0%, #9b7aff 100%)",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(111,88,255,0.3)",
            }}
          >
            {actionLabel}
          </button>
        </div>

        {/* Pagination dots */}
        {recs.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 10 }}>
            {recs.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: i === currentIndex ? "#6f58ff" : "rgba(255,255,255,0.2)",
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
