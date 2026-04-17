import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { billing, type BillingPlanSummary, ApiError } from "../../lib/api-client";
import { isIAPAvailable, purchasePlan } from "../../utils/iap";
import { SeoMeta } from "../../components/SeoMeta";
import {
  parsePricingParams,
  cleanPricingParams,
  highlightElement,
  tabForCode,
  type PricingTab as PricingTabType,
} from "./pricingLinks";
import "./pricing.css";

type PricingTab = "users" | "business" | "addons";

type Plan = {
  code: string;
  name: string;
  price: string;
  highlight?: string;
  features: string[];
  badge?: string;
  popBadge?: string;
  ctaText?: string;
  tagline?: string;
  upgradeHint?: string;
};

type AddonCode = "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM";

type PaymentOrder = {
  id: string;
  planCode: string;
  amountUsdCents: number;
  currency: string;
  status: string;
  transferReference: string;
  createdAt: string;
  expiresAt: string;
  depositorNote?: string | null;
  proofUrl?: string | null;
};

type CheckoutResult = {
  orderId: string;
  status: string;
  planCode: string;
  amountUsdCents: number;
  currency: string;
  transferReference: string;
  paymentUrl: string;
  paypalOrderId: string;
  expiresAt: string;
  instructions: string[];
};

const USER_PLANS: Plan[] = [
  {
    code: "FREE",
    name: "FREE",
    price: "0$/mois",
    badge: "Gratuit",
    highlight: "Vendez sans limite, sans frais",
    tagline: "Tout ce qu'il faut pour votre première vente",
    ctaText: "Commencer gratuitement",
    features: ["Publications illimitées", "Messagerie directe acheteur", "IA Marchande incluse", "1 conseil IA offert (1er produit + 1er service)"],
    upgradeHint: "Envie d'être vu ? → BOOST"
  },
  {
    code: "BOOST",
    name: "BOOST",
    price: "6$/mois",
    badge: "Visibilité",
    popBadge: "Pour vendre plus",
    highlight: "Vos annonces devant les bons acheteurs",
    tagline: "Sortez du lot avec la publicité marketplace",
    ctaText: "Booster mes ventes",
    features: ["Tout FREE inclus", "Publicité marketplace", "Conseils IA de ciblage", "Accès Boost profil (add-on)"],
    upgradeHint: "Moins de gestion ? → AUTO"
  },
  {
    code: "AUTO",
    name: "AUTO",
    price: "12$/mois",
    badge: "Meilleur équilibre",
    popBadge: "Recommandé",
    highlight: "L'IA gère vos ventes — vous vendez",
    tagline: "L'automatisation qui libère votre temps",
    ctaText: "Automatiser mes ventes",
    features: ["Tout BOOST inclus", "IA Commande incluse", "Relances & suivi automatiques", "Validation assistée"],
    upgradeHint: "Besoin de données marché ? → PRO"
  },
  {
    code: "PRO_VENDOR",
    name: "PRO VENDEUR",
    price: "20$/mois",
    badge: "Pilotage",
    popBadge: "Pour les pros",
    highlight: "Comprenez votre marché avant les autres",
    tagline: "Données réelles + mémoire stratégique",
    ctaText: "Passer en mode pilotage",
    features: ["Tout AUTO inclus", "Analytique Medium (Gemini)", "Diagnostic & anomalies", "Tendances & mémoire stratégique"]
  }
];

const BUSINESS_PLANS: Plan[] = [
  {
    code: "STARTER",
    name: "STARTER",
    price: "15$/mois",
    badge: "Lancement",
    highlight: "Votre vitrine professionnelle sur Kin-Sell",
    tagline: "Crédibilité + visibilité dès le départ",
    ctaText: "Lancer ma boutique",
    features: ["Boutique dédiée", "Profil business vérifiable", "Publicité marketplace", "IA Marchande incluse"],
    upgradeHint: "IA + Analytics ? → BUSINESS"
  },
  {
    code: "BUSINESS",
    name: "BUSINESS",
    price: "30$/mois",
    badge: "Croissance",
    popBadge: "Le plus populaire",
    highlight: "IA + Analytics pour accélérer",
    tagline: "Automatisation + intelligence marché en un plan",
    ctaText: "Accélérer ma croissance",
    features: ["Tout STARTER inclus", "IA Commande incluse", "Analytique Medium (Gemini)", "Diagnostic, tendances & mémoire"]
  },
  {
    code: "SCALE",
    name: "SCALE",
    price: "50$/mois",
    badge: "Expansion",
    popBadge: "Pour scaler",
    highlight: "Anticipez le marché, débloquez tout",
    tagline: "Tous les outils Kin-Sell, zéro limite",
    ctaText: "Débloquer tout Kin-Sell",
    features: ["Tout BUSINESS inclus", "Analytique Premium & prédictions", "Publicité homepage", "Support dédié"]
  }
];

const ADDONS: Array<{ code: AddonCode; name: string; price: string; details: string[] }> = [
  {
    code: "IA_MERCHANT",
    name: "IA MARCHAND (add-on)",
    price: "3$/mois",
    details: ["Aide négociation avancée", "Suggestion prix marché", "Contre-offres assistées", "Incluse dans AUTO, PRO, BUSINESS, SCALE"]
  },
  {
    code: "IA_ORDER",
    name: "IA COMMANDE (add-on)",
    price: "7$/mois",
    details: ["Automation vente", "Réponse auto", "Suivi client"]
  },
  {
    code: "BOOST_VISIBILITY",
    name: "BOOST PROFIL / BOUTIQUE",
    price: "1$ / 5$ / 15$",
    details: ["1$ -> 24h", "5$ -> 7 jours", "15$ -> 30 jours"]
  },
  {
    code: "ADS_PACK",
    name: "PACK PUB",
    price: "5$ / 10$ / 15$",
    details: ["3 pubs -> 5$", "7 pubs -> 10$", "10 pubs -> 15$"]
  },
  {
    code: "ADS_PREMIUM",
    name: "PUB PREMIUM",
    price: "25$",
    details: ["Homepage", "Top résultats", "Ciblage ville"]
  }
];

function PlanCard({
  plan,
  isCurrent,
  canChange,
  loading,
  onChoose,
  recommended,
}: {
  plan: Plan;
  isCurrent: boolean;
  canChange: boolean;
  loading: boolean;
  onChoose: (code: string) => void;
  recommended?: boolean;
}) {
  const priceNum = plan.price.replace('/mois', '');
  return (
    <article className={`plan-card${recommended ? ' plan-card--recommended' : ''}`} id={`plan-${plan.code}`}>
      {plan.popBadge && recommended && <span className="plan-card__popular">{plan.popBadge}</span>}
      {plan.popBadge && !recommended && <span className="plan-card__pop-label">{plan.popBadge}</span>}
      <h3 className="plan-card__name">{plan.name}</h3>
      {plan.badge ? <span className="plan-card__badge">{plan.badge}</span> : null}
      <div>
        <span className="plan-card__price">{priceNum}</span>
        {plan.price.includes('/mois') && <span className="plan-card__period"> /mois</span>}
      </div>
      {plan.highlight ? <p className="plan-card__highlight">{plan.highlight}</p> : null}
      {plan.tagline ? <p className="plan-card__tagline">{plan.tagline}</p> : null}
      <div className="plan-card__divider" />
      <ul className="plan-card__features">
        {plan.features.map((feature) => (
          <li key={feature} className="plan-card__feat">
            <span className="plan-card__feat-check">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <div className="plan-card__cta">
        {isCurrent ? (
          <span className="plan-card__current">✓ Plan actif</span>
        ) : canChange ? (
          <button className="plan-card__btn" type="button" onClick={() => onChoose(plan.code)} disabled={loading}>
            {loading ? "Traitement..." : plan.ctaText || "Choisir ce plan"}
          </button>
        ) : (
          <Link className="plan-card__btn" to="/register">{plan.ctaText || "Créer un compte"}</Link>
        )}
        {plan.upgradeHint && !isCurrent && (
          <p className="plan-card__upgrade-hint">{plan.upgradeHint}</p>
        )}
      </div>
    </article>
  );
}

export function PricingPage() {
  const { user, isLoggedIn } = useAuth();
  const { t } = useLocaleCurrency();
  const [currentPlan, setCurrentPlan] = useState<BillingPlanSummary | null>(null);
  const [busyPlanCode, setBusyPlanCode] = useState<string | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [latestCheckout, setLatestCheckout] = useState<CheckoutResult | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<{
    valid: boolean;
    discountPercent: number | null;
    reason?: string;
    originalAmountUsdCents?: number;
    discountAmountUsdCents?: number;
    finalAmountUsdCents?: number;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const role = user?.role === "BUSINESS" ? "BUSINESS" : user?.role === "USER" ? "USER" : "VISITOR";

  const defaultTab: PricingTab = useMemo(() => {
    if (role === "BUSINESS") return "business";
    if (role === "USER") return "users";
    return "users";
  }, [role]);

  const [activeTab, setActiveTab] = useState<PricingTab>(defaultTab);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Deep-link : parse URL et appliquer tab + highlight ──
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const dl = parsePricingParams();
    if (!dl.tab && !dl.highlight && !dl.section) return;
    deepLinkApplied.current = true;

    // Résoudre le bon tab
    const targetTab: PricingTab = dl.tab ?? (dl.highlight ? tabForCode(dl.highlight) : defaultTab);
    setActiveTab(targetTab);

    // Highlight + scroll
    if (dl.highlight) {
      highlightElement(`plan-${dl.highlight}`);
    } else if (dl.section === "analytics") {
      highlightElement("plan-analytics-lock");
    }

    // Nettoyer l'URL sans recharger
    cleanPricingParams();
  }, [defaultTab]);

  useEffect(() => {
    if (!isLoggedIn) {
      setCurrentPlan(null);
      setPaymentOrders([]);
      return;
    }

    let cancelled = false;

    const loadBillingData = async () => {
      try {
        const [planData, ordersData] = await Promise.all([billing.myPlan(), billing.paymentOrders()]);
        if (!cancelled) {
          setCurrentPlan(planData);
          setPaymentOrders(ordersData.orders);
        }
      } catch {
        if (!cancelled) {
          setCurrentPlan(null);
          setPaymentOrders([]);
        }
      }
    };

    void loadBillingData();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // Auto-capture PayPal payment when user returns from PayPal approval
  useEffect(() => {
    if (!isLoggedIn) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    const paid = params.get("paid");
    const cancelled2 = params.get("cancelled");

    // Clean URL params immediately
    window.history.replaceState({}, "", window.location.pathname);

    // Paiement annulé côté PayPal
    if (cancelled2 === "1") {
      setErrorMessage("Paiement annulé. Vous pouvez réessayer quand vous le souhaitez.");
      return;
    }

    if (paid !== "1" || !orderId) return;

    let cancelled = false;
    const capture = async () => {
      setInfoMessage("Finalisation du paiement PayPal en cours…");
      try {
        const result = await billing.capturePaypalCheckout({ orderId });
        if (!cancelled) {
          setInfoMessage(result.message || "✅ Paiement PayPal confirmé ! Votre forfait est activé.");
          // Reload billing data
          const [planData, ordersData] = await Promise.all([billing.myPlan(), billing.paymentOrders()]);
          if (!cancelled) {
            setCurrentPlan(planData);
            setPaymentOrders(ordersData.orders);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof ApiError ? err.message : "Erreur lors de la capture du paiement PayPal.");
        }
      }
    };
    void capture();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const handleChoosePlan = (planCode: string) => {
    if (!isLoggedIn) {
      setInfoMessage("Connectez-vous pour activer un forfait.");
      return;
    }
    setPendingPlanCode(planCode);
    setPromoCode("");
    setPromoStatus(null);
    setLatestCheckout(null);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim() || !pendingPlanCode) return;
    setPromoLoading(true);
    setPromoStatus(null);
    try {
      const result = await billing.previewCoupon({ code: promoCode.trim(), planCode: pendingPlanCode });
      setPromoStatus({
        valid: result.valid,
        discountPercent: result.discountPercent,
        reason: result.reason,
        originalAmountUsdCents: result.originalAmountUsdCents,
        discountAmountUsdCents: result.discountAmountUsdCents,
        finalAmountUsdCents: result.finalAmountUsdCents,
      });
    } catch {
      setPromoStatus({ valid: false, discountPercent: null, reason: "Erreur de validation" });
    } finally {
      setPromoLoading(false);
    }
  };

  const handlePay = async () => {
    if (!pendingPlanCode) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setBusyPlanCode(pendingPlanCode);

    try {
      // iOS native → Apple In-App Purchase
      if (isIAPAvailable()) {
        const scope = activeTab === "business" ? "BUSINESS" : "USER";
        const iapResult = await purchasePlan(scope as "USER" | "BUSINESS", pendingPlanCode);
        if (iapResult.ok) {
          setInfoMessage("Achat Apple réussi ! Votre forfait est en cours d'activation…");
          // Refresh plan after IAP
          try {
            const plan = await billing.myPlan();
            setCurrentPlan(plan);
          } catch { /* will be refreshed on next load */ }
          setPendingPlanCode(null);
        } else {
          setErrorMessage(iapResult.error);
        }
        return;
      }

      // Web / Android → PayPal
      const checkoutPayload: { planCode: string; billingCycle: "MONTHLY" | "ONE_TIME"; promoCode?: string } = {
        planCode: pendingPlanCode,
        billingCycle: "MONTHLY",
      };
      if (promoCode.trim() && promoStatus?.valid) {
        checkoutPayload.promoCode = promoCode.trim();
      }
      const result = await billing.createPaypalCheckout(checkoutPayload);
      setLatestCheckout(result);
      // Redirection vers PayPal
      if (result.paymentUrl) {
        window.open(result.paymentUrl, "_blank", "noopener,noreferrer");
      }
      setInfoMessage("Redirection vers PayPal en cours\u2026 Votre forfait sera activé automatiquement après paiement.");

      const orders = await billing.paymentOrders();
      setPaymentOrders(orders.orders);
      setPendingPlanCode(null);
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? "Impossible de créer l'ordre de paiement.");
      } else {
        setErrorMessage("Impossible de créer l'ordre de paiement.");
      }
    } finally {
      setBusyPlanCode(null);
    }
  };



  // handleActivateOrder supprimé — l'activation ne peut plus se faire côté frontend.
  // Seuls PayPal (capture auto) ou un super admin (validation manuelle) peuvent activer un forfait.

  // handleToggleAddon supprimé — les add-ons ne peuvent plus être activés côté frontend.
  // L'activation se fait uniquement via paiement validé ou action admin.
  // Le bouton redirige vers un upgrade de forfait ou contact support.



  const faqData = [
    { q: 'Comment fonctionne le paiement ?', a: 'Sur le web et Android, les paiements passent par PayPal. Sur iPhone, les abonnements sont traités via l\'App Store d\'Apple. Votre forfait est activé automatiquement dès la confirmation du paiement.' },
    { q: 'Puis-je changer de forfait à tout moment ?', a: 'Oui. Vous pouvez upgrader à tout moment. Le nouveau forfait prend effet immédiatement après paiement.' },
    { q: 'Qu\'est-ce qu\'un add-on ?', a: 'Un add-on est une fonctionnalité supplémentaire que vous pouvez ajouter à n\'importe quel forfait (ex : Boost Visibilité, IA Commande). Les add-ons sont indépendants du forfait choisi.' },
    { q: 'L\'IA Marchande est-elle vraiment gratuite ?', a: 'Oui. L\'IA Marchande (conseils de prix, aide à la négociation) est incluse dans tous les forfaits, y compris FREE. Aucun coût caché.' },
    { q: 'Quelle est la différence entre Analytique Medium et Premium ?', a: 'Medium inclut le diagnostic de performance, la détection d\'anomalies, les tendances marché et la mémoire stratégique. Premium ajoute les prédictions de demande, les recommandations stratégiques et un score de confiance par source de données.' },
  ];

  return (
    <div className="pricing-page animate-fade-in">
      <SeoMeta
        title="Tarifs et abonnements | Kin-Sell"
        description="Choisissez le plan adapté à vos besoins: FREE, BOOST, AUTO, PRO VENDEUR pour les particuliers; STARTER, BUSINESS, SCALE pour les entreprises."
        canonical="https://kin-sell.com/forfaits"
      />

      {/* ───────────────  HERO  ─────────────── */}
      <header className="pricing-hero">
        <span className="pricing-hero__eyebrow">Tarifs & Abonnements</span>
        <h1 className="pricing-hero__title">Le bon plan pour chaque ambition</h1>
        <p className="pricing-hero__subtitle">
          Des outils concrets pour vendre plus, plus vite, plus intelligemment.
          Choisissez le niveau qui correspond à votre activité.
        </p>
        {currentPlan ? (
          <div className="pricing-hero__plan-active">
            ✓ Forfait actif : {currentPlan.planName} — {(currentPlan.priceUsdCents / 100).toFixed(2)}$ / {currentPlan.billingCycle === "MONTHLY" ? "mois" : "one-shot"}
          </div>
        ) : null}
      </header>

      {/* ── Alerts ── */}
      {infoMessage ? <div className="pricing-alert pricing-alert--ok">{infoMessage}</div> : null}
      {errorMessage ? <div className="pricing-alert pricing-alert--error">{errorMessage}</div> : null}

      {/* ───────────────  TOGGLE  ─────────────── */}
      <div className="pricing-toggle">
        <div className="pricing-toggle__inner">
          <button type="button" className={`pricing-toggle__btn${activeTab === "users" ? " pricing-toggle__btn--active" : ""}`} onClick={() => setActiveTab("users")}>
            👤 Vendeurs
          </button>
          <button type="button" className={`pricing-toggle__btn${activeTab === "business" ? " pricing-toggle__btn--active" : ""}`} onClick={() => setActiveTab("business")}>
            🏢 Business
          </button>
          <button type="button" className={`pricing-toggle__btn${activeTab === "addons" ? " pricing-toggle__btn--active" : ""}`} onClick={() => setActiveTab("addons")}>
            🧩 Add-ons
          </button>
        </div>
      </div>

      {/* ───────────────  PLAN CARDS  ─────────────── */}

      {activeTab === "users" ? (
        <section className="pricing-plans">
          {USER_PLANS.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              isCurrent={currentPlan?.planCode === plan.code}
              canChange={isLoggedIn && busyPlanCode === null}
              loading={busyPlanCode === plan.code}
              onChoose={handleChoosePlan}
              recommended={plan.code === "AUTO"}
            />
          ))}
        </section>
      ) : null}

      {activeTab === "business" ? (
        <section className="pricing-plans pricing-plans--3col">
          {BUSINESS_PLANS.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              isCurrent={currentPlan?.planCode === plan.code}
              canChange={isLoggedIn && busyPlanCode === null}
              loading={busyPlanCode === plan.code}
              onChoose={handleChoosePlan}
              recommended={plan.code === "BUSINESS"}
            />
          ))}
        </section>
      ) : null}

      {activeTab === "addons" ? (
        <section className="pricing-plans pricing-plans--3col">
          {ADDONS.map((addon) => (
            <article className="addon-card" key={addon.code} id={`plan-${addon.code}`}>
              <h3 className="addon-card__name">{addon.name}</h3>
              <p className="addon-card__price">{addon.price}</p>
              <ul className="addon-card__list">
                {addon.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              {isLoggedIn && currentPlan ? (
                currentPlan.addOns.some((a) => a.code === addon.code && a.status === "ACTIVE") ? (
                  <span className="plan-card__current">✓ Actif</span>
                ) : currentPlan.addOns.some((a) => a.code === addon.code && a.status === "DISABLED") ? (
                  <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary, #aaa)' }}>Désactivé</span>
                ) : (
                  <button type="button" className="plan-card__btn" onClick={() => { setActiveTab("users"); setInfoMessage("Choisissez un forfait payant pour accéder à cet add-on, ou contactez le support."); }}>
                    Souscrire
                  </button>
                )
              ) : !isLoggedIn ? (
                <Link className="plan-card__btn" to="/register">Créer un compte</Link>
              ) : null}
            </article>
          ))}

          <article className="addon-card addon-card--analytics" id="plan-analytics-lock">
            <h3 className="addon-card__name">Analytics</h3>
            <p className="addon-card__price" style={{ fontSize: 14, fontWeight: 600 }}>Inclus dans les forfaits</p>
            <ul className="addon-card__list">
              <li>Analytics Medium : tendances, prix, produits populaires</li>
              <li>Analytics Premium : Medium + prédictions + stratégie</li>
              <li>Non disponible en add-on individuel</li>
            </ul>
          </article>
        </section>
      ) : null}

      {/* ───────────────  PAYMENT FLOW  ─────────────── */}

      {pendingPlanCode ? (
        <section className="pricing-payment">
          <h2 className="pricing-payment__title">
            {isIAPAvailable() ? "Achat via App Store" : "Paiement PayPal"} — {pendingPlanCode}
          </h2>
          <p className="pricing-payment__text">
            {isIAPAvailable()
              ? "Votre achat sera traité via l'App Store d'Apple. Votre forfait sera activé automatiquement."
              : "Vous serez redirigé vers PayPal pour effectuer le paiement. Votre forfait sera activé automatiquement après confirmation."}
          </p>

          {/* ── Promo code ── */}
          {!isIAPAvailable() && (
            <div className="pricing-promo">
              <label className="pricing-promo__label" htmlFor="promo-code">Code promo</label>
              <div className="pricing-promo__row">
                <input
                  id="promo-code"
                  className="pricing-promo__input"
                  type="text"
                  placeholder="KS-XXXXXXXX"
                  maxLength={30}
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus(null); }}
                />
                <button
                  type="button"
                  className="pricing-promo__btn"
                  disabled={!promoCode.trim() || promoLoading}
                  onClick={() => void handleValidatePromo()}
                >
                  {promoLoading ? "…" : "Vérifier"}
                </button>
              </div>
              {promoStatus && (
                <p className={`pricing-promo__msg ${promoStatus.valid ? "pricing-promo__msg--ok" : "pricing-promo__msg--err"}`}>
                  {promoStatus.valid
                    ? promoStatus.finalAmountUsdCents != null
                      ? `✓ -${promoStatus.discountPercent}% → `
                        + `${(promoStatus.originalAmountUsdCents! / 100).toFixed(2)}$`
                        + ` → ${(promoStatus.finalAmountUsdCents / 100).toFixed(2)}$`
                      : `✓ Coupon valide — ${promoStatus.discountPercent}% de réduction`
                    : `✕ ${promoStatus.reason === "INVALID_CODE" ? "Code invalide" : promoStatus.reason === "EXPIRED" ? "Code expiré" : promoStatus.reason === "MONTHLY_QUOTA_REACHED" ? "Quota mensuel atteint" : promoStatus.reason ?? "Code non valide"}`}
                </p>
              )}
              {promoStatus?.valid && promoStatus.finalAmountUsdCents != null && (
                <p style={{ fontSize: 13, color: "var(--color-text-2, #c7bedf)", marginTop: 4 }}>
                  <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                    {(promoStatus.originalAmountUsdCents! / 100).toFixed(2)}$
                  </span>
                  {" → "}
                  <span style={{ color: "#4caf50", fontWeight: 700, fontSize: 16 }}>
                    {(promoStatus.finalAmountUsdCents / 100).toFixed(2)}$
                  </span>
                  <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>
                    (économie: {(promoStatus.discountAmountUsdCents! / 100).toFixed(2)}$)
                  </span>
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            className="pricing-payment__btn"
            disabled={busyPlanCode !== null}
            onClick={() => void handlePay()}
          >
            {busyPlanCode
              ? "Traitement…"
              : isIAPAvailable()
                ? "🍎 Acheter via App Store"
                : promoStatus?.valid && promoStatus.finalAmountUsdCents != null
                  ? `💳 Payer ${(promoStatus.finalAmountUsdCents / 100).toFixed(2)}$ via PayPal (-${promoStatus.discountPercent}%)`
                  : "💳 Payer avec PayPal"}
          </button>
          <br />
          <button type="button" className="pricing-payment__cancel" onClick={() => setPendingPlanCode(null)}>
            ✕ Annuler
          </button>
        </section>
      ) : null}

      {latestCheckout ? (
        <section className="pricing-payment">
          <h2 className="pricing-payment__title">Détails du paiement</h2>
          <p className="pricing-payment__text">
            Ordre {latestCheckout.orderId} · {(latestCheckout.amountUsdCents / 100).toFixed(2)} {latestCheckout.currency}
          </p>
          {latestCheckout.transferReference ? <p className="pricing-payment__text">Référence : <strong>{latestCheckout.transferReference}</strong></p> : null}
          {latestCheckout.expiresAt ? <p className="pricing-payment__text">Expire le : {new Date(latestCheckout.expiresAt).toLocaleString("fr-FR")}</p> : null}
          {latestCheckout.paymentUrl ? (
            <a href={latestCheckout.paymentUrl} className="pricing-payment__btn" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 12 }}>
              💳 Ouvrir PayPal — {(latestCheckout.amountUsdCents / 100).toFixed(2)}$
            </a>
          ) : null}
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--color-text-secondary, #aaa)', fontSize: 13 }}>
            {latestCheckout.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ───────────────  ORDERS  ─────────────── */}

      {isLoggedIn ? (
        <section className="pricing-orders">
          <h2 className="pricing-orders__title">Mes ordres de paiement</h2>
          {paymentOrders.length === 0 ? (
            <p className="pricing-orders__empty">Aucun ordre pour le moment.</p>
          ) : (
            <div>
              {paymentOrders.map((order) => (
                <article className="order-card" key={order.id}>
                  <p><strong>{order.planCode}</strong> · {(order.amountUsdCents / 100).toFixed(2)} {order.currency}</p>
                  <p>Référence : {order.transferReference}</p>
                  {order.status === "PENDING" && <span className="order-status order-status--pending">⏳ En attente</span>}
                  {order.status === "USER_CONFIRMED" && <span className="order-status order-status--pending">⏳ Validation en cours</span>}
                  {(order.status === "PAID" || order.status === "VALIDATED") && <span className="order-status order-status--ok">✓ Activé</span>}
                  {order.status === "FAILED" && <span className="order-status order-status--fail">✕ Échoué</span>}
                  {order.status === "CANCELED" && <span className="order-status order-status--fail">✕ Annulé</span>}
                  {order.status === "EXPIRED" && <span className="order-status order-status--expired">⏰ Expiré</span>}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ───────────────  COMPARATIF  ─────────────── */}
      <section className="pricing-section">
        <div className="pricing-section__header">
          <h2 className="pricing-section__title">Comparatif détaillé</h2>
          <p className="pricing-section__sub">Tous les forfaits côte à côte. Trouvez celui qui vous correspond.</p>
        </div>

        {/* ── Forfaits Utilisateurs ── */}
        <div className="comparison-label">
          <span className="comparison-label__icon">👤</span>
          <h3 className="comparison-label__text">Vendeurs</h3>
          <div className="comparison-label__line" />
        </div>
        <div className="comparison-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                <th>FREE · 0$</th>
                <th>BOOST · 6$/m</th>
                <th>AUTO · 12$/m</th>
                <th>PRO · 20$/m</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feat: 'Publications illimitées', vals: ['✅', '✅', '✅', '✅'] },
                { feat: 'Achat & messagerie', vals: ['✅', '✅', '✅', '✅'] },
                { feat: 'IA marchande (prix & négo)', vals: ['✅', '✅', '✅', '✅'] },
                { feat: 'Conseils IA post-publication', vals: ['1 offert', '✅', '✅', '✅'] },
                { feat: 'Publicité marketplace', vals: ['—', '✅', '✅', '✅'] },
                { feat: 'IA Commande (suivi & relances)', vals: ['—', '—', '✅', '✅'] },
                { feat: 'Kin-Sell Analytique', vals: ['—', '—', '—', '✅ Medium'] },
                { feat: 'Diagnostic de performance', vals: ['—', '—', '—', '✅'] },
                { feat: "Détection d'anomalies", vals: ['—', '—', '—', '✅'] },
                { feat: 'Tendances de marché', vals: ['—', '—', '—', '✅'] },
                { feat: 'Mémoire stratégique', vals: ['—', '—', '—', '✅'] },
                { feat: 'Analytics enrichi (Gemini)', vals: ['—', '—', '—', '✅'] },
                { feat: 'Boost profil / annonces', vals: ['Add-on', 'Add-on', 'Add-on', 'Add-on'] },
                { feat: 'Portée boost', vals: ['—', 'Local · National · Cross-border', 'Local · National · Cross-border', 'Local · National · Cross-border'] },
                { feat: 'Usage recommandé', vals: ['Découverte', 'Visibilité', 'Automatisation', 'Pilotage'] },
              ].map((row, i) => (
                <tr key={row.feat}>
                  <td>{row.feat}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} className={v === '—' ? 'val-no' : v.startsWith('✅') ? 'val-yes' : v === 'Add-on' ? 'val-addon' : 'val-info'}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Forfaits Business ── */}
        <div className="comparison-label">
          <span className="comparison-label__icon">🏢</span>
          <h3 className="comparison-label__text">Business</h3>
          <div className="comparison-label__line" />
        </div>
        <div className="comparison-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                <th>STARTER · 15$/m</th>
                <th>BUSINESS · 30$/m</th>
                <th>SCALE · 50$/m</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feat: 'Boutique dédiée', vals: ['✅', '✅', '✅'] },
                { feat: 'Publications illimitées', vals: ['✅', '✅', '✅'] },
                { feat: 'Profil business vérifiable', vals: ['✅', '✅', '✅'] },
                { feat: 'IA marchande (prix & négo)', vals: ['✅', '✅', '✅'] },
                { feat: 'Publicité marketplace', vals: ['✅', '✅', '✅'] },
                { feat: 'Conseils IA post-publication', vals: ['✅ illimité', '✅ illimité', '✅ illimité'] },
                { feat: 'IA Commande (suivi & relances)', vals: ['—', '✅', '✅'] },
                { feat: 'Kin-Sell Analytique', vals: ['—', '✅ Medium', '✅ Premium'] },
                { feat: 'Diagnostic de performance', vals: ['—', '✅', '✅'] },
                { feat: "Détection d'anomalies", vals: ['—', '✅', '✅'] },
                { feat: 'Tendances de marché', vals: ['—', '✅', '✅'] },
                { feat: 'Mémoire stratégique', vals: ['—', '✅', '✅'] },
                { feat: 'Analytics enrichi (Gemini)', vals: ['—', '✅', '✅'] },
                { feat: 'Publicité premium (homepage)', vals: ['—', '—', '✅'] },
                { feat: 'Boost boutique / annonces', vals: ['Add-on', 'Add-on', 'Add-on'] },
                { feat: 'Portée boost', vals: ['Local · National · Cross-border', 'Local · National · Cross-border', 'Local · National · Cross-border'] },
                { feat: 'Support dédié', vals: ['—', '—', '✅'] },
                { feat: 'Usage recommandé', vals: ['Lancement', 'Croissance', 'Expansion'] },
              ].map((row) => (
                <tr key={row.feat}>
                  <td>{row.feat}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} className={v === '—' ? 'val-no' : v.startsWith('✅') ? 'val-yes' : v === 'Add-on' ? 'val-addon' : 'val-info'}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────────────  IA KIN-SELL  ─────────────── */}
      <section className="pricing-section">
        <div className="pricing-section__header">
          <h2 className="pricing-section__title">4 intelligences artificielles, un seul objectif</h2>
          <p className="pricing-section__sub">
            Chaque IA couvre un maillon clé de votre activité. Certaines sont accessibles à tous, d{"'"}autres se débloquent avec votre forfait.
          </p>
        </div>

        {/* ── IA Marchande ── */}
        <div className="ia-block">
          <div className="ia-block__header">
            <div className="ia-block__icon">🤝</div>
            <div>
              <h3 className="ia-block__title">IA Marchande</h3>
              <span className="ia-block__avail">✅ Incluse dans tous les forfaits</span>
            </div>
          </div>
          <p className="ia-block__desc">
            Votre assistante de négociation personnelle. Elle analyse le marché local en temps réel pour vous suggérer le bon prix, conseille l{"'"}acheteur avant qu{"'"}il négocie, accompagne le vendeur dans ses décisions et peut répondre automatiquement aux offres en attente par lot.
          </p>
          <div className="ia-block__tags">
            {['Suggestion de prix', 'Conseil pré-négociation', 'Aide décision vendeur', 'Auto-réponse par lot'].map(t => (
              <span key={t} className="ia-tag">{t}</span>
            ))}
          </div>
        </div>

        {/* ── IA Commande ── */}
        <div className="ia-block">
          <div className="ia-block__header">
            <div className="ia-block__icon">📦</div>
            <div>
              <h3 className="ia-block__title">IA Commande</h3>
              <span className="ia-block__avail">✅ AUTO · PRO VENDEUR · BUSINESS · SCALE</span>
            </div>
          </div>
          <p className="ia-block__desc">
            Après la vente, l{"'"}IA Commande prend le relais. Elle suit chaque commande, relance automatiquement les acheteurs inactifs et aide à la validation des transactions. Moins de gestion manuelle, plus de ventes conclues.
          </p>
          <div className="ia-block__tags">
            {['Suivi intelligent', 'Relances auto', 'Auto-validation', 'Historique acheteur'].map(t => (
              <span key={t} className="ia-tag">{t}</span>
            ))}
          </div>
          <p className="ia-block__addon">📌 Disponible en add-on : 7$/mois (pour FREE, BOOST, STARTER)</p>
        </div>

        {/* ── IA Ads ── */}
        <div className="ia-block">
          <div className="ia-block__header">
            <div className="ia-block__icon">📢</div>
            <div>
              <h3 className="ia-block__title">IA Ads</h3>
              <span className="ia-block__avail">✅ Conseils post-publication : tous les forfaits</span>
            </div>
          </div>
          <p className="ia-block__desc">
            Après chaque publication, l{"'"}IA analyse votre annonce et produit des recommandations ciblées : timing, budget, ciblage. En parallèle, Kin-Sell génère ses propres campagnes internes via Gemini avec un contexte marché régional.
          </p>
          <div className="ia-block__tags">
            {['Conseils post-publication', 'Ciblage intelligent', 'Analyse performance', 'Campagnes Kin-Sell autonomes'].map(t => (
              <span key={t} className="ia-tag">{t}</span>
            ))}
          </div>
          <div className="ia-detail-box">
            <div className="ia-detail-box__title">Fonctionnement interne</div>
            <p className="ia-detail-box__text">
              Kin-Sell génère automatiquement des publicités internes via Gemini 2.5 Flash, enrichies par le contexte marché régional. Ces campagnes tournent par catégorie et par ville, avec un quota IA journalier maîtrisé et un cache intelligent.
            </p>
          </div>
        </div>

        {/* ── Kin-Sell Analytique ── */}
        <div className="ia-block">
          <div className="ia-block__header">
            <div className="ia-block__icon ia-block__icon--green">📊</div>
            <div>
              <h3 className="ia-block__title">Kin-Sell Analytique</h3>
              <span className="ia-block__avail">✅ PRO VENDEUR · BUSINESS (Medium) · SCALE (Premium)</span>
            </div>
          </div>
          <p className="ia-block__desc">
            Le moteur d{"'"}intelligence stratégique. Il combine vos données internes avec des données marché externes via Gemini pour produire des analyses fiables avec un niveau de confiance explicite.
          </p>
          <div className="analytique-grid">
            <div className="analytique-card">
              <div className="analytique-card__label analytique-card__label--medium">Medium</div>
              <ul className="analytique-card__list">
                <li>Diagnostic de performance vendeur</li>
                <li>Détection d{"'"}anomalies (ventes, prix, vues)</li>
                <li>Tendances marché par catégorie</li>
                <li>Analytics enrichi (données Gemini)</li>
                <li>Mémoire stratégique</li>
              </ul>
              <div className="analytique-card__plans">✅ PRO VENDEUR · BUSINESS</div>
            </div>
            <div className="analytique-card analytique-card--premium">
              <div className="analytique-card__label analytique-card__label--premium">Premium</div>
              <ul className="analytique-card__list">
                <li>Tout Medium inclus</li>
                <li>Prédictions de demande</li>
                <li>Recommandations stratégiques</li>
                <li>Rapport complet enrichi</li>
                <li>Score de confiance par source</li>
              </ul>
              <div className="analytique-card__plans">✅ SCALE uniquement</div>
            </div>
          </div>
          <div className="ia-attribution">
            <div className="ia-attribution__title">Niveau de confiance & sources</div>
            <p className="ia-attribution__text">
              Chaque insight indique sa source : données internes Kin-Sell, données externes (Gemini + Google Search), ou combinaison hybride. Un score de confiance accompagne chaque analyse.
            </p>
          </div>
        </div>

        {/* ── Boost ── */}
        <div className="boost-block">
          <div className="boost-block__header">
            <span style={{ fontSize: 22 }}>🚀</span>
            <h3 className="boost-block__title">Boost & portée géographique</h3>
            <span className="boost-block__price-tag">Add-on · à partir de 1$/24h</span>
          </div>
          <p className="boost-block__desc">
            Boostez la visibilité de vos annonces ou de votre boutique avec une portée géographique adaptée à votre marché. Disponible sur tous les forfaits.
          </p>
          <div className="boost-scopes">
            {[
              { scope: 'Local', mult: '×1', desc: 'Votre ville' },
              { scope: 'National', mult: '×2.5', desc: 'Tout le pays' },
              { scope: 'Cross-border', mult: '×5', desc: 'Pays limitrophes' },
            ].map(s => (
              <div key={s.scope} className="boost-scope">
                <div className="boost-scope__name">{s.scope}</div>
                <div className="boost-scope__mult">{s.mult}</div>
                <div className="boost-scope__desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────  RÉSULTATS ATTENDUS  ─────────────── */}
      <section className="pricing-section">
        <div className="pricing-section__header">
          <h2 className="pricing-section__title">L{"'"}impact réel sur votre activité</h2>
          <p className="pricing-section__sub">
            Pas de chiffres inventés. Voici ce qui change concrètement à chaque palier.
          </p>
        </div>

        {/* ── Parcours Vendeurs ── */}
        <div className="results-timeline" style={{ marginBottom: 32 }}>
          <div className="results-label">
            <span className="results-label__icon">👤</span>
            <h3 className="results-label__text">Parcours Vendeur</h3>
            <div className="results-label__line" />
          </div>
          {[
            {
              plan: 'FREE', price: '0$', accent: 'var(--color-text-secondary, #aaa)', borderColor: 'rgba(111,88,255,0.06)',
              bgTag: 'rgba(111,88,255,0.08)', title: 'Vendez librement, dès maintenant',
              detail: 'Publications illimitées, messagerie directe et IA Marchande pour fixer le bon prix et négocier avec assurance. Tout ce qu\'il faut pour conclure votre première vente sur Kin-Sell.',
              unlock: null,
            },
            {
              plan: 'BOOST', price: '6$/mois', accent: '#6f58ff', borderColor: 'rgba(111,88,255,0.12)',
              bgTag: 'rgba(111,88,255,0.12)', title: 'Vos annonces deviennent visibles',
              detail: 'La publicité marketplace place vos annonces devant les acheteurs qui cherchent activement. L\'IA Ads analyse chaque publication et vous recommande comment la rendre plus performante.',
              unlock: 'Publicité marketplace + conseils IA Ads',
            },
            {
              plan: 'AUTO', price: '12$/mois', accent: '#6f58ff', borderColor: 'rgba(111,88,255,0.15)',
              bgTag: 'rgba(111,88,255,0.12)', title: 'Vos ventes tournent sans vous',
              detail: 'L\'IA Commande structure vos échanges, relance les acheteurs silencieux et vous aide à valider chaque transaction. Le temps gagné, vous le consacrez à vendre plus.',
              unlock: 'IA Commande (suivi, relances, validation)',
            },
            {
              plan: 'PRO VENDEUR', price: '20$/mois', accent: '#4caf50', borderColor: 'rgba(76,175,80,0.15)',
              bgTag: 'rgba(76,175,80,0.12)', title: 'Vous comprenez votre marché avant les autres',
              detail: 'Kin-Sell Analytique Medium vous donne un diagnostic complet : performance produits, anomalies de prix, tendances par catégorie et mémoire stratégique. Vos décisions reposent sur des données réelles.',
              unlock: 'Analytique Medium + mémoire stratégique',
            },
          ].map((r, i) => (
            <div key={r.plan} className="results-step">
              {i < 3 && <div className="results-step__connector" style={{ background: 'rgba(111,88,255,0.08)' }} />}
              <div className="results-step__dot" style={{ background: i === 3 ? 'rgba(76,175,80,0.15)' : 'rgba(111,88,255,0.1)', border: `2px solid ${r.accent}` }}>
                <div className="results-step__dot-inner" style={{ background: r.accent }} />
              </div>
              <div className="results-step__card" style={{ background: 'rgba(111,88,255,0.02)', border: `1px solid ${r.borderColor}` }}>
                <div className="results-step__meta">
                  <span className="results-step__tag" style={{ background: r.bgTag, color: r.accent }}>{r.plan}</span>
                  <span className="results-step__price">{r.price}</span>
                  {r.unlock && <span className="results-step__unlock" style={{ color: '#6f58ff' }}>+ {r.unlock}</span>}
                </div>
                <h4 className="results-step__title">{r.title}</h4>
                <p className="results-step__detail">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Parcours Business ── */}
        <div className="results-timeline">
          <div className="results-label">
            <span className="results-label__icon">🏢</span>
            <h3 className="results-label__text">Parcours Business</h3>
            <div className="results-label__line" />
          </div>
          {[
            {
              plan: 'STARTER', price: '15$/mois', accent: '#6f58ff', borderColor: 'rgba(111,88,255,0.12)',
              bgTag: 'rgba(111,88,255,0.12)', bg: 'rgba(111,88,255,0.02)',
              title: 'Votre entreprise a une vitrine crédible',
              detail: 'Boutique dédiée avec profil vérifiable et publicité marketplace. Vos clients trouvent votre catalogue complet au même endroit et vous identifient comme un professionnel établi.',
              unlock: null,
            },
            {
              plan: 'BUSINESS', price: '30$/mois', accent: '#4caf50', borderColor: 'rgba(76,175,80,0.12)',
              bgTag: 'rgba(76,175,80,0.12)', bg: 'rgba(111,88,255,0.02)',
              title: 'Automatisation et intelligence réunies',
              detail: 'L\'IA Commande gère le suivi de vos transactions pendant que l\'Analytique Medium vous livre un diagnostic clair : performances, anomalies, tendances et mémoire stratégique.',
              unlock: 'IA Commande + Analytique Medium + mémoire',
            },
            {
              plan: 'SCALE', price: '50$/mois', accent: '#ff9800', borderColor: 'rgba(255,152,0,0.15)',
              bgTag: 'rgba(255,152,0,0.12)', bg: 'rgba(255,152,0,0.02)',
              title: 'Chaque décision devient un avantage concurrentiel',
              detail: 'Analytique Premium : prédictions de demande, recommandations stratégiques et score de confiance par source. Publicité homepage, support dédié. Tous les outils Kin-Sell débloqués.',
              unlock: 'Analytique Premium + prédictions + homepage ads',
            },
          ].map((r, i) => (
            <div key={r.plan} className="results-step">
              {i < 2 && <div className="results-step__connector" style={{ background: i === 1 ? 'rgba(255,152,0,0.1)' : 'rgba(111,88,255,0.08)' }} />}
              <div className="results-step__dot" style={{ background: i === 2 ? 'rgba(255,152,0,0.15)' : i === 1 ? 'rgba(76,175,80,0.15)' : 'rgba(111,88,255,0.1)', border: `2px solid ${r.accent}` }}>
                <div className="results-step__dot-inner" style={{ background: r.accent }} />
              </div>
              <div className="results-step__card" style={{ background: r.bg, border: `1px solid ${r.borderColor}` }}>
                <div className="results-step__meta">
                  <span className="results-step__tag" style={{ background: r.bgTag, color: r.accent }}>{r.plan}</span>
                  <span className="results-step__price">{r.price}</span>
                  {r.unlock && <span className="results-step__unlock" style={{ color: r.accent }}>+ {r.unlock}</span>}
                </div>
                <h4 className="results-step__title">{r.title}</h4>
                <p className="results-step__detail">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────  FAQ  ─────────────── */}
      <section className="pricing-section">
        <div className="pricing-section__header">
          <h2 className="pricing-section__title">Questions fréquentes</h2>
        </div>
        <div className="faq-list">
          {faqData.map((item, i) => (
            <div key={i} className={`faq-item${openFaq === i ? ' faq-item--open' : ''}`}>
              <button type="button" className="faq-item__q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {item.q}
                <span className="faq-item__chevron">▼</span>
              </button>
              {openFaq === i && <p className="faq-item__a">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────  CTA FINAL  ─────────────── */}
      <section className="pricing-cta-final">
        <h2 className="pricing-cta-final__title">Prêt à vendre plus intelligemment ?</h2>
        <p className="pricing-cta-final__text">
          Rejoignez les vendeurs et entreprises qui utilisent Kin-Sell pour accélérer leur activité à Kinshasa.
        </p>
        {isLoggedIn ? (
          <button type="button" className="pricing-cta-final__btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Choisir mon plan →
          </button>
        ) : (
          <Link className="pricing-cta-final__btn" to="/register">
            Créer mon compte Kin-Sell
          </Link>
        )}
      </section>
    </div>
  );
}
