import { useState, useEffect, useCallback } from "react";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { DEFAULT_CURRENCY_RATES } from "../../shared/constants/currencies";
import { negotiations, resolveMediaUrl, type NegotiationSummary, type GroupNegotiationSummary, ApiError } from "../../lib/api-client";
import { useSocket } from "../../hooks/useSocket";
import "./negotiate-popup.css";

type NegotiatePopupProps = {
  listing: {
    id: string;
    title: string;
    imageUrl: string | null;
    type: string;
    priceUsdCents: number;
    ownerDisplayName: string;
  };
  onClose: () => void;
  onSuccess: (negotiation: NegotiationSummary) => void;
};

type NegMode = "SIMPLE" | "QUANTITY" | "GROUPED";

export function NegotiatePopup({ listing, onClose, onSuccess }: NegotiatePopupProps) {
  const { t, formatMoneyFromUsdCents, currency } = useLocaleCurrency();
  const negRate = currency === 'USD' ? 1 : (DEFAULT_CURRENCY_RATES[currency] ?? DEFAULT_CURRENCY_RATES.CDF);
  const negSymbols: Record<string, string> = { CDF: 'FC', USD: '$', EUR: '€', XAF: 'XAF', AOA: 'Kz', XOF: 'XOF', GNF: 'GNF', MAD: 'MAD' };
  const negSym = negSymbols[currency] || currency;
  const { on, off } = useSocket();
  const [mode, setMode] = useState<NegMode>("SIMPLE");
  const [priceDollars, setPriceDollars] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [minBuyers, setMinBuyers] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grouped mode: existing open groups for this listing
  const [openGroups, setOpenGroups] = useState<GroupNegotiationSummary[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [joinGroupId, setJoinGroupId] = useState<string | null>(null);

  const loadOpenGroups = useCallback(() => {
    setLoadingGroups(true);
    negotiations.listOpenGroups({ listingId: listing.id })
      .then((data) => setOpenGroups(data.groups))
      .catch(() => setOpenGroups([]))
      .finally(() => setLoadingGroups(false));
  }, [listing.id]);

  useEffect(() => {
    if (mode === "GROUPED") {
      loadOpenGroups();
    }
  }, [mode, loadOpenGroups]);

  useEffect(() => {
    if (mode !== "GROUPED") return;

    const handleNegotiationUpdated = (_payload: {
      type: 'NEGOTIATION_UPDATED';
      action: 'CREATED' | 'RESPONDED' | 'CANCELED' | 'JOINED' | 'BUNDLE_CREATED';
      negotiationId: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      loadOpenGroups();
    };

    on('negotiation:updated', handleNegotiationUpdated);
    return () => {
      off('negotiation:updated', handleNegotiationUpdated);
    };
  }, [mode, on, off, loadOpenGroups]);

  const handleSubmit = async () => {
    const localAmount = parseFloat(priceDollars);
    if (isNaN(localAmount) || localAmount <= 0) {
      setError(t("error.invalidPrice"));
      return;
    }
    const cents = Math.round((localAmount / negRate) * 100);
    setBusy(true);
    setError(null);
    try {
      let result: NegotiationSummary;
      if (mode === "GROUPED" && joinGroupId) {
        // Rejoindre un groupe existant
        result = await negotiations.joinGroup(joinGroupId, {
          proposedPriceUsdCents: cents,
          quantity,
          message: message.trim() || undefined,
        });
      } else {
        result = await negotiations.create({
          listingId: listing.id,
          proposedPriceUsdCents: cents,
          quantity,
          message: message.trim() || undefined,
          type: mode,
          ...(mode === "GROUPED" ? { minBuyers } : {}),
        });
      }
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

  const originalDollars = (listing.priceUsdCents / 100 * negRate).toFixed(currency === 'USD' || currency === 'EUR' || currency === 'MAD' ? 2 : 0);
  const proposedCents = Math.round(((parseFloat(priceDollars) || 0) / negRate) * 100);
  const totalProposed = proposedCents * quantity;
  const totalOriginal = listing.priceUsdCents * quantity;

  const modeLabels: Record<NegMode, { icon: string; label: string }> = {
    SIMPLE: { icon: "🤝", label: t("negotiation.modeSimple") },
    QUANTITY: { icon: "📦", label: t("negotiation.modeQuantity") },
    GROUPED: { icon: "👥", label: t("negotiation.modeGrouped") },
  };

  return (
    <div className="neg-overlay" onClick={onClose}>
      <div className="neg-popup glass-container" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="neg-close" onClick={onClose} aria-label={t("common.close")}>✕</button>

        <span className="neg-icon">🤝</span>
        <h2 className="neg-title">{t("negotiation.title")}</h2>

        {/* Mode tabs */}
        <div className="neg-mode-tabs">
          {(["SIMPLE", "QUANTITY", "GROUPED"] as NegMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`neg-mode-tab ${mode === m ? "neg-mode-tab--active" : ""}`}
              onClick={() => { setMode(m); setJoinGroupId(null); setError(null); }}
            >
              <span className="neg-mode-tab-icon">{modeLabels[m].icon}</span>
              <span className="neg-mode-tab-label">{modeLabels[m].label}</span>
            </button>
          ))}
        </div>

        {/* Mode description */}
        <p className="neg-mode-desc">
          {mode === "SIMPLE" && t("negotiation.descSimple")}
          {mode === "QUANTITY" && t("negotiation.descQuantity")}
          {mode === "GROUPED" && t("negotiation.descGrouped")}
        </p>

        <div className="neg-listing-preview">
          {listing.imageUrl ? (
            <img src={resolveMediaUrl(listing.imageUrl)} alt={listing.title} className="neg-listing-img" />
          ) : (
            <div className="neg-listing-placeholder">{listing.type === "SERVICE" ? "🛠" : "📦"}</div>
          )}
          <div className="neg-listing-info">
            <p className="neg-listing-title">{listing.title}</p>
            <p className="neg-listing-seller">{t("negotiation.sellerLabel")} {listing.ownerDisplayName}</p>
            <p className="neg-listing-price">{t("negotiation.listedPrice")} <strong>{formatMoneyFromUsdCents(listing.priceUsdCents)}</strong></p>
          </div>
        </div>

        {error && <div className="neg-error">{error}</div>}

        {/* GROUPED mode: open groups list */}
        {mode === "GROUPED" && (
          <div className="neg-groups-section">
            <h3 className="neg-groups-title">{t("negotiation.openGroups")}</h3>
            {loadingGroups ? (
              <p className="neg-groups-loading">{t("common.loading")}</p>
            ) : openGroups.length === 0 ? (
              <p className="neg-groups-empty">{t("negotiation.noGroups")}</p>
            ) : (
              <div className="neg-groups-list">
                {openGroups.map((g) => (
                  <button
                    key={g.groupId}
                    type="button"
                    className={`neg-group-card ${joinGroupId === g.groupId ? "neg-group-card--selected" : ""}`}
                    onClick={() => setJoinGroupId(joinGroupId === g.groupId ? null : g.groupId)}
                  >
                    <div className="neg-group-info">
                      <span className="neg-group-members">👥 {g.currentBuyers}/{g.minBuyers} membres</span>
                      <span className="neg-group-creator">Créé par {g.createdBy}</span>
                    </div>
                    <span className="neg-group-action">{joinGroupId === g.groupId ? "✓ Sélectionné" : "Rejoindre"}</span>
                  </button>
                ))}
              </div>
            )}
            {!joinGroupId && (
              <p className="neg-groups-create-note">— ou créez un nouveau groupe ci-dessous —</p>
            )}
          </div>
        )}

        <div className="neg-form">
          <label className="neg-label">
            {mode === "QUANTITY" ? `Prix unitaire proposé (${negSym})` : `Votre prix proposé (${negSym})`}
            <div className="neg-input-row">
              <input
                className="neg-input"
                type="number"
                min={0.01}
                step={currency === 'USD' || currency === 'EUR' || currency === 'MAD' ? 0.01 : 1}
                placeholder={originalDollars}
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                autoFocus
              />
              <span className="neg-currency">{negSym}</span>
            </div>
          </label>

          <label className="neg-label">
            Quantité{mode === "QUANTITY" ? " (lot)" : ""}
            <div className="neg-qty-row">
              <button type="button" className="neg-qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
              <span className="neg-qty-val">{quantity}</span>
              <button type="button" className="neg-qty-btn" onClick={() => setQuantity((q) => q + 1)}>+</button>
            </div>
          </label>

          {/* Grouped: minBuyers selector (only when creating a new group) */}
          {mode === "GROUPED" && !joinGroupId && (
            <label className="neg-label">
              Nombre min. de participants
              <div className="neg-qty-row">
                <button type="button" className="neg-qty-btn" onClick={() => setMinBuyers((b) => Math.max(2, b - 1))}>−</button>
                <span className="neg-qty-val">{minBuyers}</span>
                <button type="button" className="neg-qty-btn" onClick={() => setMinBuyers((b) => Math.min(50, b + 1))}>+</button>
              </div>
            </label>
          )}

          <label className="neg-label">
            Message (optionnel)
            <textarea
              className="neg-textarea"
              placeholder={mode === "QUANTITY"
                ? "Ex: J'en prends 10, quel rabais pouvez-vous me faire ?"
                : mode === "GROUPED"
                  ? "Ex: On est plusieurs intéressés par votre produit..."
                  : "Ex: Je suis intéressé par votre produit..."}
              rows={3}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>

        {priceDollars && !isNaN(parseFloat(priceDollars)) && parseFloat(priceDollars) > 0 && (
          <div className="neg-summary">
            <div className="neg-summary-row">
              <span>Prix original{mode === "QUANTITY" ? " × " + quantity : ""}</span>
              <span className="neg-original-price">{mode === "QUANTITY" ? formatMoneyFromUsdCents(totalOriginal) : formatMoneyFromUsdCents(listing.priceUsdCents)}</span>
            </div>
            <div className="neg-summary-row">
              <span>Votre offre{mode === "QUANTITY" ? " total" : ""}</span>
              <span className="neg-proposed-price">{mode === "QUANTITY" ? formatMoneyFromUsdCents(totalProposed) : formatMoneyFromUsdCents(proposedCents)}</span>
            </div>
            <div className="neg-summary-row">
              <span>Économie</span>
              <span className="neg-savings">
                {mode === "QUANTITY"
                  ? `${formatMoneyFromUsdCents(Math.max(0, totalOriginal - totalProposed))} (${Math.max(0, Math.round((1 - totalProposed / totalOriginal) * 100))}%)`
                  : `${formatMoneyFromUsdCents(Math.max(0, listing.priceUsdCents - proposedCents))} (${Math.max(0, Math.round((1 - proposedCents / listing.priceUsdCents) * 100))}%)`
                }
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          className="neg-submit"
          disabled={busy || !priceDollars}
          onClick={() => void handleSubmit()}
        >
          {busy ? "Envoi en cours..." : mode === "GROUPED" && joinGroupId ? "👥 Rejoindre le groupe" : mode === "GROUPED" ? "👥 Créer le groupe" : mode === "QUANTITY" ? "📦 Envoyer l'offre en lot" : "🤝 Envoyer ma proposition"}
        </button>

        <p className="neg-info">
          {mode === "SIMPLE" && "Le vendeur a 48h pour accepter, refuser ou faire une contre-offre. L'article sera en état MARCHANDAGE dans votre panier."}
          {mode === "QUANTITY" && "Proposez un prix intéressant pour un achat en grande quantité. Le vendeur a 48h pour répondre."}
          {mode === "GROUPED" && "Le vendeur a 72h pour répondre. Plus vous êtes nombreux, plus votre pouvoir de négociation est fort !"}
        </p>
      </div>
    </div>
  );
}
