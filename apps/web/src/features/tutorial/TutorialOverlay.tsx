import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTutorial } from './TutorialProvider';
import type { TutorialStep } from './tutorial-types';
import './tutorial.css';

// ═══════════════════════════════════════════════
// IA TUTO KIN-SELL — Overlay + Highlight + Popup
// ═══════════════════════════════════════════════

interface Rect {
  top: number; left: number; width: number; height: number;
}

const PAD = 8; // padding around the highlighted element

function getTargetRect(selector: string): Rect | null {
  // selector may contain multiple selectors separated by ", "
  const selectors = selector.split(',').map(s => s.trim());
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return {
            top: r.top + window.scrollY - PAD,
            left: r.left + window.scrollX - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
          };
        }
      }
    } catch {
      // invalid selector — skip
    }
  }
  return null;
}

function scrollToTarget(selector: string) {
  const selectors = selector.split(',').map(s => s.trim());
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    } catch { /* skip */ }
  }
}

// ─── Popup position ──────────────────────────

interface PopupPos {
  top: string; left: string; transform: string;
  arrowClass: string;
}

function computePopupPos(
  rect: Rect | null,
  position: TutorialStep['position'],
  isMobile: boolean,
): PopupPos {
  if (!rect || position === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      arrowClass: '',
    };
  }

  const vw = window.innerWidth;
  const maxPopupW = isMobile ? vw - 32 : 400;

  switch (position) {
    case 'bottom':
      return {
        top: `${rect.top + rect.height + 14}px`,
        left: `${Math.max(16, Math.min(rect.left + rect.width / 2, vw - maxPopupW / 2 - 16))}px`,
        transform: 'translateX(-50%)',
        arrowClass: 'tuto-arrow-top',
      };
    case 'top':
      return {
        top: `${rect.top - 14}px`,
        left: `${Math.max(16, Math.min(rect.left + rect.width / 2, vw - maxPopupW / 2 - 16))}px`,
        transform: 'translate(-50%,-100%)',
        arrowClass: 'tuto-arrow-bottom',
      };
    case 'left':
      return {
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.left - 14}px`,
        transform: 'translate(-100%,-50%)',
        arrowClass: 'tuto-arrow-right',
      };
    case 'right':
      return {
        top: `${rect.top + rect.height / 2}px`,
        left: `${rect.left + rect.width + 14}px`,
        transform: 'translateY(-50%)',
        arrowClass: 'tuto-arrow-left',
      };
    default:
      return {
        top: `${rect.top + rect.height + 14}px`,
        left: `${Math.max(16, Math.min(rect.left + rect.width / 2, vw - maxPopupW / 2 - 16))}px`,
        transform: 'translateX(-50%)',
        arrowClass: 'tuto-arrow-top',
      };
  }
}

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

export function TutorialOverlay() {
  const {
    isActive,
    activeScenario,
    currentStep,
    nextStep,
    prevStep,
    closeTutorial,
    skipScenario,
    disableScenario,
  } = useTutorial();

  const isMobile = useIsMobile();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(0);

  const step = activeScenario?.steps[currentStep] ?? null;
  const totalSteps = activeScenario?.steps.length ?? 0;

  // Track target element position
  const updateRect = useCallback(() => {
    if (!step) { setTargetRect(null); return; }
    const rect = getTargetRect(step.target);
    setTargetRect(rect);
    rafRef.current = requestAnimationFrame(updateRect);
  }, [step]);

  useEffect(() => {
    if (!isActive || !step) {
      setVisible(false);
      setTargetRect(null);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Scroll into view
    if (step.scrollIntoView) {
      scrollToTarget(step.target);
    }

    const delay = step.delay ?? 200;
    const timer = setTimeout(() => {
      setVisible(true);
      updateRect();
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, step, updateRect]);

  // Listen for waitForAction events
  useEffect(() => {
    if (!step || !step.waitForAction || step.waitForAction === 'none') return;
    const actionSel = step.actionTarget || step.target;
    const selectors = actionSel.split(',').map(s => s.trim());

    let target: Element | null = null;
    for (const sel of selectors) {
      try { target = document.querySelector(sel); if (target) break; } catch { /* skip */ }
    }
    if (!target) return;

    function handler() { nextStep(); }

    const eventMap: Record<string, string> = {
      click: 'click',
      input: 'input',
      scroll: 'scroll',
    };
    const event = eventMap[step!.waitForAction!];
    if (!event) return;

    target.addEventListener(event, handler, { once: true });
    return () => target?.removeEventListener(event, handler);
  }, [step, nextStep]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeTutorial();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, closeTutorial, nextStep, prevStep]);

  if (!isActive || !step || !visible) return null;

  const popupPos = computePopupPos(targetRect, step.position, isMobile);
  const content = isMobile && step.contentMobile ? step.contentMobile : step.content;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const hasWait = step.waitForAction && step.waitForAction !== 'none';

  return (
    <div className="tuto-overlay-root" role="dialog" aria-label="Tutoriel">
      {/* SVG mask overlay — dark everywhere except target cutout */}
      <svg className="tuto-overlay-mask" viewBox={`0 0 ${window.innerWidth} ${document.documentElement.scrollHeight}`} preserveAspectRatio="none">
        <defs>
          <mask id="tuto-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tuto-mask)"
          onClick={closeTutorial}
        />
      </svg>

      {/* Highlight border glow */}
      {targetRect && (
        <div
          className="tuto-highlight"
          style={{
            position: 'absolute',
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Popup */}
      <div
        className={`tuto-popup ${popupPos.arrowClass} ${isMobile ? 'tuto-popup--mobile' : ''}`}
        style={{
          position: 'absolute',
          top: popupPos.top,
          left: popupPos.left,
          transform: popupPos.transform,
        }}
      >
        {/* Header */}
        <div className="tuto-popup-header">
          <span className="tuto-popup-title">{step.title}</span>
          <button
            className="tuto-popup-close"
            onClick={closeTutorial}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="tuto-popup-body">{content}</div>

        {/* Footer */}
        <div className="tuto-popup-footer">
          <div className="tuto-popup-steps">
            {currentStep + 1} / {totalSteps}
          </div>
          <div className="tuto-popup-actions">
            {!isFirst && (
              <button className="tuto-btn tuto-btn--ghost" onClick={prevStep}>
                ← Retour
              </button>
            )}
            {!hasWait && !isLast && (
              <button className="tuto-btn tuto-btn--primary" onClick={nextStep}>
                Suivant →
              </button>
            )}
            {!hasWait && isLast && (
              <button className="tuto-btn tuto-btn--primary" onClick={nextStep}>
                Terminer ✓
              </button>
            )}
            {hasWait && (
              <span className="tuto-wait-hint">En attente de ton action…</span>
            )}
          </div>
        </div>

        {/* Skip / Disable actions */}
        <div className="tuto-popup-meta">
          <button className="tuto-link" onClick={skipScenario}>
            Passer ce tutoriel
          </button>
          <button
            className="tuto-link"
            onClick={() => { disableScenario(activeScenario!.id); closeTutorial(); }}
          >
            Ne plus afficher
          </button>
        </div>
      </div>
    </div>
  );
}
