/**
 * SoKinToast — Système de toast global glassmorphism pour So-Kin
 *
 * Usage :
 *   const toast = useSoKinToast();
 *   toast.success('Publication modifiée');
 *   toast.error('Erreur de suppression');
 *   toast.info('Repost enregistré');
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/* ── Types ── */
export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  leaving: boolean;
}

interface ToastAPI {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

/* ── Context ── */
const SoKinToastCtx = createContext<ToastAPI | null>(null);

export function useSoKinToast(): ToastAPI {
  const ctx = useContext(SoKinToastCtx);
  if (!ctx) throw new Error('useSoKinToast must be used inside SoKinToastProvider');
  return ctx;
}

/* ── Provider + renderer ── */
const TOAST_DURATION = 2500;
const TOAST_FADE_OUT = 350;
const MAX_TOASTS = 3;

export function SoKinToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_FADE_OUT);
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++nextId.current;
    setToasts((prev) => {
      const next = [...prev, { id, type, message, leaving: false }];
      // limite
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    setTimeout(() => dismiss(id), TOAST_DURATION);
  }, [dismiss]);

  const api = useMemo<ToastAPI>(() => ({
    success: (msg) => push('success', msg),
    error: (msg) => push('error', msg),
    info: (msg) => push('info', msg),
  }), [push]);

  const ICONS: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ℹ' };

  return (
    <SoKinToastCtx.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="sk-toast-container" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`sk-toast sk-toast--${t.type}${t.leaving ? ' sk-toast--leaving' : ''}`}
              role="status"
            >
              <span className="sk-toast-icon">{ICONS[t.type]}</span>
              <span className="sk-toast-msg">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </SoKinToastCtx.Provider>
  );
}
