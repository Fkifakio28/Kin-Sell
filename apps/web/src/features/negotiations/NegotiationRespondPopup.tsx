import { useEffect, useState, useRef } from "react";
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
  const [actionDone, setActionDone] = useState<"ACCEPT" | "REFUSE" | "COUNTER" | null>(null);
  const [sendingAction, setSendingAction] = useState<"ACCEPT" | "REFUSE" | "COUNTER" | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── IA Marchand — Seller Advice ──
  const [aiAdvice, setAiAdvice] = useState<SellerNegotiationAdvice | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);

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

  const offers = Array.isArray(negotiation.offers) ? negotiation.offers : [];

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [offers.length]);

  const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;

  // Price evolution
  const firstPrice = offers[0]?.priceUsdCents ?? negotiation.originalPriceUsdCents;
  const currentPrice = lastOffer?.priceUsdCents ?? firstPrice;
  const priceChangePercent = firstPrice > 0 ? Math.round(((currentPrice - firstPrice) / firstPrice) * 100) : 0;

  const handleAction = async (action: "ACCEPT" | "REFUSE" | "COUNTER") => {
    setBusy(true);
    setSendingAction(action);
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
          setSendingAction(null);
          return;
        }
        body.counterPriceUsdCents = Math.round((localAmount / negRate) * 100);
      }
      const updated = await negotiations.respond(negotiation.id, body);
      setActionDone(action);
      setTimeout(() => onUpdated(updated), 800);
    } catch (err) {
      const msg = err instanceof ApiError
        ? ((err.data as { error?: string })?.error ?? "Erreur.")
        : "Erreur réseau.";
      setError(msg);
    } finally {
      setBusy(false);
      setSendingAction(null);
    }
  };

  // Time label helper
  const timeAgo = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1) return "à l'instant";
    if (diff < 60) return `il y a ${diff} min`;
    if (diff < 1440) return `il y a ${Math.floor(diff / 60)}h`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  // Action done overlay
  if (actionDone) {
    return (
      <div className="neg-overlay" onClick={onClose}>
        <div className="neg-chat-done glass-container" onClick={(e) => e.stopPropagation()}>
          <div className={`neg-chat-done-icon neg-chat-done-icon--${actionDone.toLowerCase()}`}>
            {actionDone === "ACCEPT" ? "✅" : actionDone === "COUNTER" ? "🔄" : "❌"}
          </div>
          <p className="neg-chat-done-text">
            {actionDone === "ACCEPT" ? "Offre acceptée !" : actionDone === "COUNTER" ? "Contre-offre envoyée !" : "Offre refusée"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-chat-popup glass-container" onClick={(e) => e.stopPropagation()}>
        {/* ── Header compact ── */}
        <div className="neg-chat-header">
          <button type="button" className="neg-close" onClick={onClose} aria-label="Fermer">✕</button>
          {negotiation.listing && (
            <div className="neg-chat-header-info">
              {negotiation.listing.imageUrl ? (
                <img src={resolveMediaUrl(negotiation.listing.imageUrl)} alt="" className="neg-chat-header-img" />
              ) : (
                <div className="neg-chat-header-avatar">{negotiation.listing.type === "SERVICE" ? "🛠" : "📦"}</div>
              )}
              <div className="neg-chat-header-text">
                <p className="neg-chat-header-title">{negotiation.listing.title}</p>
                <p className="neg-chat-header-sub">
                  {negotiation.buyer.displayName} • {formatMoneyFromUsdCents(negotiation.originalPriceUsdCents)}
                </p>
              </div>
            </div>
          )}
          {/* Price progress indicator */}
          <div className="neg-chat-price-badge">
            <span className="neg-chat-price-current">{formatMoneyFromUsdCents(currentPrice)}</span>
            {priceChangePercent !== 0 && (
              <span className={`neg-chat-price-delta ${priceChangePercent < 0 ? "neg-chat-price-delta--down" : "neg-chat-price-delta--up"}`}>
                {priceChangePercent < 0 ? "↓" : "↑"}{Math.abs(priceChangePercent)}%
              </span>
            )}
          </div>
        </div>

        {/* ── Progress bar: original price → current offer ── */}
        {offers.length > 0 && (() => {
          const orig = negotiation.originalPriceUsdCents;
          const progress = orig > 0 ? Math.min(100, Math.max(0, Math.round((currentPrice / orig) * 100))) : 0;
          return (
            <div className="neg-chat-progress">
              <div className="neg-chat-progress-bar">
                <div className="neg-chat-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="neg-chat-progress-labels">
                <span>Offre</span>
                <span>{progress}% du prix catalogue</span>
              </div>
            </div>
          );
        })()}

        {/* ── Chat area: offers as bubbles ── */}
        <div className="neg-chat-messages">
          {/* Starting price context */}
          <div className="neg-chat-system">
            <span>🏷 Prix catalogue : {formatMoneyFromUsdCents(negotiation.originalPriceUsdCents)} • Quantité : {negotiation.quantity}</span>
          </div>

          {offers.map((offer, i) => {
            const isBuyer = offer.fromUserId === negotiation.buyerUserId;
            const isLast = i === offers.length - 1;
            return (
              <div
                key={offer.id}
                className={`neg-chat-bubble ${isBuyer ? "neg-chat-bubble--buyer" : "neg-chat-bubble--seller"} ${isLast ? "neg-chat-bubble--latest" : ""}`}
              >
                <div className="neg-chat-bubble-name">{offer.fromDisplayName}</div>
                <div className="neg-chat-bubble-price">{formatMoneyFromUsdCents(offer.priceUsdCents)}</div>
                {offer.message && <p className="neg-chat-bubble-msg">« {offer.message} »</p>}
                <div className="neg-chat-bubble-meta">
                  <span className="neg-chat-bubble-time">{timeAgo(offer.createdAt)}</span>
                  {isLast && <span className="neg-chat-bubble-status">
                    {negotiation.status === "PENDING" || negotiation.status === "COUNTERED" ? "⏳ En attente" : negotiation.status === "ACCEPTED" ? "✅ Accepté" : "❌ Refusé"}
                  </span>}
                </div>
              </div>
            );
          })}

          {/* Optimistic: show sending bubble */}
          {sendingAction === "COUNTER" && counterPrice && (
            <div className="neg-chat-bubble neg-chat-bubble--seller neg-chat-bubble--sending">
              <div className="neg-chat-bubble-name">Vous</div>
              <div className="neg-chat-bubble-price">{counterPrice} {negSym}</div>
              <div className="neg-chat-bubble-meta">
                <span className="neg-chat-bubble-sending-dots"><span>.</span><span>.</span><span>.</span></span>
                <span className="neg-chat-bubble-status">✓ Envoi...</span>
              </div>
            </div>
          )}

          {sendingAction === "ACCEPT" && (
            <div className="neg-chat-bubble neg-chat-bubble--seller neg-chat-bubble--sending neg-chat-bubble--accept-glow">
              <div className="neg-chat-bubble-price">✅ Acceptation en cours...</div>
            </div>
          )}

          {/* Engagement message */}
          {!sendingAction && offers.length >= 1 && (negotiation.status === "PENDING" || negotiation.status === "COUNTERED") && (
            <div className="neg-chat-system neg-chat-system--hint">
              <span>{
                offers.length === 1 ? "💬 Le vendeur attend votre réponse" :
                priceChangePercent < -10 ? "🔥 Vous êtes proche d'un accord !" :
                priceChangePercent !== 0 ? "💡 Les négociations avancent bien !" :
                "💬 Continuez la discussion..."
              }</span>
            </div>
          )}

          {/* Waiting indicator when pending */}
          {!sendingAction && (negotiation.status === "PENDING" || negotiation.status === "COUNTERED") && (
            <div className="neg-chat-waiting">
              <div className="neg-chat-waiting-dots"><span /><span /><span /></div>
              <span className="neg-chat-waiting-label">En attente de réponse...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── IA Marchand — Conseil intégré dans le chat ── */}
        {showAi && (
          <div className={`neg-chat-ai ${aiCollapsed ? "neg-chat-ai--collapsed" : ""}${aiAdvice && !aiLoading ? " neg-chat-ai--ready" : ""}${aiLoading ? " neg-chat-ai--loading" : ""}`}>
            <button type="button" className="neg-chat-ai-toggle" onClick={() => setAiCollapsed(!aiCollapsed)}>
              <span className="neg-chat-ai-toggle-icon">🤖</span>
              <span className="neg-chat-ai-toggle-label">IA Marchand</span>
              {aiLoading && <span className="neg-chat-ai-loading-dots"><span /><span /><span /></span>}
              {aiAdvice && !aiLoading && aiCollapsed && <span className="neg-chat-ai-dot" />}
              <span className="neg-chat-ai-toggle-arrow">{aiCollapsed ? "▲" : "▼"}</span>
            </button>
            {!aiCollapsed && (
              <div className="neg-chat-ai-body">
                {aiLoading ? (
                  <div className="neg-ai-loading-skeleton">
                    <div className="neg-ai-skeleton-line" style={{ width: '70%' }} />
                    <div className="neg-ai-skeleton-line" style={{ width: '50%' }} />
                    <div className="neg-ai-skeleton-line" style={{ width: '85%' }} />
                  </div>
                ) : aiAdvice ? (
                  <>
                    <div className={`neg-ai-reco neg-ai-reco--${aiAdvice.recommendation.toLowerCase()}`}>
                      <span className="neg-ai-reco-badge">
                        {aiAdvice.recommendation === "ACCEPT" ? "✅ Accepter" : aiAdvice.recommendation === "COUNTER" ? "🔄 Contre-offre" : "❌ Refuser"}
                      </span>
                      <span className="neg-ai-reco-prob">{aiAdvice.conversionProbability}% conversion</span>
                    </div>
                    {aiAdvice.counterSuggestionUsdCents != null && (
                      <div className="neg-chat-ai-suggest-card">
                        <p className="neg-chat-ai-suggest">
                          💡 Prix suggéré : <strong>{formatMoneyFromUsdCents(aiAdvice.counterSuggestionUsdCents)}</strong>
                        </p>
                        <button type="button" className="neg-chat-ai-use neg-chat-ai-use--prominent" onClick={() => {
                          const local = (aiAdvice.counterSuggestionUsdCents! / 100 * negRate).toFixed(currency === 'USD' || currency === 'EUR' || currency === 'MAD' ? 2 : 0);
                          setCounterPrice(local);
                          inputRef.current?.focus();
                        }}>⚡ Utiliser ce prix</button>
                      </div>
                    )}
                    <p className="neg-ai-reason">{aiAdvice.insight}</p>
                    <div className="neg-ai-buyer">
                      <span>🛡 Confiance {aiAdvice.buyerProfile.trustLevel}</span>
                      <span>{aiAdvice.buyerProfile.previousPurchases} commande(s)</span>
                      <span>{aiAdvice.marginImpact.discountPercent}% remise</span>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {error && <div className="neg-error">{error}</div>}

        {/* ── Input area: WhatsApp-style bottom bar ── */}
        <div className="neg-chat-input-area">
          <div className="neg-chat-input-row">
            <div className="neg-chat-price-input">
              <input
                ref={inputRef}
                className="neg-chat-input"
                type="number"
                min={0.01}
                step={currency === 'USD' || currency === 'EUR' || currency === 'MAD' ? 0.01 : 1}
                placeholder={`Contre-offre (${negSym})`}
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
              />
              <span className="neg-chat-input-currency">{negSym}</span>
            </div>
            <button
              type="button"
              className={`neg-chat-send-btn ${busy && sendingAction === "COUNTER" ? "neg-chat-send-btn--sending" : ""}`}
              disabled={busy || !counterPrice}
              onClick={() => void handleAction("COUNTER")}
              title="Envoyer contre-offre"
            >
              {busy && sendingAction === "COUNTER" ? "⟳" : "➤"}
            </button>
          </div>
          <div className="neg-chat-quick-actions">
            <button
              type="button"
              className="neg-chat-quick neg-chat-quick--accept"
              disabled={busy}
              onClick={() => void handleAction("ACCEPT")}
            >
              ✅ Accepter
            </button>
            <button
              type="button"
              className="neg-chat-quick neg-chat-quick--refuse"
              disabled={busy}
              onClick={() => void handleAction("REFUSE")}
            >
              ❌ Refuser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
