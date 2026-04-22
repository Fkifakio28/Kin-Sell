/**
 * FrustrationPanel — Chantier C Phase 6 (Frustration freemium 2.0)
 *
 * Consomme GET /analytics/direct-answers et affiche 1 seule frustration/écran
 * (règle §5.2 spec) sous l'un des 3 patterns calibrés :
 *
 *   Pattern A — Preview partiel + chiffre-clé masqué (🔒)
 *     Déclenché : tier=FREE, answer contient meta.keyValue numérique
 *     Principe : contexte visible, valeur masquée, CTA prix explicite.
 *
 *   Pattern B — Contextualisation sociale
 *     Déclenché : tier=MEDIUM, cappedBy=TIER (X réponses en attente)
 *     Principe : "Sur N signaux, K visibles — Premium débloque tout".
 *
 *   Pattern C — Urgence basée sur intent Knowledge IA
 *     Déclenché : severity=CRITICAL, source=JOB ou HYBRID
 *     Principe : urgence réelle pas fake scarcity.
 *
 * Règles §5.2 : jamais de blur total, chiffre-clé masqué pas l'ensemble,
 * CTA contextuel avec prix explicite, 1 frustration / écran max.
 *
 * Tracking : impression + click envoyés côté backend (analytics.routes)
 * via meta.ctaTarget — ici on log juste l'action locale.
 */

import { useEffect, useState, type FC } from "react";
import { Link } from "react-router-dom";
import {
  directAnswers as directAnswersApi,
  type DirectAnswer,
  type DirectAnswerReport,
} from "../lib/services/ai.service";
import "./frustration-panel.css";

type PatternKind = "A" | "B" | "C" | null;

interface FrustrationPanelProps {
  /** Masquer totalement (dashboard business, etc.) */
  hide?: boolean;
  /** Thème visuel */
  accountType?: "user" | "business";
}

const TIER_CTA: Record<"FREE" | "MEDIUM", { label: string; target: string; price: string; plan: string }> = {
  FREE: {
    label: "Activer Analytique",
    target: "/forfaits?plan=BOOST",
    price: "4,99 USD / mois",
    plan: "BOOST Analytique",
  },
  MEDIUM: {
    label: "Passer à Premium",
    target: "/forfaits?plan=SCALE",
    price: "14,99 USD / mois",
    plan: "SCALE Premium",
  },
};

/** Sélectionne l'answer + pattern à afficher (max 1). */
function selectFrustration(report: DirectAnswerReport): { answer: DirectAnswer; pattern: PatternKind } | null {
  if (!report.answers.length) return null;

  // Tri par priorité desc déjà appliqué backend — on prend le top
  const top = report.answers[0];

  // Pattern C : urgence réelle (CRITICAL JOB/HYBRID)
  if (top.severity === "CRITICAL" && (top.source === "JOB" || top.source === "HYBRID")) {
    return { answer: top, pattern: "C" };
  }

  // Pattern B : social / cap (MEDIUM freiné par tier)
  if (report.tier === "MEDIUM" && report.cappedBy === "TIER" && report.totalCandidates > report.answers.length) {
    return { answer: top, pattern: "B" };
  }

  // Pattern A : masked number (FREE avec chiffre-clé)
  if (report.tier === "FREE") {
    return { answer: top, pattern: "A" };
  }

  // Sinon pas de frustration (tier PREMIUM ou rien de significatif)
  return null;
}

export const FrustrationPanel: FC<FrustrationPanelProps> = ({ hide, accountType = "user" }) => {
  const [report, setReport] = useState<DirectAnswerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await directAnswersApi.fetch();
        if (!cancelled) setReport(data);
      } catch {
        /* silencieux */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selection = report ? selectFrustration(report) : null;

  // Impression tracking (une fois par sélection)
  useEffect(() => {
    if (!selection || !report) return;
    try {
      const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
      if (dl) {
        dl.push({
          event: "frustration_impression",
          answer_id: selection.answer.id,
          pattern: selection.pattern,
          tier: report.tier,
        });
      }
    } catch {/* noop */}
  }, [selection?.answer.id, selection?.pattern, report?.tier]);

  if (hide || loading || dismissed || !report || !selection) return null;

  const onCtaClick = () => {
    try {
      const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
      if (dl) {
        dl.push({
          event: "frustration_click",
          answer_id: selection.answer.id,
          pattern: selection.pattern,
          tier: report.tier,
        });
      }
    } catch {/* noop */}
  };

  const cta = report.tier === "FREE" ? TIER_CTA.FREE : TIER_CTA.MEDIUM;

  return (
    <div className={`fp-root fp-root--${accountType} fp-pattern-${selection.pattern?.toLowerCase()}`}>
      {selection.pattern === "A" && <PatternA answer={selection.answer} cta={cta} onCtaClick={onCtaClick} onDismiss={() => setDismissed(true)} />}
      {selection.pattern === "B" && <PatternB answer={selection.answer} cta={cta} total={report.totalCandidates} visible={report.answers.length} onCtaClick={onCtaClick} onDismiss={() => setDismissed(true)} />}
      {selection.pattern === "C" && <PatternC answer={selection.answer} cta={cta} onCtaClick={onCtaClick} onDismiss={() => setDismissed(true)} />}
    </div>
  );
};

/* ──────────────────────────────────────── */
/* Pattern A — Preview + chiffre masqué    */
/* ──────────────────────────────────────── */

interface PatternProps {
  answer: DirectAnswer;
  cta: { label: string; target: string; price: string; plan: string };
  onCtaClick: () => void;
  onDismiss: () => void;
}

function PatternA({ answer, cta, onCtaClick, onDismiss }: PatternProps) {
  return (
    <article className="fp-card fp-card--a" aria-label="Insight Analytique">
      <header className="fp-head">
        <span className="fp-badge fp-badge--info">Insight</span>
        <button type="button" className="fp-close" onClick={onDismiss} aria-label="Fermer">✕</button>
      </header>
      <h4 className="fp-pain">{answer.pain}</h4>
      <div className="fp-masked-row">
        <span className="fp-masked-label">Valeur détectée</span>
        <span className="fp-masked-value" aria-hidden="true">🔒 ••••</span>
      </div>
      <p className="fp-action">{answer.action}</p>
      <footer className="fp-foot">
        <Link to={cta.target} className="fp-cta" onClick={onCtaClick}>
          {cta.label}
        </Link>
        <span className="fp-price"><strong>{cta.plan}</strong> · {cta.price}</span>
      </footer>
    </article>
  );
}

/* ──────────────────────────────────────── */
/* Pattern B — Contextualisation sociale   */
/* ──────────────────────────────────────── */

interface PatternBProps extends PatternProps {
  total: number;
  visible: number;
}

function PatternB({ answer, cta, total, visible, onCtaClick, onDismiss }: PatternBProps) {
  const hidden = Math.max(0, total - visible);
  return (
    <article className="fp-card fp-card--b" aria-label="Autres signaux bloqués">
      <header className="fp-head">
        <span className="fp-badge fp-badge--warn">{hidden} signal{hidden > 1 ? "s" : ""} en attente</span>
        <button type="button" className="fp-close" onClick={onDismiss} aria-label="Fermer">✕</button>
      </header>
      <h4 className="fp-pain">{answer.pain}</h4>
      <div className="fp-social">
        <div className="fp-social-bar">
          <span className="fp-social-fill" style={{ width: `${total > 0 ? (visible / total) * 100 : 0}%` }} />
        </div>
        <p className="fp-social-text">
          <strong>{visible}</strong> réponse{visible > 1 ? "s" : ""} visible{visible > 1 ? "s" : ""} sur <strong>{total}</strong> détectée{total > 1 ? "s" : ""}. Premium débloque les {hidden} restante{hidden > 1 ? "s" : ""}.
        </p>
      </div>
      <p className="fp-action">{answer.action}</p>
      <footer className="fp-foot">
        <Link to={cta.target} className="fp-cta" onClick={onCtaClick}>
          {cta.label}
        </Link>
        <span className="fp-price"><strong>{cta.plan}</strong> · {cta.price}</span>
      </footer>
    </article>
  );
}

/* ──────────────────────────────────────── */
/* Pattern C — Urgence basée intent        */
/* ──────────────────────────────────────── */

function PatternC({ answer, cta, onCtaClick, onDismiss }: PatternProps) {
  return (
    <article className="fp-card fp-card--c" aria-label="Alerte critique">
      <header className="fp-head">
        <span className="fp-badge fp-badge--critical">Action requise</span>
        <button type="button" className="fp-close" onClick={onDismiss} aria-label="Fermer">✕</button>
      </header>
      <h4 className="fp-pain">{answer.pain}</h4>
      <p className="fp-action fp-action--urgent">{answer.action}</p>
      <footer className="fp-foot">
        <Link to={cta.target} className="fp-cta fp-cta--urgent" onClick={onCtaClick}>
          {answer.cta.label || cta.label}
        </Link>
        <span className="fp-price"><strong>{cta.plan}</strong> · {cta.price}</span>
      </footer>
    </article>
  );
}

/* ──────────────────────────────────────── */
/* useEffectOnce — petit helper local       */
/* ──────────────────────────────────────── */

export default FrustrationPanel;
