import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./modal.css";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  /** Contrôle l'affichage. */
  isOpen: boolean;
  /** Callback à la fermeture (clic overlay, touche Escape, bouton close). */
  onClose: () => void;
  /** Titre affiché dans le header (optionnel — pas de header si omis). */
  title?: string;
  /** Taille du modal. Par défaut "md" (520px). */
  size?: ModalSize;
  /** Contenu du modal. */
  children: ReactNode;
  /** Boutons / actions dans le footer (optionnel — pas de footer si omis). */
  footer?: ReactNode;
  /** Empêche la fermeture par clic sur l'overlay. */
  persistent?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  size = "md",
  children,
  footer,
  persistent = false,
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
    },
    [onClose, persistent],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizeClass = size === "md" ? "" : ` ks-modal--${size}`;

  return createPortal(
    <div
      className="ks-modal-overlay"
      onClick={persistent ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Modal"}
    >
      <div
        className={`ks-modal${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="ks-modal-header">
            <h2 className="ks-modal-title">{title}</h2>
            <button
              type="button"
              className="ks-modal-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        )}
        <div className="ks-modal-body">{children}</div>
        {footer != null && <div className="ks-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
