import { useState } from "react";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { negotiations, resolveMediaUrl, type NegotiationSummary, type BundleNegotiationResult, ApiError } from "../../lib/api-client";
import "./negotiate-popup.css";

export type BundleListingItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  type: string;
  priceUsdCents: number;
};

type BundleNegotiatePopupProps = {
  sellerDisplayName: string;
  listings: BundleListingItem[];
  onClose: () => void;
  onSuccess: (negotiation: NegotiationSummary) => void;
};

type BundleMode = "SIMPLE" | "QUANTITY" | "GROUPED";

export function BundleNegotiatePopup({ sellerDisplayName, listings, onClose, onSuccess }: BundleNegotiatePopupProps) {
  const { formatMoneyFromUsdCents, t } = useLocaleCurrency();
  const [mode, setMode] = useState<BundleMode>("SIMPLE");
  const [items, setItems] = useState<{ listingId: string; quantity: number; selected: boolean }[]>(
    listings.map((l) => ({ listingId: l.id, quantity: 1, selected: true }))
  );
  const [totalDollars, setTotalDollars] = useState("");
  const [message, setMessage] = useState("");
  const [minBuyers, setMinBuyers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = items.filter((i) => i.selected);
  const totalOriginalCents = selectedItems.reduce((sum, item) => {
    const listing = listings.find((l) => l.id === item.listingId);
    return sum + (listing?.priceUsdCents ?? 0) * item.quantity;
  }, 0);

  const toggleItem = (listingId: string) => {
    setItems((prev) => prev.map((i) =>
      i.listingId === listingId ? { ...i, selected: !i.selected } : i
    ));
  };

  const updateQuantity = (listingId: string, delta: number) => {
    setItems((prev) => prev.map((i) =>
      i.listingId === listingId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
    ));
  };

  const handleSubmit = async () => {
    if (selectedItems.length < 2) {
      setError(t("error.minBundleItems"));
      return;
    }
    const dollars = parseFloat(totalDollars);
    if (isNaN(dollars) || dollars <= 0) {
      setError(t("error.invalidTotal"));
      return;
    }
    const cents = Math.round(dollars * 100);
    setBusy(true);
    setError(null);
    try {
      const result: BundleNegotiationResult = await negotiations.createBundle({
        items: selectedItems.map((i) => ({ listingId: i.listingId, quantity: i.quantity })),
        proposedTotalUsdCents: cents,
        message: message.trim() || undefined,
        type: mode,
        ...(mode === "GROUPED" ? { minBuyers } : {}),
      });
      onSuccess(result);
    } catch (err) {
      const msg = err instanceof ApiError
        ? ((err.data as { error?: string })?.error ?? t("error.negotiationFailed"))
        : t("error.networkError");
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const proposedCents = Math.round((parseFloat(totalDollars) || 0) * 100);

  const modeLabels: Record<BundleMode, { icon: string; label: string }> = {
    SIMPLE: { icon: "🤝", label: t("negotiation.modeSimple") },
    QUANTITY: { icon: "📦", label: t("negotiation.modeQuantity") },
    GROUPED: { icon: "👥", label: t("negotiation.modeGrouped") },
  };

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-popup neg-popup--bundle glass-container" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="neg-close" onClick={onClose} aria-label={t("common.close")}>✕</button>

        <span className="neg-icon">🤝</span>
        <h2 className="neg-title">{t("negotiation.bundleTitle")}</h2>
        <p className="neg-mode-desc">
          {t("negotiation.bundleDesc")}
        </p>

        <div className="neg-mode-tabs">
          {(["SIMPLE", "QUANTITY", "GROUPED"] as BundleMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`neg-mode-tab ${mode === m ? "neg-mode-tab--active" : ""}`}
              onClick={() => { setMode(m); setError(null); }}
            >
              <span className="neg-mode-tab-icon">{modeLabels[m].icon}</span>
              <span className="neg-mode-tab-label">{modeLabels[m].label}</span>
            </button>
          ))}
        </div>

        <p className="neg-bundle-seller">{t("negotiation.sellerLabel")} <strong>{sellerDisplayName}</strong></p>

        {error && <div className="neg-error">{error}</div>}

        <div className="neg-bundle-items">
          <h3 className="neg-groups-title">{t("negotiation.bundleItems")} ({selectedItems.length}/{listings.length})</h3>
          {listings.map((listing) => {
            const item = items.find((i) => i.listingId === listing.id)!;
            return (
              <div key={listing.id} className={`neg-bundle-item ${item.selected ? "" : "neg-bundle-item--disabled"}`}>
                <button
                  type="button"
                  className={`neg-bundle-check ${item.selected ? "neg-bundle-check--on" : ""}`}
                  onClick={() => toggleItem(listing.id)}
                  aria-label={item.selected ? t("negotiation.removeFromBundle") : t("negotiation.addToBundle")}
                >
                  {item.selected ? "?" : ""}
                </button>
                <div className="neg-bundle-item-img">
                  {listing.imageUrl ? (
                    <img src={resolveMediaUrl(listing.imageUrl)} alt={listing.title} />
                  ) : (
                    <span>{listing.type === "SERVICE" ? "??" : "??"}</span>
                  )}
                </div>
                <div className="neg-bundle-item-info">
                  <span className="neg-bundle-item-title">{listing.title}</span>
                  <span className="neg-bundle-item-price">{formatMoneyFromUsdCents(listing.priceUsdCents)} / unite</span>
                </div>
                {item.selected && (
                  <div className="neg-bundle-item-qty">
                    <button type="button" className="neg-qty-btn" onClick={() => updateQuantity(listing.id, -1)}>-</button>
                    <span className="neg-qty-val">{item.quantity}</span>
                    <button type="button" className="neg-qty-btn" onClick={() => updateQuantity(listing.id, 1)}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="neg-form">
          <div className="neg-bundle-original-total">
            Prix total catalogue : <strong>{formatMoneyFromUsdCents(totalOriginalCents)}</strong>
          </div>

          <label className="neg-label">
            Votre prix total propose ($)
            <div className="neg-input-row">
              <input
                className="neg-input"
                type="number"
                min={0.01}
                step={0.01}
                placeholder={(totalOriginalCents / 100).toFixed(2)}
                value={totalDollars}
                onChange={(e) => setTotalDollars(e.target.value)}
                autoFocus
              />
              <span className="neg-currency">USD</span>
            </div>
          </label>

          {mode === "GROUPED" && (
            <label className="neg-label">
              Nombre min. de participants
              <div className="neg-qty-row">
                <button type="button" className="neg-qty-btn" onClick={() => setMinBuyers((b) => Math.max(2, b - 1))}>-</button>
                <span className="neg-qty-val">{minBuyers}</span>
                <button type="button" className="neg-qty-btn" onClick={() => setMinBuyers((b) => Math.min(50, b + 1))}>+</button>
              </div>
            </label>
          )}

          <label className="neg-label">
            Message (optionnel)
            <textarea
              className="neg-textarea"
              placeholder="Ex: Je prends ces articles ensemble, quel prix de lot pouvez-vous me faire ?"
              rows={3}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>

        {proposedCents > 0 && totalOriginalCents > 0 && (
          <div className="neg-summary">
            <div className="neg-summary-row">
              <span>Prix catalogue total</span>
              <span className="neg-original-price">{formatMoneyFromUsdCents(totalOriginalCents)}</span>
            </div>
            <div className="neg-summary-row">
              <span>Votre offre lot</span>
              <span className="neg-proposed-price">{formatMoneyFromUsdCents(proposedCents)}</span>
            </div>
            <div className="neg-summary-row">
              <span>Economie</span>
              <span className="neg-savings">
                {formatMoneyFromUsdCents(Math.max(0, totalOriginalCents - proposedCents))}
                {" "}({Math.max(0, Math.round((1 - proposedCents / totalOriginalCents) * 100))}%)
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          className="neg-submit"
          disabled={busy || !totalDollars || selectedItems.length < 2}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Envoi en cours..." : `?? Negocier le lot (${selectedItems.length} articles)`}
        </button>

        <p className="neg-info">
          {mode === "GROUPED"
            ? "Le vendeur a 72h pour repondre. Plus vous etes nombreux, plus votre pouvoir de negociation est fort !"
            : "Le vendeur a 48h pour accepter, refuser ou contre-offrir sur l'ensemble du lot."
          }
        </p>
      </div>
    </div>
  );
}
