const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'apps', 'web', 'src', 'features', 'pricing', 'PricingPage.tsx');
let content = fs.readFileSync(file, 'utf-8');

// Find the PlanCard function and replace it
const startMarker = 'function PlanCard({';
const endMarkerText = 'export function PricingPage()';

const startIdx = content.indexOf(startMarker);
const endMarkerIdx = content.indexOf(endMarkerText);

if (startIdx === -1 || endMarkerIdx === -1) {
  console.error('Could not find PlanCard boundaries', startIdx, endMarkerIdx);
  process.exit(1);
}
// Find the closing brace of PlanCard function (last } before export)
// Look backwards from endMarkerIdx for the last }
let endIdx = endMarkerIdx;
// We want to replace from startIdx up to (but not including) endMarkerIdx
// Keep whitespace before export

const newPlanCard = `function PlanCard({
  plan,
  isCurrent,
  canChange,
  loading,
  onChoose,
  recommended,
}: {
  plan: Plan;
  isCurrent: boolean;
  canChange: boolean;
  loading: boolean;
  onChoose: (code: string) => void;
  recommended?: boolean;
}) {
  const priceNum = plan.price.replace('/mois', '');
  return (
    <article className={\`plan-card\${recommended ? ' plan-card--recommended' : ''}\`} id={\`plan-\${plan.code}\`}>
      {plan.popBadge && recommended && <span className="plan-card__popular">{plan.popBadge}</span>}
      {plan.popBadge && !recommended && <span className="plan-card__pop-label">{plan.popBadge}</span>}
      <h3 className="plan-card__name">{plan.name}</h3>
      {plan.badge ? <span className="plan-card__badge">{plan.badge}</span> : null}
      <div>
        <span className="plan-card__price">{priceNum}</span>
        {plan.price.includes('/mois') && <span className="plan-card__period"> /mois</span>}
      </div>
      {plan.highlight ? <p className="plan-card__highlight">{plan.highlight}</p> : null}
      {plan.tagline ? <p className="plan-card__tagline">{plan.tagline}</p> : null}
      <div className="plan-card__divider" />
      <ul className="plan-card__features">
        {plan.features.map((feature) => (
          <li key={feature} className="plan-card__feat">
            <span className="plan-card__feat-check">\u2713</span>
            {feature}
          </li>
        ))}
      </ul>
      <div className="plan-card__cta">
        {isCurrent ? (
          <span className="plan-card__current">\u2713 Plan actif</span>
        ) : canChange ? (
          <button className="plan-card__btn" type="button" onClick={() => onChoose(plan.code)} disabled={loading}>
            {loading ? "Traitement..." : plan.ctaText || "Choisir ce plan"}
          </button>
        ) : (
          <Link className="plan-card__btn" to="/register">{plan.ctaText || "Cr\u00e9er un compte"}</Link>
        )}
        {plan.upgradeHint && !isCurrent && (
          <p className="plan-card__upgrade-hint">{plan.upgradeHint}</p>
        )}
      </div>
    </article>
  );
}`;

content = content.substring(0, startIdx) + newPlanCard + '\r\n\r\n' + content.substring(endIdx);
fs.writeFileSync(file, content, 'utf-8');
console.log('PlanCard replaced successfully');
