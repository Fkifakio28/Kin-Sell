import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { billing, type BillingPlanSummary, ApiError } from "../../lib/api-client";
import { SeoMeta } from "../../components/SeoMeta";
import "./pricing.css";

type PricingTab = "users" | "business" | "addons";
type PayMethod = "paypal" | "bank" | "orange" | "mpesa";

type Plan = {
  code: string;
  name: string;
  price: string;
  highlight?: string;
  features: string[];
  badge?: string;
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
  paymentUrl?: string;
  beneficiary?: { iban: string; bic: string; rib?: string | null };
  expiresAt: string;
  instructions: string[];
};

const USER_PLANS: Plan[] = [
  {
    code: "FREE",
    name: "FREE",
    price: "0$/mois",
    badge: "Base",
    highlight: "Point fort: IA marchand gratuite",
    features: ["Publier des annonces", "Acheter sur Kin-Sell", "Messagerie intégrée", "IA marchand gratuite"]
  },
  {
    code: "BOOST",
    name: "BOOST",
    price: "6$/mois",
    badge: "Visibilité",
    features: ["Boost profil", "Boost annonces", "Publicité basique", "Visibilité améliorée"]
  },
  {
    code: "AUTO",
    name: "AUTO",
    price: "12$/mois",
    badge: "Automation",
    features: ["Tout BOOST", "IA commande", "Auto-réponse", "Gestion des ventes"]
  },
  {
    code: "PRO_VENDOR",
    name: "PRO VENDEUR",
    price: "20$/mois",
    badge: "Analytics Medium",
    features: ["Tout AUTO", "Kin-Sell Analytique Medium", "Tendances marché", "Prix optimal"]
  }
];

const BUSINESS_PLANS: Plan[] = [
  {
    code: "STARTER",
    name: "STARTER",
    price: "15$/mois",
    badge: "Entrée",
    features: ["Boutique entreprise", "Visibilité standard", "Publicité basique", "Sans IA / sans analytics"]
  },
  {
    code: "BUSINESS",
    name: "BUSINESS",
    price: "30$/mois",
    badge: "Croissance",
    features: ["Tout STARTER", "IA marchand", "Analytics Medium", "Optimisation opérationnelle"]
  },
  {
    code: "SCALE",
    name: "SCALE",
    price: "50$/mois",
    badge: "Premium",
    features: ["Tout BUSINESS", "IA commande", "Analytics Premium", "Insights et stratégie avancés"]
  }
];

const ADDONS: Array<{ code: AddonCode; name: string; price: string; details: string[] }> = [
  {
    code: "IA_MERCHANT",
    name: "IA MARCHAND (add-on)",
    price: "3$/mois",
    details: ["Aide négociation", "Suggestion prix", "Contre-offres", "Gratuite uniquement pour utilisateur FREE"]
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
  onChoose
}: {
  plan: Plan;
  isCurrent: boolean;
  canChange: boolean;
  loading: boolean;
  onChoose: (code: string) => void;
}) {
  return (
    <article className="pricing-card glass-card">
      <div className="pricing-card-head">
        <h3>{plan.name}</h3>
        {plan.badge ? <span className="pricing-card-badge">{plan.badge}</span> : null}
      </div>
      <p className="pricing-card-price">{plan.price}</p>
      {plan.highlight ? <p className="pricing-card-highlight">{plan.highlight}</p> : null}
      <ul className="pricing-list">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {isCurrent ? (
        <span className="pricing-current">Plan actif</span>
      ) : canChange ? (
        <button className="pricing-cta pricing-cta-btn" type="button" onClick={() => onChoose(plan.code)} disabled={loading}>
          {loading ? "Traitement..." : "Choisir ce forfait"}
        </button>
      ) : (
        <Link className="pricing-cta" to="/register">Créer un compte</Link>
      )}
    </article>
  );
}

const PAY_LABELS: Record<PayMethod, string> = {
  paypal: "💳 PayPal",
  bank: "🏦 Virement bancaire (Nickel)",
  orange: "🟠 Orange Money",
  mpesa: "📱 M-Pesa",
};

export function PricingPage() {
  const { user, isLoggedIn } = useAuth();
  const { t } = useLocaleCurrency();
  const [currentPlan, setCurrentPlan] = useState<BillingPlanSummary | null>(null);
  const [busyPlanCode, setBusyPlanCode] = useState<string | null>(null);
  const [busyAddonCode, setBusyAddonCode] = useState<string | null>(null);
  const [busyOrderAction, setBusyOrderAction] = useState<string | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [latestCheckout, setLatestCheckout] = useState<CheckoutResult | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Payment method + mobile money fields
  const [payMethod, setPayMethod] = useState<PayMethod>("paypal");
  const [momoPhone, setMomoPhone] = useState("");
  const [momoAmountCDF, setMomoAmountCDF] = useState(0);
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);

  const role = user?.role === "BUSINESS" ? "BUSINESS" : user?.role === "USER" ? "USER" : "VISITOR";

  const defaultTab: PricingTab = useMemo(() => {
    if (role === "BUSINESS") return "business";
    if (role === "USER") return "users";
    return "users";
  }, [role]);

  const [activeTab, setActiveTab] = useState<PricingTab>(defaultTab);

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
    if (paid !== "1" || !orderId) return;

    // Clean URL params immediately
    window.history.replaceState({}, "", window.location.pathname);

    let cancelled = false;
    const capture = async () => {
      setInfoMessage("Finalisation du paiement PayPal en cours…");
      try {
        const result = await billing.capturePaypalCheckout({ orderId });
        if (!cancelled) {
          setInfoMessage(result.message || "Paiement PayPal confirmé ! Votre forfait est activé.");
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
    setLatestCheckout(null);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handlePay = async () => {
    if (!pendingPlanCode) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setBusyPlanCode(pendingPlanCode);

    try {
      if (payMethod === "paypal") {
        const result = await billing.createPaypalCheckout({ planCode: pendingPlanCode, billingCycle: "MONTHLY" });
        setLatestCheckout(result);
        // Redirect to PayPal
        if (result.paymentUrl) {
          window.open(result.paymentUrl, "_blank", "noopener,noreferrer");
        }
        setInfoMessage(`Ordre créé. Payez sur PayPal puis votre forfait sera activé automatiquement.`);
      } else if (payMethod === "bank") {
        const result = await billing.createBankTransferCheckout({ planCode: pendingPlanCode, billingCycle: "MONTHLY" });
        setLatestCheckout(result);
        setInfoMessage(`Ordre créé. Effectuez le virement puis confirmez.`);
      } else if (payMethod === "orange" || payMethod === "mpesa") {
        if (!momoPhone.match(/^243\d{9}$/)) {
          setErrorMessage("Numéro invalide. Format: 243XXXXXXXXX");
          setBusyPlanCode(null);
          return;
        }
        if (momoAmountCDF < 100) {
          setErrorMessage("Montant CDF minimum: 100");
          setBusyPlanCode(null);
          return;
        }
        const result = await billing.createMobileMoneyCheckout({
          planCode: pendingPlanCode,
          billingCycle: "MONTHLY",
          provider: payMethod === "orange" ? "ORANGE_MONEY" : "MPESA",
          phoneNumber: momoPhone,
          amountCDF: momoAmountCDF,
        });
        setLatestCheckout({
          orderId: result.paymentOrder.orderId,
          status: "PENDING",
          planCode: result.paymentOrder.planCode,
          amountUsdCents: result.paymentOrder.amountUsdCents,
          currency: "USD",
          transferReference: "",
          expiresAt: "",
          instructions: payMethod === "orange"
            ? ["Vous allez être redirigé vers Orange Money.", "Validez le paiement sur votre téléphone."]
            : ["Un push USSD a été envoyé sur votre téléphone.", "Validez le paiement M-Pesa."],
        });
        if (result.mobileMoney.redirectUrl) {
          window.open(result.mobileMoney.redirectUrl, "_blank", "noopener,noreferrer");
        }
        setInfoMessage(payMethod === "orange"
          ? "Paiement Orange Money initié. Validez sur votre téléphone."
          : "Paiement M-Pesa initié. Validez le push USSD sur votre téléphone."
        );
      }

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

  const handleConfirmDeposit = async (orderId: string) => {
    setBusyOrderAction(orderId);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await billing.confirmDeposit({ orderId });
      const orders = await billing.paymentOrders();
      setPaymentOrders(orders.orders);
      setInfoMessage(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? "Impossible de confirmer le dépôt.");
      } else {
        setErrorMessage("Impossible de confirmer le dépôt.");
      }
    } finally {
      setBusyOrderAction(null);
    }
  };

  // handleActivateOrder supprimé — l'activation ne peut plus se faire côté frontend.
  // Seuls PayPal (capture auto) ou un super admin (validation manuelle) peuvent activer un forfait.

  const handleToggleAddon = async (addonCode: AddonCode) => {
    if (!isLoggedIn || !currentPlan) {
      setInfoMessage("Connectez-vous et activez un forfait pour gérer les add-ons.");
      return;
    }

    const isActive = currentPlan.addOns.some((item) => item.code === addonCode && item.status === "ACTIVE");

    setErrorMessage(null);
    setInfoMessage(null);
    setBusyAddonCode(addonCode);

    try {
      const updated = await billing.toggleAddon({ addonCode, action: isActive ? "DISABLE" : "ENABLE" });
      setCurrentPlan(updated);
      setInfoMessage(isActive ? `${addonCode} désactivé.` : `${addonCode} activé.`);
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? "Impossible de modifier l'add-on.");
      } else {
        setErrorMessage("Impossible de modifier l'add-on.");
      }
    } finally {
      setBusyAddonCode(null);
    }
  };

  const roleHint =
    role === "USER"
      ? "Mode utilisateur: offres utilisateurs et add-ons affichés en priorité."
      : role === "BUSINESS"
        ? "Mode entreprise: offres entreprises et add-ons affichés en priorité."
        : "Mode visiteur: comparez librement les offres utilisateurs, entreprises et options avancées.";

  return (
    <section className="pricing-shell animate-fade-in">
      <SeoMeta
        title="Tarifs et abonnements | Kin-Sell"
        description="Choisissez le plan adapté à vos besoins: FREE, BOOST, AUTO, PRO VENDEUR pour les particuliers; STARTER, BUSINESS, SCALE pour les entreprises."
        canonical="https://kin-sell.com/pricing"
      />
      <header className="pricing-hero glass-container">
        <p className="pricing-eyebrow">{t('pricing.eyebrow')}</p>
        <h1>{t('pricing.title')}</h1>
        <p>{t('pricing.subtitle')}</p>
        <div className="pricing-role-hint">{roleHint}</div>
        {currentPlan ? (
          <div className="pricing-role-hint">
            Forfait actif: {currentPlan.planName} ({(currentPlan.priceUsdCents / 100).toFixed(2)}$ / {currentPlan.billingCycle === "MONTHLY" ? "mois" : "one-shot"})
          </div>
        ) : null}
        {infoMessage ? <div className="pricing-feedback pricing-feedback--ok">{infoMessage}</div> : null}
        {errorMessage ? <div className="pricing-feedback pricing-feedback--error">{errorMessage}</div> : null}
      </header>

      <section className="pricing-tabs-wrap glass-container">
        <div className="pricing-tabs" role="tablist" aria-label={t('pricing.tabsLabel')}>
          <button type="button" className={`pricing-tab${activeTab === "users" ? " active" : ""}`} onClick={() => setActiveTab("users")}>{t('pricing.tabUsers')}</button>
          <button type="button" className={`pricing-tab${activeTab === "business" ? " active" : ""}`} onClick={() => setActiveTab("business")}>{t('pricing.tabBusiness')}</button>
          <button type="button" className={`pricing-tab${activeTab === "addons" ? " active" : ""}`} onClick={() => setActiveTab("addons")}>{t('pricing.tabAddons')}</button>
        </div>

        <div className="pricing-role-switch">
          {role === "USER" ? <button type="button" className="pricing-switch-btn" onClick={() => setActiveTab("business")}>{t('pricing.viewBusiness')}</button> : null}
          {role === "BUSINESS" ? <button type="button" className="pricing-switch-btn" onClick={() => setActiveTab("users")}>{t('pricing.viewUsers')}</button> : null}
          {role === "VISITOR" ? <span className="pricing-visitor-note">{t('pricing.fullComparison')}</span> : null}
        </div>
      </section>

      {activeTab === "users" ? (
        <section className="pricing-grid">
          {USER_PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              isCurrent={currentPlan?.planCode === plan.code}
              canChange={isLoggedIn && busyPlanCode === null}
              loading={busyPlanCode === plan.code}
              onChoose={handleChoosePlan}
            />
          ))}
        </section>
      ) : null}

      {activeTab === "business" ? (
        <section className="pricing-grid pricing-grid--business">
          {BUSINESS_PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              isCurrent={currentPlan?.planCode === plan.code}
              canChange={isLoggedIn && busyPlanCode === null}
              loading={busyPlanCode === plan.code}
              onChoose={handleChoosePlan}
            />
          ))}
        </section>
      ) : null}

      {activeTab === "addons" ? (
        <section className="pricing-grid pricing-grid--addons">
          {ADDONS.map((addon) => (
            <article className="pricing-card glass-card" key={addon.name}>
              <div className="pricing-card-head">
                <h3>{addon.name}</h3>
              </div>
              <p className="pricing-card-price">{addon.price}</p>
              <ul className="pricing-list">
                {addon.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              {isLoggedIn ? (
                <button type="button" className="pricing-cta pricing-cta-btn" onClick={() => void handleToggleAddon(addon.code)} disabled={busyAddonCode !== null}>
                  {busyAddonCode === addon.code ? "Mise à jour..." : "Activer / désactiver"}
                </button>
              ) : null}
            </article>
          ))}

          <article className="pricing-card glass-card pricing-card--analytics-lock">
            <div className="pricing-card-head">
              <h3>Analytics</h3>
              <span className="pricing-card-badge">Important</span>
            </div>
            <p className="pricing-card-price">Uniquement en pack</p>
            <ul className="pricing-list">
              <li>Analytics Medium: tendances, prix, produits populaires</li>
              <li>Analytics Premium: Medium + prédictions + stratégie</li>
              <li>Non disponible en add-on individuel</li>
            </ul>
          </article>
        </section>
      ) : null}

      {pendingPlanCode ? (
        <section className="pricing-footer-note glass-container">
          <h2>Choisir votre méthode de paiement — {pendingPlanCode}</h2>
          <div className="pricing-role-switch" style={{ flexWrap: "wrap", gap: "8px" }}>
            {(["paypal", "bank", "orange", "mpesa"] as PayMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`pricing-switch-btn${payMethod === m ? " active" : ""}`}
                style={payMethod === m ? { background: "rgba(111,88,255,0.35)", borderColor: "rgba(185,166,255,0.8)" } : {}}
                onClick={() => setPayMethod(m)}
              >
                {PAY_LABELS[m]}
              </button>
            ))}
          </div>

          {(payMethod === "orange" || payMethod === "mpesa") ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                Numéro de téléphone (format: 243XXXXXXXXX)
              </label>
              <input
                type="tel"
                placeholder="243970000000"
                value={momoPhone}
                onChange={(e) => setMomoPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
                style={{
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid var(--glass-border)",
                  background: "rgba(111,88,255,0.08)",
                  color: "var(--color-text-primary)",
                  fontFamily: "inherit",
                  fontSize: "14px",
                }}
              />
              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                Montant en CDF (Francs Congolais)
              </label>
              <input
                type="number"
                placeholder="5000"
                value={momoAmountCDF || ""}
                onChange={(e) => setMomoAmountCDF(Number(e.target.value))}
                style={{
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid var(--glass-border)",
                  background: "rgba(111,88,255,0.08)",
                  color: "var(--color-text-primary)",
                  fontFamily: "inherit",
                  fontSize: "14px",
                }}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="pricing-cta pricing-cta-btn"
            style={{ marginTop: "12px", fontSize: "15px", padding: "12px 20px" }}
            disabled={busyPlanCode !== null}
            onClick={() => void handlePay()}
          >
            {busyPlanCode ? "Traitement..." : `Payer avec ${PAY_LABELS[payMethod]}`}
          </button>
          <button
            type="button"
            className="pricing-switch-btn"
            style={{ alignSelf: "flex-start", fontSize: "12px" }}
            onClick={() => setPendingPlanCode(null)}
          >
            ✕ Annuler
          </button>
        </section>
      ) : null}

      {latestCheckout ? (
        <section className="pricing-footer-note glass-container">
          <h2>Détails du paiement</h2>
          <p>Ordre {latestCheckout.orderId} · {(latestCheckout.amountUsdCents / 100).toFixed(2)} {latestCheckout.currency}</p>
          {latestCheckout.transferReference ? <p>Référence: <strong>{latestCheckout.transferReference}</strong></p> : null}
          {latestCheckout.expiresAt ? <p>Expire le: {new Date(latestCheckout.expiresAt).toLocaleString("fr-FR")}</p> : null}

          {latestCheckout.paymentUrl ? (
            <a
              href={latestCheckout.paymentUrl}
              className="pricing-cta pricing-cta-btn"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", textAlign: "center", textDecoration: "none", marginTop: "8px" }}
            >
              💳 Ouvrir PayPal — {(latestCheckout.amountUsdCents / 100).toFixed(2)}$
            </a>
          ) : null}

          {latestCheckout.beneficiary ? (
            <div style={{ marginTop: "8px" }}>
              <p>IBAN: <strong>{latestCheckout.beneficiary.iban}</strong></p>
              <p>BIC: <strong>{latestCheckout.beneficiary.bic}</strong></p>
              {latestCheckout.beneficiary.rib ? <p>RIB: {latestCheckout.beneficiary.rib}</p> : null}
            </div>
          ) : null}

          <ul className="pricing-list" style={{ marginTop: 12 }}>
            {latestCheckout.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {isLoggedIn ? (
        <section className="pricing-footer-note glass-container">
          <h2>Mes ordres de paiement</h2>
          {paymentOrders.length === 0 ? (
            <p>Aucun ordre pour le moment.</p>
          ) : (
            <div className="pricing-orders-list">
              {paymentOrders.map((order) => (
                <article className="pricing-order-item" key={order.id}>
                  <p><strong>{order.planCode}</strong> · {(order.amountUsdCents / 100).toFixed(2)} {order.currency}</p>
                  <p>Référence: {order.transferReference}</p>
                  <p>Statut: {order.status}</p>
                  <div className="pricing-role-switch">
                    {order.status === "PENDING" ? (
                      <button
                        type="button"
                        className="pricing-switch-btn"
                        disabled={busyOrderAction !== null}
                        onClick={() => void handleConfirmDeposit(order.id)}
                      >
                        {busyOrderAction === order.id ? "En cours..." : "J'ai payé"}
                      </button>
                    ) : null}
                    {order.status === "USER_CONFIRMED" ? (
                      <span className="pricing-current">⏳ En attente de validation admin</span>
                    ) : null}
                    {order.status === "PAID" || order.status === "VALIDATED" ? (
                      <span className="pricing-current">✅ Forfait activé</span>
                    ) : null}
                    {order.status === "FAILED" ? (
                      <span className="pricing-current" style={{ color: "var(--color-error, #f44)" }}>❌ Paiement échoué</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="pricing-footer-note glass-container">
        <h2>Méthodes de paiement acceptées</h2>
        <p>
          💳 PayPal · 🏦 Virement bancaire (Nickel) · 🟠 Orange Money · 📱 M-Pesa — Paiement sécurisé avec confirmation automatique.
        </p>
        {!isLoggedIn ? <Link to="/register" className="pricing-cta">Créer un compte Kin-Sell</Link> : null}
      </section>

      {/* ═══════════════  MATRICE DE COMPARAISON  ═══════════════ */}
      <section className="glass-container" style={{ marginTop: 32, padding: '24px 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginBottom: 24 }}>
          📊 Comparaison des forfaits
        </h2>

        {/* ── Forfaits Utilisateurs ── */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#6f58ff', marginBottom: 12 }}>Forfaits Utilisateurs</h3>
        <div style={{ overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(111,88,255,0.2)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--color-text-secondary, #aaa)' }}>Fonctionnalité</th>
                {['FREE', 'BOOST', 'AUTO', 'PRO VENDEUR'].map(p => (
                  <th key={p} style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--color-text-primary, #fff)', fontWeight: 600, minWidth: 80 }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feat: 'Publications', vals: ['3/jour', '10/jour', '15/jour', 'Illimité'] },
                { feat: 'Négociations IA', vals: ['❌', '❌', '✅ Assistée', '✅ Avancée'] },
                { feat: 'IA Ads (conseils boost)', vals: ['❌', '✅ Basic', '✅ Avancé', '✅ Premium'] },
                { feat: 'IA Commande', vals: ['❌', '❌', 'Add-on', '✅ Inclus'] },
                { feat: 'Kin-Sell Analytique', vals: ['❌', '❌', '❌', '✅ Medium'] },
                { feat: 'Boost visibilité', vals: ['❌', '✅', '✅', '✅'] },
                { feat: 'Badge vendeur', vals: ['❌', '❌', '✅', '✅ Pro'] },
                { feat: 'Support prioritaire', vals: ['❌', '❌', '❌', '✅'] },
              ].map((row, i) => (
                <tr key={row.feat} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(111,88,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-primary, #fff)', fontWeight: 500 }}>{row.feat}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} style={{ textAlign: 'center', padding: '8px 6px', color: v.startsWith('❌') ? 'rgba(255,255,255,0.3)' : v.startsWith('✅') ? '#4caf50' : 'var(--color-text-secondary, #aaa)' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Forfaits Business ── */}
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#6f58ff', marginBottom: 12 }}>Forfaits Business</h3>
        <div style={{ overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(111,88,255,0.2)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--color-text-secondary, #aaa)' }}>Fonctionnalité</th>
                {['STARTER', 'BUSINESS', 'SCALE'].map(p => (
                  <th key={p} style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--color-text-primary, #fff)', fontWeight: 600, minWidth: 100 }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feat: 'Boutique en ligne', vals: ['✅', '✅', '✅'] },
                { feat: 'Publications', vals: ['15/jour', '50/jour', 'Illimité'] },
                { feat: 'IA Marchande (auto-négo)', vals: ['❌', '✅ Inclus', '✅ Inclus'] },
                { feat: 'IA Commande (auto-vente)', vals: ['❌', 'Add-on', '✅ Inclus'] },
                { feat: 'IA Ads (conseils boost)', vals: ['✅ Basic', '✅ Avancé', '✅ Premium'] },
                { feat: 'Kin-Sell Analytique', vals: ['❌', '✅ Medium', '✅ Premium'] },
                { feat: 'Panneau de stats avancé', vals: ['✅ Basic', '✅ Avancé', '✅ Premium'] },
                { feat: 'Support prioritaire', vals: ['❌', '✅', '✅ Dédié'] },
                { feat: 'Badge entreprise', vals: ['✅', '✅ Gold', '✅ Diamond'] },
              ].map((row, i) => (
                <tr key={row.feat} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(111,88,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-primary, #fff)', fontWeight: 500 }}>{row.feat}</td>
                  {row.vals.map((v, j) => (
                    <td key={j} style={{ textAlign: 'center', padding: '8px 6px', color: v.startsWith('❌') ? 'rgba(255,255,255,0.3)' : v.startsWith('✅') ? '#4caf50' : 'var(--color-text-secondary, #aaa)' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════════  IA INCLUSES PAR PLAN  ═══════════════ */}
      <section className="glass-container" style={{ marginTop: 24, padding: '24px 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginBottom: 20 }}>
          🤖 Intelligences Artificielles par forfait
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { name: 'IA Marchande', icon: '🤝', desc: 'Répond et négocie automatiquement en vous représentant.', plans: 'BUSINESS, SCALE', addon: 'IA_MERCHANT (3$/mois)' },
            { name: 'IA Commande', icon: '📦', desc: 'Automatise les confirmations de vente, relances et suivi.', plans: 'PRO VENDEUR, SCALE', addon: 'IA_ORDER (7$/mois)' },
            { name: 'IA Ads', icon: '📢', desc: 'Conseils personnalisés pour booster articles et boutique.', plans: 'BOOST+', addon: null },
            { name: 'Kin-Sell Analytique', icon: '📊', desc: 'Analyses marché, tendances prix, diagnostics de performance.', plans: 'PRO VENDEUR (Medium), BUSINESS (Medium), SCALE (Premium)', addon: null },
          ].map(ia => (
            <div key={ia.name} style={{ background: 'rgba(111,88,255,0.05)', border: '1px solid rgba(111,88,255,0.12)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{ia.icon}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>{ia.name}</h3>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>{ia.desc}</p>
              <div style={{ fontSize: 11, color: '#4caf50', marginBottom: 4 }}>✅ Inclus dans : {ia.plans}</div>
              {ia.addon && <div style={{ fontSize: 11, color: '#ff9800' }}>🔌 Ou en add-on : {ia.addon}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════  RÉSULTATS ATTENDUS  ═══════════════ */}
      <section className="glass-container" style={{ marginTop: 24, padding: '24px 20px', marginBottom: 40 }}>
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginBottom: 20 }}>
          📈 Résultats attendus
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { plan: 'BOOST', result: '+40% de visibilité', detail: 'Vos articles remontent dans les résultats, plus de vues et contacts.' },
            { plan: 'AUTO', result: '+60% ventes auto', detail: 'L\'IA négocie et assiste vos acheteurs, moins d\'effort pour plus de ventes.' },
            { plan: 'PRO VENDEUR', result: 'Insights marché', detail: 'Comprenez les tendances, ajustez vos prix, optimisez votre catalogue.' },
            { plan: 'BUSINESS', result: '+2x croissance', detail: 'Boutique pro, IA marchande, analytics : votre business en pilote auto.' },
            { plan: 'SCALE', result: 'Automatisation totale', detail: 'Toutes les IA, analytics premium, support dédié : scalez sans limite.' },
          ].map(r => (
            <div key={r.plan} style={{ background: 'rgba(111,88,255,0.04)', border: '1px solid rgba(111,88,255,0.1)', borderRadius: 10, padding: 14 }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: 'rgba(111,88,255,0.15)', color: '#6f58ff', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{r.plan}</span>
              <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{r.result}</h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>{r.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
