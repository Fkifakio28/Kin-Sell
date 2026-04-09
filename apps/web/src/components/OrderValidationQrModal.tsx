import { useEffect, useState } from "react";
import { buildOrderValidationQrPayload } from "../utils/order-validation";

type OrderValidationQrModalProps = {
  orderId: string;
  code: string;
  expiresAt?: string;
  title: string;
  helpText: string;
  closeLabel: string;
  onClose: () => void;
};

export function OrderValidationQrModal({
  orderId,
  code,
  expiresAt,
  title,
  helpText,
  closeLabel,
  onClose,
}: OrderValidationQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shieldVisible, setShieldVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadQr = async () => {
      try {
        const QRCode = await import("qrcode");
        const payload = buildOrderValidationQrPayload(orderId, code);
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 240,
          margin: 1,
          color: { dark: "#ffffff", light: "#120b2b" }
        });

        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      }
    };

    void loadQr();

    return () => {
      cancelled = true;
    };
  }, [code, orderId]);

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  useEffect(() => {
    const blockEvent = (event: Event) => {
      event.preventDefault();
      setShieldVisible(true);
      window.setTimeout(() => setShieldVisible(false), 1200);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isCopyAttempt = (event.ctrlKey || event.metaKey) && key === "c";
      const isPrintScreen = event.key === "PrintScreen";
      if (!isCopyAttempt && !isPrintScreen) {
        return;
      }

      event.preventDefault();
      setShieldVisible(true);
      window.setTimeout(() => setShieldVisible(false), 1200);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        setShieldVisible(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("contextmenu", blockEvent);
    document.addEventListener("dragstart", blockEvent);
    document.addEventListener("selectstart", blockEvent);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("dragstart", blockEvent);
      document.removeEventListener("selectstart", blockEvent);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="ud-checkout-modal-overlay" onClick={onClose}>
      <div className="ud-checkout-modal ud-validation-modal" onClick={(event) => event.stopPropagation()}>
        {shieldVisible && (
          <div className="ud-validation-shield" aria-live="polite">
            🔒 Zone protégée
          </div>
        )}
        <h3>{title}</h3>
        <p className="ud-checkout-modal-help">{helpText}</p>
        <p className="ud-validation-expiry">
          {expiryLabel
            ? `Expire le ${expiryLabel}`
            : "Code à usage unique"}
        </p>
        <div className="ud-validation-qr-card ud-validation-sensitive" data-sensitive="true">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code de validation" className="ud-validation-qr-image" />
          ) : (
            <div className="ud-validation-qr-placeholder">QR</div>
          )}
          <div className="ud-validation-qr-meta">
            <span className="ud-validation-qr-label">Code</span>
            <strong className="ud-validation-qr-code">{code}</strong>
            <span className="ud-validation-qr-order">Commande #{orderId.slice(-6).toUpperCase()}</span>
          </div>
        </div>
        <div className="ud-checkout-modal-actions">
          <button type="button" className="ud-art-publish-btn" onClick={onClose}>{closeLabel}</button>
        </div>
      </div>
    </div>
  );
}