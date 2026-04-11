/**
 * TutorialOverlay — Tutoriel interactif global Kin‑Sell
 *
 * Overlay opaque + trou lumineux sur l'élément ciblé + tooltip + contrôles.
 * Réutilisable par page, responsive, accessible, relançable.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FC } from "react";
import { createPortal } from "react-dom";
import "./tutorial-overlay.css";

/* ── Types publics ── */

export type TutorialPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TutorialStep {
  /** Identifiant unique de l'étape */
  id: string;
  /** Sélecteur CSS de l'élément cible (querySelector) */
  selector: string;
  /** Titre de la bulle */
  title: string;
  /** Texte explicatif */
  description: string;
  /** Position préférée du tooltip par rapport à la cible */
  placement?: TutorialPlacement;
}

export interface TutorialOverlayProps {
  /** Clé unique de la page (pour localStorage) */
  pageKey: string;
  /** Liste ordonnée des étapes */
  steps: TutorialStep[];
  /** Contrôle externe d'ouverture */
  open: boolean;
  /** Callback quand le tutoriel se ferme */
  onClose: () => void;
}

/* ── Constantes ── */

const LS_PREFIX = "ks-tuto-done-";
const PADDING = 8; // padding autour de l'élément ciblé
const TOOLTIP_GAP = 14; // espace entre la cible et le tooltip
const ARROW_SIZE = 10;

/* ── Helpers ── */

function getRect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

function scrollIntoViewIfNeeded(el: Element) {
  const rect = el.getBoundingClientRect();
  const inView =
    rect.top >= -20 &&
    rect.bottom <= window.innerHeight + 20 &&
    rect.left >= -20 &&
    rect.right <= window.innerWidth + 20;
  if (!inView) {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
}

/** Détermine le meilleur placement si "auto" */
function resolvePlacement(rect: DOMRect, pref: TutorialPlacement): Exclude<TutorialPlacement, "auto"> {
  if (pref !== "auto") return pref;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft = rect.left;
  // Préférer bottom, puis top, puis right, puis left
  if (spaceBelow >= 160) return "bottom";
  if (spaceAbove >= 160) return "top";
  if (spaceRight >= 260) return "right";
  if (spaceLeft >= 260) return "left";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

/** Calcule la position du tooltip */
function computeTooltipPos(
  rect: DOMRect,
  placement: Exclude<TutorialPlacement, "auto">,
  tooltipW: number,
  tooltipH: number,
) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = rect.bottom + PADDING + TOOLTIP_GAP;
      left = cx - tooltipW / 2;
      break;
    case "top":
      top = rect.top - PADDING - TOOLTIP_GAP - tooltipH;
      left = cx - tooltipW / 2;
      break;
    case "right":
      top = cy - tooltipH / 2;
      left = rect.right + PADDING + TOOLTIP_GAP;
      break;
    case "left":
      top = cy - tooltipH / 2;
      left = rect.left - PADDING - TOOLTIP_GAP - tooltipW;
      break;
  }

  // Clamp dans le viewport
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - tooltipH - 12));

  return { top, left };
}

/* ── Composant ── */

export const TutorialOverlay: FC<TutorialOverlayProps> = ({ pageKey, steps, open, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<Exclude<TutorialPlacement, "auto">>("bottom");
  const [visible, setVisible] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  // Filtrer les étapes dont le sélecteur existe dans le DOM
  const [validSteps, setValidSteps] = useState<TutorialStep[]>([]);

  // Recalculer les étapes valides à l'ouverture
  useEffect(() => {
    if (!open) return;
    // Petit délai pour laisser le DOM se stabiliser
    const timer = setTimeout(() => {
      const valid = steps.filter((s) => document.querySelector(s.selector) != null);
      setValidSteps(valid);
      setCurrentIndex(0);
      setVisible(valid.length > 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [open, steps]);

  const step = validSteps[currentIndex] ?? null;
  const totalSteps = validSteps.length;

  // Positionner sur l'élément cible
  const updatePosition = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) return;

    scrollIntoViewIfNeeded(el);

    // Délai après scroll
    requestAnimationFrame(() => {
      const rect = getRect(el);
      setTargetRect(rect);
      const resolved = resolvePlacement(rect, step.placement ?? "auto");
      setPlacement(resolved);

      const tooltip = tooltipRef.current;
      if (tooltip) {
        const tW = tooltip.offsetWidth || 320;
        const tH = tooltip.offsetHeight || 180;
        setTooltipPos(computeTooltipPos(rect, resolved, tW, tH));
      }
    });
  }, [step]);

  // Recalculer quand l'étape change
  useLayoutEffect(() => {
    if (!visible || !step) return;
    // Délai pour scroll
    const t = setTimeout(updatePosition, 100);
    return () => clearTimeout(t);
  }, [visible, currentIndex, step, updatePosition]);

  // Recalculer sur resize / scroll
  useEffect(() => {
    if (!visible) return;
    const handler = () => updatePosition();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [visible, updatePosition]);

  // Fermeture
  const close = useCallback(() => {
    if (dontShow) {
      try { localStorage.setItem(LS_PREFIX + pageKey, "1"); } catch {}
    }
    setVisible(false);
    setTargetRect(null);
    onClose();
  }, [dontShow, pageKey, onClose]);

  // Clavier
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        if (document.activeElement === nextBtnRef.current || document.activeElement === tooltipRef.current) {
          e.preventDefault();
          if (currentIndex < totalSteps - 1) setCurrentIndex((i) => i + 1);
          else close();
        }
      }
      if (e.key === "ArrowLeft") {
        if (currentIndex > 0) setCurrentIndex((i) => i - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, currentIndex, totalSteps, close]);

  // Focus le tooltip quand il apparaît
  useEffect(() => {
    if (visible && tooltipRef.current) {
      tooltipRef.current.focus();
    }
  }, [visible, currentIndex]);

  // Navigation
  const goNext = () => {
    if (currentIndex < totalSteps - 1) setCurrentIndex((i) => i + 1);
    else close();
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  if (!open || !visible || !step || !targetRect) return null;

  // Coordonnées du trou dans le SVG (viewport coords)
  const holeX = targetRect.left - PADDING;
  const holeY = targetRect.top - PADDING;
  const holeW = targetRect.width + PADDING * 2;
  const holeH = targetRect.height + PADDING * 2;
  const holeR = 12; // border-radius du trou

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Flèche du tooltip
  const arrowStyle = (() => {
    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;
    switch (placement) {
      case "bottom":
        return { top: -ARROW_SIZE, left: Math.max(20, Math.min(cx - tooltipPos.left, 300)), borderBottomColor: "#fff" } as const;
      case "top":
        return { bottom: -ARROW_SIZE, left: Math.max(20, Math.min(cx - tooltipPos.left, 300)), borderTopColor: "#fff" } as const;
      case "right":
        return { left: -ARROW_SIZE, top: Math.max(20, Math.min(cy - tooltipPos.top, 200)), borderRightColor: "#fff" } as const;
      case "left":
        return { right: -ARROW_SIZE, top: Math.max(20, Math.min(cy - tooltipPos.top, 200)), borderLeftColor: "#fff" } as const;
    }
  })();

  return createPortal(
    <div className="tuto-root" role="dialog" aria-modal="true" aria-label="Tutoriel Kin-Sell">
      {/* ── SVG Overlay avec trou ── */}
      <svg className="tuto-overlay" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
        <defs>
          <mask id="tuto-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            <rect
              x={holeX}
              y={holeY}
              width={holeW}
              height={holeH}
              rx={holeR}
              ry={holeR}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0" y="0" width={vw} height={vh}
          fill="rgba(10,10,10,0.65)"
          mask="url(#tuto-mask)"
        />
      </svg>

      {/* ── Highlight autour de la cible ── */}
      <div
        className="tuto-highlight"
        style={{
          top: holeY,
          left: holeX,
          width: holeW,
          height: holeH,
          borderRadius: holeR,
        }}
      />

      {/* ── Tooltip ── */}
      <div
        ref={tooltipRef}
        className={`tuto-tooltip tuto-tooltip--${placement}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
        tabIndex={-1}
        role="region"
        aria-label={`Étape ${currentIndex + 1} sur ${totalSteps}`}
      >
        {/* Flèche */}
        <span className={`tuto-arrow tuto-arrow--${placement}`} style={arrowStyle} />

        {/* Contenu */}
        <div className="tuto-header">
          <span className="tuto-step-badge">
            {currentIndex + 1}/{totalSteps}
          </span>
          <button className="tuto-close" onClick={close} aria-label="Fermer le tutoriel" title="Fermer">✕</button>
        </div>

        <h3 className="tuto-title">{step.title}</h3>
        <p className="tuto-desc">{step.description}</p>

        {/* Contrôles */}
        <div className="tuto-controls">
          <label className="tuto-dontshow">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            <span>Ne plus afficher</span>
          </label>
          <div className="tuto-btns">
            {currentIndex > 0 && (
              <button ref={prevBtnRef} className="tuto-btn tuto-btn--prev" onClick={goPrev}>
                ← Précédent
              </button>
            )}
            <button ref={nextBtnRef} className="tuto-btn tuto-btn--next" onClick={goNext}>
              {currentIndex === totalSteps - 1 ? "Terminer ✓" : "Suivant →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/* ── Hook utilitaire ── */

/**
 * Hook pour gérer le tutoriel par page.
 * - Auto-lance au premier rendu si jamais vu
 * - Offre `start()` pour relancer manuellement
 */
export function useTutorial(pageKey: string) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_PREFIX + pageKey)) {
        // Premier lancement : délai pour laisser la page charger
        const t = setTimeout(() => setIsOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [pageKey]);

  const start = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const reset = useCallback(() => {
    try { localStorage.removeItem(LS_PREFIX + pageKey); } catch {}
  }, [pageKey]);

  return { isOpen, start, close, reset };
}

/* ── Bouton « Relancer le tutoriel » ── */

export function TutorialRelaunchBtn({ reset, start }: { reset: () => void; start: () => void }) {
  return (
    <button
      type="button"
      className="tuto-relaunch-btn"
      aria-label="Relancer le tutoriel"
      title="Aide — Relancer le tutoriel"
      onClick={() => { reset(); start(); }}
    >
      ?
    </button>
  );
}

export default TutorialOverlay;
