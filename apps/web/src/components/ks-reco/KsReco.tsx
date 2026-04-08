/**
 * KsReco — Système unifié de recommandations commerciales Kin-Sell
 *
 * Composants inline, non intrusifs, design premium glassmorphism.
 * Variantes user (violet) / business (gold).
 *
 *  KsBanner        — bandeau contextuel
 *  KsRecoCard      — carte recommandation enrichie
 *  KsAdvisorPanel  — panneau conseiller IA inline
 *  KsAnalyticsCTA  — CTA vers Kin-Sell Analytique
 *  KsBoostSuggest  — suggestion de boost/pub
 *  KsUpgradeCard   — suggestion d'upgrade forfait
 *  KsTip           — encart léger post-action
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./ks-reco.css";

/* ═══════════════════════════════════════════ TYPES ═══════ */

export type AccountVariant = "user" | "business";

export interface KsRecoItem {
  icon?: string;
  category?: string;
  categoryColor?: string;
  title: string;
  message: string;
  rationale?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  pricing?: string;
  signals?: string[];
  metrics?: Record<string, string | number>;
}

/* ═══════════════════════════════════════════ UTILS ═══════ */

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ═══════════════════════════════════════════════════════════
   1. KS BANNER — bandeau contextuel inline
   ═══════════════════════════════════════════════════════════ */

export interface KsBannerProps {
  accountType?: AccountVariant;
  icon?: string;
  title: string;
  message: string;
  pricing?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  onDismiss?: () => void;
}

export function KsBanner({
  accountType = "user",
  icon = "💡",
  title,
  message,
  pricing,
  ctaLabel,
  ctaTarget,
  onDismiss,
}: KsBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className={cn("kr-glass kr-banner", accountType === "business" && "kr-glass--business")}>
      <div className="kr-banner-body">
        <span className="kr-banner-icon">{icon}</span>
        <div className="kr-banner-text">
          <span className="kr-banner-title">{title}</span>
          <span className="kr-banner-msg">{message}</span>
          {pricing && <span className="kr-banner-price">{pricing}</span>}
        </div>
      </div>
      <div className="kr-banner-actions">
        {ctaLabel && ctaTarget && (
          <button
            className={cn("kr-cta kr-cta--sm", accountType === "business" && "kr-cta--business")}
            onClick={() => navigate(ctaTarget)}
          >
            {ctaLabel}
          </button>
        )}
        <button
          className="kr-dismiss"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   2. KS RECO CARD — carte recommandation enrichie
   ═══════════════════════════════════════════════════════════ */

export interface KsRecoCardProps {
  accountType?: AccountVariant;
  icon?: string;
  category?: string;
  categoryColor?: string;
  title: string;
  message: string;
  rationale?: string;
  signals?: string[];
  metrics?: Record<string, string | number>;
  pricing?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  onDismiss?: () => void;
}

export function KsRecoCard({
  accountType = "user",
  icon = "🎯",
  category,
  categoryColor,
  title,
  message,
  rationale,
  signals,
  metrics,
  pricing,
  ctaLabel,
  ctaTarget,
  onDismiss,
}: KsRecoCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hasDetail = rationale || signals?.length || metrics;
  if (dismissed) return null;

  return (
    <div className={cn("kr-glass kr-card", accountType === "business" && "kr-glass--business")}>
      <div className="kr-card-top" onClick={() => hasDetail && setExpanded(!expanded)}>
        <span className="kr-card-icon">{icon}</span>
        <div className="kr-card-content">
          <div className="kr-card-head">
            {category && (
              <span className="kr-tag" style={categoryColor ? { color: categoryColor } : undefined}>
                {category}
              </span>
            )}
            <h4 className="kr-card-title">{title}</h4>
          </div>
          <p className="kr-card-msg">{message}</p>
        </div>
        {hasDetail && (
          <span className={cn("kr-chevron", expanded && "kr-chevron--open")}>▾</span>
        )}
        <button
          className="kr-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="kr-card-detail">
          {rationale && (
            <div className="kr-card-rationale">
              <strong>Pourquoi ?</strong>
              <p>{rationale}</p>
            </div>
          )}
          {signals && signals.length > 0 && (
            <div className="kr-card-signals">
              {signals.map((s, i) => (
                <span className="kr-pill" key={i}>{s}</span>
              ))}
            </div>
          )}
          {metrics && Object.keys(metrics).length > 0 && (
            <div className="kr-card-metrics">
              {Object.entries(metrics).map(([k, v]) => (
                <div className="kr-card-metric" key={k}>
                  <span className="kr-card-metric-val">{v}</span>
                  <span className="kr-card-metric-key">{k}</span>
                </div>
              ))}
            </div>
          )}
          <div className="kr-card-footer">
            {pricing && <span className="kr-card-price">{pricing}</span>}
            {ctaLabel && ctaTarget && (
              <button
                className={cn("kr-cta", accountType === "business" && "kr-cta--business")}
                onClick={() => navigate(ctaTarget)}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   3. KS ADVISOR PANEL — panneau conseiller IA inline
   ═══════════════════════════════════════════════════════════ */

export interface KsAdviceItem {
  icon?: string;
  category?: string;
  categoryColor?: string;
  title: string;
  message: string;
  rationale?: string;
  metrics?: Record<string, string | number>;
  ctaLabel?: string;
  ctaTarget?: string;
}

export interface KsAdvisorPanelProps {
  accountType?: AccountVariant;
  title?: string;
  subtitle?: string;
  icon?: string;
  qualityScore?: number;
  qualitySignals?: string[];
  advices: KsAdviceItem[];
  explainerLabel?: string;
  explainerItems?: string[];
  onDismiss?: () => void;
}

export function KsAdvisorPanel({
  accountType = "user",
  title = "Conseiller IA",
  subtitle,
  icon = "🧠",
  qualityScore,
  qualitySignals,
  advices,
  explainerLabel,
  explainerItems,
  onDismiss,
}: KsAdvisorPanelProps) {
  const navigate = useNavigate();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || advices.length === 0) return null;

  const scoreColor =
    qualityScore != null
      ? qualityScore >= 75
        ? "var(--kr-success)"
        : qualityScore >= 45
        ? "var(--kr-warn)"
        : "var(--kr-danger)"
      : undefined;

  return (
    <div className={cn("kr-glass kr-advisor", accountType === "business" && "kr-glass--business")}>
      {/* Header */}
      <div className="kr-advisor-header">
        <span className="kr-advisor-icon">{icon}</span>
        <div className="kr-advisor-header-text">
          <h3 className="kr-advisor-title">{title}</h3>
          {subtitle && <p className="kr-advisor-subtitle">{subtitle}</p>}
        </div>
        <button
          className="kr-dismiss"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Quality Score */}
      {qualityScore != null && (
        <div className="kr-advisor-quality">
          <div className="kr-advisor-quality-label">
            <span>Score qualité</span>
            <strong style={{ color: scoreColor }}>{qualityScore}%</strong>
          </div>
          <div className="kr-advisor-quality-bar">
            <div
              className="kr-advisor-quality-fill"
              style={{
                width: `${qualityScore}%`,
                background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)`,
              }}
            />
          </div>
          {qualitySignals && qualitySignals.length > 0 && (
            <div className="kr-advisor-quality-signals">
              {qualitySignals.map((s, i) => (
                <span className="kr-advisor-quality-signal" key={i}>{s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Badge */}
      <div className="kr-advisor-badge">
        ✨ {advices.length} recommandation{advices.length > 1 ? "s" : ""} personnalisée{advices.length > 1 ? "s" : ""}
      </div>

      {/* Advice List */}
      <div className="kr-advisor-list">
        {advices.map((a, i) => {
          const isOpen = openIdx === i;
          const hasDetail = a.rationale || a.metrics;
          return (
            <div className="kr-advice" key={i}>
              <div className="kr-advice-top" onClick={() => hasDetail && setOpenIdx(isOpen ? null : i)}>
                <span className="kr-advice-icon">{a.icon || "💡"}</span>
                <div className="kr-advice-content">
                  <div className="kr-advice-head">
                    {a.category && (
                      <span className="kr-tag" style={a.categoryColor ? { color: a.categoryColor } : undefined}>
                        {a.category}
                      </span>
                    )}
                    <h5 className="kr-advice-title">{a.title}</h5>
                  </div>
                  <p className="kr-advice-msg">{a.message}</p>
                </div>
                {hasDetail && (
                  <span className={cn("kr-chevron", isOpen && "kr-chevron--open")}>▾</span>
                )}
              </div>
              {isOpen && (
                <div className="kr-advice-detail">
                  {a.rationale && (
                    <div className="kr-advice-why">
                      <strong>Pourquoi ?</strong>
                      <p>{a.rationale}</p>
                    </div>
                  )}
                  {a.metrics && Object.keys(a.metrics).length > 0 && (
                    <div className="kr-advice-metrics">
                      {Object.entries(a.metrics).map(([k, v]) => (
                        <div className="kr-advice-metric" key={k}>
                          <span className="kr-advice-metric-val">{v}</span>
                          <span className="kr-advice-metric-key">{k}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {a.ctaLabel && a.ctaTarget && (
                    <button
                      className={cn("kr-cta kr-cta--sm", accountType === "business" && "kr-cta--business")}
                      onClick={() => navigate(a.ctaTarget!)}
                    >
                      {a.ctaLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Explainer */}
      {explainerLabel && explainerItems && explainerItems.length > 0 && (
        <div className="kr-advisor-explainer">
          <p>{explainerLabel}</p>
          <ul>
            {explainerItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   4. KS ANALYTICS CTA
   ═══════════════════════════════════════════════════════════ */

export interface KsAnalyticsCTAProps {
  accountType?: AccountVariant;
  tier: "medium" | "premium";
  icon?: string;
  title: string;
  subtitle: string;
  message: string;
  whyNow?: string;
  valuePills?: string[];
  metrics?: Record<string, string | number>;
  mediumFeatures?: string[];
  premiumFeatures?: string[];
  planLabel?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  onDismiss?: () => void;
}

export function KsAnalyticsCTA({
  accountType = "user",
  tier,
  icon = "📊",
  title,
  subtitle,
  message,
  whyNow,
  valuePills,
  metrics,
  mediumFeatures,
  premiumFeatures,
  planLabel,
  ctaLabel,
  ctaTarget,
  onDismiss,
}: KsAnalyticsCTAProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className={cn(
        "kr-glass kr-analytics-card",
        `kr-analytics-card--${tier}`,
        accountType === "business" && "kr-glass--business"
      )}
    >
      <div className="kr-analytics-top" onClick={() => setExpanded(!expanded)}>
        <span className="kr-analytics-icon">{icon}</span>
        <div className="kr-analytics-content">
          <div className="kr-analytics-head">
            <span className={cn("kr-analytics-tier", `kr-analytics-tier--${tier}`)}>
              {tier}
            </span>
            <h4 className="kr-analytics-title">{title}</h4>
          </div>
          <p className="kr-analytics-subtitle">{subtitle}</p>
        </div>
        <span className={cn("kr-chevron", expanded && "kr-chevron--open")}>▾</span>
        <button
          className="kr-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="kr-analytics-body">
          <p className="kr-analytics-message">{message}</p>

          {whyNow && (
            <div className="kr-analytics-why">
              <span className="kr-analytics-why-label">⏰ Pourquoi maintenant ?</span>
              <p className="kr-analytics-why-text">{whyNow}</p>
            </div>
          )}

          {valuePills && valuePills.length > 0 && (
            <div className="kr-analytics-pills">
              {valuePills.map((v, i) => (
                <span className="kr-analytics-pill" key={i}>{v}</span>
              ))}
            </div>
          )}

          {metrics && Object.keys(metrics).length > 0 && (
            <div className="kr-analytics-metrics">
              {Object.entries(metrics).map(([k, v]) => (
                <div className="kr-analytics-metric" key={k}>
                  <span className="kr-analytics-metric-val">{v}</span>
                  <span className="kr-analytics-metric-key">{k}</span>
                </div>
              ))}
            </div>
          )}

          {(mediumFeatures || premiumFeatures) && (
            <div className="kr-analytics-tiers">
              {mediumFeatures && (
                <div className="kr-analytics-tier-col">
                  <span className="kr-analytics-tier-col-title kr-analytics-tier-col-title--medium">MEDIUM</span>
                  <ul>
                    {mediumFeatures.map((f, i) => (
                      <li key={i}>✓ {f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {premiumFeatures && (
                <div className="kr-analytics-tier-col">
                  <span className="kr-analytics-tier-col-title kr-analytics-tier-col-title--premium">PREMIUM</span>
                  <ul>
                    {premiumFeatures.map((f, i) => (
                      <li key={i}>✓ {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="kr-analytics-footer">
            {planLabel && <span className="kr-analytics-plan">{planLabel}</span>}
            {ctaLabel && ctaTarget && (
              <button
                className={cn("kr-cta", accountType === "business" && "kr-cta--business")}
                onClick={() => navigate(ctaTarget)}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   5. KS BOOST SUGGEST — suggestion de boost/pub inline
   ═══════════════════════════════════════════════════════════ */

export interface KsBoostOption {
  duration: string;
  price: string;
  value?: string;
}

export interface KsBoostSuggestProps {
  accountType?: AccountVariant;
  icon?: string;
  title: string;
  message: string;
  options: KsBoostOption[];
  ctaLabel?: string;
  onSelect?: (option: KsBoostOption) => void;
  onDismiss?: () => void;
}

export function KsBoostSuggest({
  accountType = "user",
  icon = "🚀",
  title,
  message,
  options,
  ctaLabel = "Activer",
  onSelect,
  onDismiss,
}: KsBoostSuggestProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || options.length === 0) return null;

  const selected = options[selectedIdx];

  return (
    <div className={cn("kr-glass kr-boost", accountType === "business" && "kr-glass--business")}>
      <div className="kr-boost-top">
        <span className="kr-boost-icon">{icon}</span>
        <div className="kr-boost-content">
          <h4 className="kr-boost-title">{title}</h4>
          <p className="kr-boost-msg">{message}</p>
        </div>
        <button
          className="kr-dismiss"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      <div className="kr-boost-options">
        {options.map((o, i) => (
          <div
            key={i}
            className={cn("kr-boost-option", i === selectedIdx && "kr-boost-option--active")}
            onClick={() => setSelectedIdx(i)}
          >
            <span className="kr-boost-option-duration">{o.duration}</span>
            <span className="kr-boost-option-price">{o.price}</span>
          </div>
        ))}
      </div>

      <div className="kr-boost-footer">
        <button
          className={cn("kr-cta", accountType === "business" && "kr-cta--business")}
          onClick={() => onSelect?.(selected)}
        >
          {ctaLabel} — {selected.price}
        </button>
        <button className="kr-cta kr-cta--ghost" onClick={() => { setDismissed(true); onDismiss?.(); }}>
          Plus tard
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   6. KS UPGRADE CARD — suggestion d'upgrade forfait
   ═══════════════════════════════════════════════════════════ */

export interface KsUpgradeCardProps {
  accountType?: AccountVariant;
  icon?: string;
  title: string;
  subtitle?: string;
  currentPlan: string;
  currentPrice?: string;
  targetPlan: string;
  targetPrice?: string;
  features: string[];
  signals?: string[];
  ctaLabel?: string;
  ctaTarget?: string;
  onDismiss?: () => void;
}

export function KsUpgradeCard({
  accountType = "user",
  icon = "⚡",
  title,
  subtitle,
  currentPlan,
  currentPrice,
  targetPlan,
  targetPrice,
  features,
  signals,
  ctaLabel = "Découvrir",
  ctaTarget = "/plans",
  onDismiss,
}: KsUpgradeCardProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className={cn("kr-glass kr-upgrade", accountType === "business" && "kr-glass--business")}>
      <div className="kr-upgrade-header">
        <span className="kr-upgrade-icon">{icon}</span>
        <div className="kr-upgrade-header-text">
          <h3 className="kr-upgrade-title">{title}</h3>
          {subtitle && <p className="kr-upgrade-subtitle">{subtitle}</p>}
        </div>
        <button
          className="kr-dismiss"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      <div className="kr-upgrade-comparison">
        <div className="kr-upgrade-plan kr-upgrade-plan--current">
          <span className="kr-upgrade-plan-name">{currentPlan}</span>
          {currentPrice && <span className="kr-upgrade-plan-price">{currentPrice}</span>}
        </div>
        <span className="kr-upgrade-arrow">→</span>
        <div className="kr-upgrade-plan kr-upgrade-plan--target">
          <span className="kr-upgrade-plan-name">{targetPlan}</span>
          {targetPrice && <span className="kr-upgrade-plan-price">{targetPrice}</span>}
        </div>
      </div>

      {features.length > 0 && (
        <div className="kr-upgrade-features">
          {features.map((f, i) => (
            <span className="kr-upgrade-feature" key={i}>{f}</span>
          ))}
        </div>
      )}

      {signals && signals.length > 0 && (
        <div className="kr-upgrade-signals">
          {signals.map((s, i) => (
            <span className="kr-pill" key={i}>{s}</span>
          ))}
        </div>
      )}

      <div className="kr-upgrade-footer">
        <button className="kr-cta kr-cta--ghost" onClick={() => { setDismissed(true); onDismiss?.(); }}>
          Plus tard
        </button>
        <button
          className={cn("kr-cta", accountType === "business" && "kr-cta--business")}
          onClick={() => navigate(ctaTarget)}
        >
          {ctaLabel} {targetPlan}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   7. KS TIP — encart léger post-action
   ═══════════════════════════════════════════════════════════ */

export interface KsTipProps {
  accountType?: AccountVariant;
  icon?: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaTarget?: string;
  autoDismissMs?: number;
  onDismiss?: () => void;
}

export function KsTip({
  accountType = "user",
  icon = "💡",
  title,
  message,
  ctaLabel,
  ctaTarget,
  autoDismissMs,
  onDismiss,
}: KsTipProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);

  const dismiss = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!autoDismissMs) return;
    const t = setTimeout(dismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, dismiss]);

  if (dismissed) return null;

  return (
    <div className={cn("kr-glass kr-tip", accountType === "business" && "kr-glass--business", closing && "kr-tip--closing")}>
      <span className="kr-tip-icon">{icon}</span>
      <div className="kr-tip-body">
        <span className="kr-tip-title">{title}</span>
        <span className="kr-tip-msg">{message}</span>
      </div>
      <div className="kr-tip-actions">
        {ctaLabel && ctaTarget && (
          <button
            className={cn("kr-cta kr-cta--sm", accountType === "business" && "kr-cta--business")}
            onClick={() => navigate(ctaTarget)}
          >
            {ctaLabel}
          </button>
        )}
        <button className="kr-dismiss" onClick={dismiss} aria-label="Fermer">✕</button>
      </div>
    </div>
  );
}
