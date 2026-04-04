import type { ReactNode } from "react";
import "./feedback.css";

export interface EmptyStateProps {
  /** Icône / emoji affichée en grand. */
  icon?: string;
  /** Titre principal. */
  title: string;
  /** Description secondaire. */
  description?: string;
  /** Action (bouton CTA, lien, etc.). */
  action?: ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div className="ks-empty-state">
      <span className="ks-empty-state-icon" aria-hidden="true">{icon}</span>
      <h3 className="ks-empty-state-title">{title}</h3>
      {description && <p className="ks-empty-state-desc">{description}</p>}
      {action && <div className="ks-empty-state-action">{action}</div>}
    </div>
  );
}
