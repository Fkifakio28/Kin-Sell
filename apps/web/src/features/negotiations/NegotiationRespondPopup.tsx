import { useState } from "react";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { negotiations, type NegotiationSummary, ApiError } from "../../lib/api-client";
import "./negotiate-popup.css";

type NegotiationRespondPopupProps = {
  negotiation: NegotiationSummary;
  onClose: () => void;
  onUpdated: (updated: NegotiationSummary) => void;
};

export function NegotiationRespondPopup({ negotiation, onClose, onUpdated }: NegotiationRespondPopupProps) {
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const [counterPrice, setCounterPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastOffer = negotiation.offers[negotiation.offers.length - 1];

  const handleAction = async (action: "ACCEPT" | "REFUSE" | "COUNTER") => {
    setBusy(true);
    setError(null);
    try {
      const body: { action: "ACCEPT" | "REFUSE" | "COUNTER"; counterPriceUsdCents?: number; message?: string } = {
        action,
        message: message.trim() || undefined,
      };
      if (action === "COUNTER") {
        const dollars = parseFloat(counterPrice);
        if (isNaN(dollars) || dollars <= 0) {
          setError("Entrez un prix valide pour la contre-offre");
          setBusy(false);
          return;
        }
        body.counterPriceUsdCents = Math.round(dollars * 100);
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
              <img src={negotiation.listing.imageUrl} alt={negotiation.listing.title} className="neg-listing-img" />
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
            Contre-offre ($) – optionnel
            <div className="neg-input-row">
              <input
                className="neg-input"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="Votre prix..."
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
              />
              <span className="neg-currency">USD</span>
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
