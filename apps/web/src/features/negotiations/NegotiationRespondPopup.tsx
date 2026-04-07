import { useEffect, useState } from "react";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { DEFAULT_CURRENCY_RATES } from "../../shared/constants/currencies";
import { negotiations, negotiationAi, resolveMediaUrl, type NegotiationSummary, type SellerNegotiationAdvice, ApiError } from "../../lib/api-client";
import "./negotiate-popup.css";

type NegotiationRespondPopupProps = {
  negotiation: NegotiationSummary;
  onClose: () => void;
  onUpdated: (updated: NegotiationSummary) => void;
  showAi?: boolean; // gated by plan
};

export function NegotiationRespondPopup({ negotiation, onClose, onUpdated, showAi = false }: NegotiationRespondPopupProps) {
  const { t, formatMoneyFromUsdCents, currency } = useLocaleCurrency();
  const negRate = currency === 'USD' ? 1 : (DEFAULT_CURRENCY_RATES[currency] ?? DEFAULT_CURRENCY_RATES.CDF);
  const negSymbols: Record<string, string> = { CDF: 'FC', USD: '$', EUR: '€', XAF: 'XAF', AOA: 'Kz', XOF: 'XOF', GNF: 'GNF', MAD: 'MAD' };
  const negSym = negSymbols[currency] || currency;
  const [counterPrice, setCounterPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── IA Marchand — Seller Advice ──
  const [aiAdvice, setAiAdvice] = useState<SellerNegotiationAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!showAi) return;
    let cancelled = false;
    setAiLoading(true);
    negotiationAi.sellerAdvice(negotiation.id)
      .then((data) => { if (!cancelled) setAiAdvice(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [negotiation.id, showAi]);

  const lastOffer = negotiation.offers[negotiation.offers.length - 1];
  const aiMarginLabel = aiAdvice
    ? `${aiAdvice.marginImpact.discountPercent}% de remise par rapport au prix catalogue`
    : null;

  const handleAction = async (action: "ACCEPT" | "REFUSE" | "COUNTER") => {
    setBusy(true);
    setError(null);
    try {
      const body: { action: "ACCEPT" | "REFUSE" | "COUNTER"; counterPriceUsdCents?: number; message?: string } = {
        action,
        message: message.trim() || undefined,
      };
      if (action === "COUNTER") {
        const localAmount = parseFloat(counterPrice);
        if (isNaN(localAmount) || localAmount <= 0) {
          setError("Entrez un prix valide pour la contre-offre");
          setBusy(false);
          return;
        }
        body.counterPriceUsdCents = Math.round((localAmount / negRate) * 100);
      }
      const updated = await negotiations.respond(negotiation.id, body);
      onUpdated(updated);
    } catch (err) {
      const msg = err instanceof ApiError
        ? ((err.data as { error?: string })?.error ?? "Erreur.")
        : "Erreur réseau.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-popup glass-container" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="neg-close" onClick={onClose} aria-label="Fermer">✕</button>

        <span className="neg-icon">🤝</span>
        <h2 className="neg-title">{t("negotiation.respond")}</h2>

        {/* Listing info */}
        {negotiation.listing && (
          <div className="neg-listing-preview">
            {negotiation.listing.imageUrl ? (
              <img src={resolveMediaUrl(negotiation.listing.imageUrl)} alt={negotiation.listing.title} className="neg-listing-img" />
            ) : (
              <div className="neg-listing-placeholder">{negotiation.listing.type === "SERVICE" ? "🛠" : "📦"}</div>
            )}
            <div className="neg-listing-info">
              <p className="neg-listing-title">{negotiation.listing.title}</p>
              <p className="neg-listing-seller">Acheteur : {negotiation.buyer.displayName}</p>
              <p className="neg-listing-price">Prix catalogue : <strong>{formatMoneyFromUsdCents(negotiation.originalPriceUsdCents)}</strong></p>
            </div>
          </div>
        )}

        {/* Historique des offres */}
        <div className="neg-offers-history">
          <h3 className="neg-offers-title">Historique des offres</h3>
          {negotiation.offers.map((offer) => (
            <div key={offer.id} className={`neg-offer-row ${offer.fromUserId === negotiation.buyerUserId ? "neg-offer--buyer" : "neg-offer--seller"}`}>
              <span className="neg-offer-from">{offer.fromDisplayName}</span>
              <span className="neg-offer-price">{formatMoneyFromUsdCents(offer.priceUsdCents)}</span>
              {offer.message && <p className="neg-offer-msg">« {offer.message} »</p>}
              <span className="neg-offer-date">{new Date(offer.createdAt).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>

        {error && <div className="neg-error">{error}</div>}

        {/* Dernière offre mise en avant */}
        {lastOffer && (
          <div className="neg-summary">
            <div className="neg-summary-row">
              <span>Dernière offre</span>
              <span className="neg-proposed-price">{formatMoneyFromUsdCents(lastOffer.priceUsdCents)}</span>
            </div>
            <div className="neg-summary-row">
              <span>Quantité</span>
              <span>{negotiation.quantity}</span>
            </div>
          </div>
        )}

        {/* Contre-offre input */}
        <div className="neg-form">
          <label className="neg-label">
            Contre-offre ({negSym}) – optionnel
            <div className="neg-input-row">
              <input
                className="neg-input"
                type="number"
                min={0.01}
                step={currency === 'USD' || currency === 'EUR' || currency === 'MAD' ? 0.01 : 1}
                placeholder="Votre prix..."
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
              />
              <span className="neg-currency">{negSym}</span>
            </div>
          </label>

          <label className="neg-label">
            Message (optionnel)
            <textarea
              className="neg-textarea"
              placeholder="Votre réponse..."
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>

        <div className="neg-actions-row">
          {/* ── IA Marchand — Conseil vendeur ── */}
          {showAi && (
            <div className="neg-ai-panel">
              <div className="neg-ai-header">
                <span className="neg-ai-icon">🤖</span>
                <strong className="neg-ai-title">IA Marchand</strong>
              </div>
              {aiLoading ? (
                <p className="neg-ai-loading">Analyse en cours…</p>
              ) : aiAdvice ? (
                <div className="neg-ai-body">
                  <div className={`neg-ai-reco neg-ai-reco--${aiAdvice.recommendation.toLowerCase()}`}>
                    <span className="neg-ai-reco-badge">
                      {aiAdvice.recommendation === "ACCEPT" ? "✅ Accepter" : aiAdvice.recommendation === "COUNTER" ? "🔄 Contre-offre" : "❌ Refuser"}
                    </span>
                    <span className="neg-ai-reco-prob">{aiAdvice.conversionProbability}% chances de conversion</span>
                  </div>
                  {aiAdvice.counterSuggestionUsdCents != null && (
                    <p className="neg-ai-counter">Prix suggéré : <strong>{formatMoneyFromUsdCents(aiAdvice.counterSuggestionUsdCents)}</strong></p>
                  )}
                  {aiMarginLabel && <p className="neg-ai-margin">Impact marge : {aiMarginLabel}</p>}
                  <p className="neg-ai-reason">{aiAdvice.insight}</p>
                  <div className="neg-ai-buyer">
                    <span>Acheteur : Confiance {aiAdvice.buyerProfile.trustLevel}</span>
                    <span>{aiAdvice.buyerProfile.previousPurchases} commande(s)</span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <button
            type="button"
            className="neg-action-btn neg-action-btn--accept"
            disabled={busy}
            onClick={() => void handleAction("ACCEPT")}
          >
            ✅ Accepter
          </button>
          <button
            type="button"
            className="neg-action-btn neg-action-btn--counter"
            disabled={busy || !counterPrice}
            onClick={() => void handleAction("COUNTER")}
          >
            🔄 Contre-offre
          </button>
          <button
            type="button"
            className="neg-action-btn neg-action-btn--refuse"
            disabled={busy}
            onClick={() => void handleAction("REFUSE")}
          >
            ❌ Refuser
          </button>
        </div>
      </div>
    </div>
  );
}
