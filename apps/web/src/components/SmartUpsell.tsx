/**
 * SmartUpsell — Scénarios UX contextuels vers /forfaits
 *
 * 3 formes visuelles :
 *  - SmartUpsellBanner  → bannière discrète en haut de section
 *  - SmartUpsellCard    → carte conseil dans un dashboard grid
 *  - PostActionTip      → encart léger après une action réussie
 *
 * Alimenté par useCommercialAdvice (backend) + usePricingNudge (backend)
 * + scénarios locaux déclenchés par props contextuelles.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLocaleCurrency } from "../app/providers/LocaleCurrencyProvider";
import { useCommercialAdvice } from "../hooks/useCommercialAdvice";
import { usePricingNudge } from "../hooks/usePricingNudge";
import type { CommercialRecommendation } from "../lib/services/ai.service";
import type { PricingNudge } from "../lib/services/ai.service";
import "./smart-upsell.css";

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

export type UpsellScenario =
  | "after-publish"       // après publication(s)
  | "after-promo"         // après création d'une promotion
  | "low-performance"     // annonce peu performante
  | "high-messaging"      // volume de messages élevé
  | "after-sale"          // après vente(s)
  | "catalog-growth"      // croissance catalogue entreprise
  | "needs-automation"    // besoin d'automatisation détecté
  | "needs-analytics";    // besoin d'analytics détecté

type UpsellVariant = "banner" | "card" | "tip";

interface LocalScenarioHint {
  scenario: UpsellScenario;
  metric?: Record<string, number | string>;
}

/* Mapping scénarios locaux → nudge par défaut (fallback si pas de reco serveur) */
const LOCAL_SCENARIO_MAP: Record<UpsellScenario, {
  icon: string;
  titleKey: string;
  messageKey: string;
  ctaKey: string;
  target: string;
}> = {
  "after-publish": {
    icon: "🚀",
    titleKey: "upsell.afterPublish.title",
    messageKey: "upsell.afterPublish.message",
    ctaKey: "upsell.afterPublish.cta",
    target: "/forfaits",
  },
  "after-promo": {
    icon: "🎯",
    titleKey: "upsell.afterPromo.title",
    messageKey: "upsell.afterPromo.message",
    ctaKey: "upsell.afterPromo.cta",
    target: "/forfaits",
  },
  "low-performance": {
    icon: "📉",
    titleKey: "upsell.lowPerf.title",
    messageKey: "upsell.lowPerf.message",
    ctaKey: "upsell.lowPerf.cta",
    target: "/forfaits",
  },
  "high-messaging": {
    icon: "💬",
    titleKey: "upsell.highMsg.title",
    messageKey: "upsell.highMsg.message",
    ctaKey: "upsell.highMsg.cta",
    target: "/forfaits",
  },
  "after-sale": {
    icon: "🎉",
    titleKey: "upsell.afterSale.title",
    messageKey: "upsell.afterSale.message",
    ctaKey: "upsell.afterSale.cta",
    target: "/forfaits",
  },
  "catalog-growth": {
    icon: "📦",
    titleKey: "upsell.catalogGrowth.title",
    messageKey: "upsell.catalogGrowth.message",
    ctaKey: "upsell.catalogGrowth.cta",
    target: "/forfaits",
  },
  "needs-automation": {
    icon: "⚡",
    titleKey: "upsell.needsAuto.title",
    messageKey: "upsell.needsAuto.message",
    ctaKey: "upsell.needsAuto.cta",
    target: "/forfaits",
  },
  "needs-analytics": {
    icon: "📊",
    titleKey: "upsell.needsAnalytics.title",
    messageKey: "upsell.needsAnalytics.message",
    ctaKey: "upsell.needsAnalytics.cta",
    target: "/forfaits",
  },
};

/* ────────────────────────────────────────────────────────────
   ICON mapping productType → emoji
   ──────────────────────────────────────────────────────────── */
const PRODUCT_ICONS: Record<string, string> = {
  PLAN: "⭐",
  ADDON: "🧩",
  BOOST: "🚀",
  ADS_PACK: "📢",
  ADS_PREMIUM: "🏆",
  ANALYTICS: "📊",
};

/* ────────────────────────────────────────────────────────────
   SmartUpsellBanner
   Bannière contextuelle discrète — s'affiche en haut de section
   ──────────────────────────────────────────────────────────── */

interface SmartUpsellBannerProps {
  /** Scénario contextuel local (déclenché par la page) */
  scenario?: UpsellScenario;
  /** Variante visuelle — 'user' par défaut, 'business' pour thème gold */
  accountType?: "user" | "business";
  /** Masquer si l'utilisateur n'est pas connecté */
  hide?: boolean;
}

export function SmartUpsellBanner({ scenario, accountType = "user", hide }: SmartUpsellBannerProps) {
  const { t } = useLocaleCurrency();
  const { topAdvice, dismiss: dismissAdvice } = useCommercialAdvice();
  const { topNudge, dismiss: dismissNudge } = usePricingNudge();
  const [localDismissed, setLocalDismissed] = useState(false);

  if (hide || localDismissed) return null;

  // Priorité : advice serveur > nudge serveur > scénario local
  const reco = topAdvice;
  const nudge = topNudge;
  const local = scenario ? LOCAL_SCENARIO_MAP[scenario] : null;

  if (!reco && !nudge && !local) return null;

  const handleDismiss = () => {
    if (reco) dismissAdvice(reco.productCode);
    else if (nudge) dismissNudge(nudge.triggerType);
    setLocalDismissed(true);
  };

  const icon = reco
    ? (PRODUCT_ICONS[reco.productType] || "💡")
    : nudge ? "💡" : local!.icon;

  const title = reco
    ? reco.title
    : nudge ? nudge.title : t(local!.titleKey);

  const message = reco
    ? reco.message
    : nudge ? nudge.message : t(local!.messageKey);

  const ctaLabel = reco
    ? reco.ctaLabel
    : nudge ? nudge.ctaLabel : t(local!.ctaKey);

  const ctaTarget = reco
    ? reco.ctaTarget
    : nudge ? nudge.ctaTarget : local!.target;

  const pricing = reco?.pricing;

  return (
    <div className={`su-banner su-banner--${accountType}`}>
      <div className="su-banner-content">
        <span className="su-banner-icon">{icon}</span>
        <div className="su-banner-text">
          <strong className="su-banner-title">{title}</strong>
          <span className="su-banner-msg">{message}</span>
          {pricing && <span className="su-banner-price">{pricing}</span>}
        </div>
      </div>
      <div className="su-banner-actions">
        <Link to={ctaTarget} className="su-banner-cta">{ctaLabel}</Link>
        <button type="button" className="su-banner-close" onClick={handleDismiss} aria-label="Fermer">✕</button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SmartUpsellCard
   Carte conseil intégrée dans la grille d'un dashboard
   ──────────────────────────────────────────────────────────── */

interface SmartUpsellCardProps {
  accountType?: "user" | "business";
  /** Filtrer par productType exact */
  filter?: CommercialRecommendation["productType"];
  /** Nombre max de cartes */
  max?: number;
  hide?: boolean;
}

export function SmartUpsellCard({ accountType = "user", filter, max = 2, hide }: SmartUpsellCardProps) {
  const { t } = useLocaleCurrency();
  const { advice, dismiss } = useCommercialAdvice();
  const { nudges, dismiss: dismissNudge } = usePricingNudge();

  if (hide) return null;

  const recoCards = filter
    ? advice.filter((a) => a.productType === filter)
    : advice;

  const items: Array<{
    key: string;
    icon: string;
    title: string;
    message: string;
    rationale?: string;
    ctaLabel: string;
    ctaTarget: string;
    pricing?: string;
    signals?: string[];
    onDismiss: () => void;
  }> = [];

  // Advice serveur
  for (const r of recoCards.slice(0, max)) {
    items.push({
      key: `reco-${r.productCode}`,
      icon: PRODUCT_ICONS[r.productType] || "💡",
      title: r.title,
      message: r.message,
      rationale: r.rationale,
      ctaLabel: r.ctaLabel,
      ctaTarget: r.ctaTarget,
      pricing: r.pricing,
      signals: r.signals,
      onDismiss: () => dismiss(r.productCode),
    });
  }

  // Compléter avec nudges si pas assez de recos
  if (items.length < max) {
    for (const n of nudges.slice(0, max - items.length)) {
      items.push({
        key: `nudge-${n.triggerType}`,
        icon: "💡",
        title: n.title,
        message: n.message,
        ctaLabel: n.ctaLabel,
        ctaTarget: n.ctaTarget,
        onDismiss: () => dismissNudge(n.triggerType),
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => (
        <section key={item.key} className={`su-card su-card--${accountType}`}>
          <div className="su-card-header">
            <div className="su-card-badge">
              <span className="su-card-badge-icon">{item.icon}</span>
              <span className="su-card-badge-label">{t("upsell.badge")}</span>
            </div>
            <button type="button" className="su-card-close" onClick={item.onDismiss} aria-label="Fermer">✕</button>
          </div>
          <h4 className="su-card-title">{item.title}</h4>
          <p className="su-card-message">{item.message}</p>
          {item.rationale && (
            <p className="su-card-rationale">{item.rationale}</p>
          )}
          {item.signals && item.signals.length > 0 && (
            <div className="su-card-signals">
              {item.signals.map((s, i) => (
                <span key={i} className="su-card-signal">{s}</span>
              ))}
            </div>
          )}
          <div className="su-card-footer">
            {item.pricing && <span className="su-card-price">{item.pricing}</span>}
            <Link to={item.ctaTarget} className="su-card-cta">{item.ctaLabel}</Link>
          </div>
        </section>
      ))}
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   PostActionTip
   Message intelligent après action réussie
   ──────────────────────────────────────────────────────────── */

interface PostActionTipProps {
  /** Le scénario contextuel déclenché */
  scenario: UpsellScenario;
  /** Visible uniquement quand 'show' est true */
  show: boolean;
  /** Durée d'affichage en ms (0 = permanent, default = 12000) */
  duration?: number;
  accountType?: "user" | "business";
  onClose?: () => void;
}

export function PostActionTip({ scenario, show, duration = 12000, accountType = "user", onClose }: PostActionTipProps) {
  const { t } = useLocaleCurrency();
  const { topAdvice } = useCommercialAdvice();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (show) {
      // Apparaître avec un léger délai pour ne pas couper le feedback principal
      const showTimer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(showTimer);
    } else {
      setVisible(false);
      setClosing(false);
    }
  }, [show]);

  useEffect(() => {
    if (!visible || duration === 0) return;
    const timer = setTimeout(() => {
      setClosing(true);
      setTimeout(() => { setVisible(false); setClosing(false); onClose?.(); }, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const local = LOCAL_SCENARIO_MAP[scenario];
  // Si le serveur a une reco, elle prend la priorité
  const reco = topAdvice;

  const icon = reco ? (PRODUCT_ICONS[reco.productType] || "💡") : local.icon;
  const title = reco ? reco.title : t(local.titleKey);
  const message = reco ? reco.message : t(local.messageKey);
  const ctaLabel = reco ? reco.ctaLabel : t(local.ctaKey);
  const ctaTarget = reco ? reco.ctaTarget : local.target;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => { setVisible(false); setClosing(false); onClose?.(); }, 300);
  };

  return (
    <div className={`su-tip su-tip--${accountType}${closing ? " su-tip--closing" : ""}`}>
      <span className="su-tip-icon">{icon}</span>
      <div className="su-tip-body">
        <strong className="su-tip-title">{title}</strong>
        <span className="su-tip-msg">{message}</span>
      </div>
      <Link to={ctaTarget} className="su-tip-cta">{ctaLabel}</Link>
      <button type="button" className="su-tip-close" onClick={handleClose} aria-label="Fermer">✕</button>
    </div>
  );
}
