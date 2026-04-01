/**
 * SellerActions — Boutons de contact rapide vendeur
 *
 * Affiche : 💬 Contacter | 📞 Appeler | 📦 Commander
 *
 * Usage:
 *   <SellerActions
 *     listingId="clxyz..."
 *     sellerUserId="clxyz..."
 *     sellerName="Jean Kasa"
 *   />
 */

import { useState, useCallback } from "react";
import { listings } from "../../../lib/api-client";
import { useNavigate } from "react-router-dom";
import "./seller-actions.css";

type Props = {
  listingId: string;
  sellerUserId: string;
  sellerName?: string;
  showCall?: boolean;
  compact?: boolean;
};

export default function SellerActions({ listingId, sellerUserId, sellerName, showCall = true, compact = false }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const handleContact = useCallback(async () => {
    setLoading("message");
    try {
      const result = await listings.contactSeller(listingId);
      // Naviguer vers la conversation
      navigate(`/messaging/${result.conversationId}`);
    } catch {
      // Fallback : ouvrir le DM manuellement
      navigate(`/messaging?newDm=${sellerUserId}`);
    } finally {
      setLoading(null);
    }
  }, [listingId, sellerUserId, navigate]);

  const handleCall = useCallback(() => {
    // Naviguer vers la page messaging avec l'option d'appel
    navigate(`/messaging?call=${sellerUserId}&type=audio`);
  }, [sellerUserId, navigate]);

  const handleVideoCall = useCallback(() => {
    navigate(`/messaging?call=${sellerUserId}&type=video`);
  }, [sellerUserId, navigate]);

  if (compact) {
    return (
      <div className="seller-actions seller-actions--compact">
        <button
          className="seller-actions__btn seller-actions__btn--message"
          onClick={handleContact}
          disabled={loading === "message"}
          title={`Envoyer un message à ${sellerName ?? "ce vendeur"}`}
        >
          {loading === "message" ? "⏳" : "💬"}
        </button>
        {showCall && (
          <button
            className="seller-actions__btn seller-actions__btn--call"
            onClick={handleCall}
            title={`Appeler ${sellerName ?? "ce vendeur"}`}
          >
            📞
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="seller-actions">
      <button
        className="seller-actions__btn seller-actions__btn--message"
        onClick={handleContact}
        disabled={loading === "message"}
      >
        {loading === "message" ? "⏳ Connexion..." : "💬 Contacter"}
      </button>
      {showCall && (
        <>
          <button
            className="seller-actions__btn seller-actions__btn--call"
            onClick={handleCall}
          >
            📞 Appeler
          </button>
          <button
            className="seller-actions__btn seller-actions__btn--video"
            onClick={handleVideoCall}
          >
            📹 Vidéo
          </button>
        </>
      )}
    </div>
  );
}
