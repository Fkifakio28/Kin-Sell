import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './locked-overlay.css';

type LockedOverlayProps = {
  locked: boolean;
  title?: string;
  message?: string;
  ctaLabel?: string;
  ctaTo?: string;
  blurPx?: number;
  icon?: string;
  children: ReactNode;
};

/**
 * Enveloppe un contenu pour le flouter + afficher un CTA centré quand `locked = true`.
 * Quand `locked = false`, rend simplement `children` sans overhead.
 */
export function LockedOverlay({
  locked,
  title = 'Forfait requis',
  message = 'Activez un forfait pour débloquer cette fonctionnalité.',
  ctaLabel = 'Voir les forfaits',
  ctaTo = '/pricing',
  blurPx = 5,
  icon = '🔒',
  children,
}: LockedOverlayProps) {
  if (!locked) return <>{children}</>;
  return (
    <div className="ks-locked" style={{ ['--ks-locked-blur' as string]: `${blurPx}px` }}>
      <div className="ks-locked__content" aria-hidden="true">
        {children}
      </div>
      <div className="ks-locked__veil" role="region" aria-label={title}>
        <div className="ks-locked__card">
          <span className="ks-locked__icon" aria-hidden="true">{icon}</span>
          <h3 className="ks-locked__title">{title}</h3>
          <p className="ks-locked__message">{message}</p>
          <Link to={ctaTo} className="ks-locked__cta">{ctaLabel}</Link>
        </div>
      </div>
    </div>
  );
}

export default LockedOverlay;
