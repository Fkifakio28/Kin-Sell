import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./drawer.css";

export type DrawerPosition = "bottom" | "right" | "left";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Position du drawer. Par défaut "bottom". */
  position?: DrawerPosition;
  /** Titre (optionnel). */
  title?: string;
  /** Affiche un handle de glissement (bottom sheet). */
  showHandle?: boolean;
  children: ReactNode;
}

export function Drawer({
  isOpen,
  onClose,
  position = "bottom",
  title,
  showHandle = false,
  children,
}: DrawerProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
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

  return createPortal(
    <>
      <div className="ks-drawer-overlay" onClick={onClose} />
      <aside
        className={`ks-drawer ks-drawer--${position}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Panel"}
      >
        {showHandle && <div className="ks-drawer-handle" />}
        {title != null && (
          <div className="ks-drawer-header">
            <h2 className="ks-drawer-title">{title}</h2>
            <button
              type="button"
              className="ks-drawer-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        )}
        <div className="ks-drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
