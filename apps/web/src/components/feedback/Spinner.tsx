import "./feedback.css";

export type SpinnerSize = "sm" | "md" | "lg";

export function Spinner({ size = "md" }: { size?: SpinnerSize }) {
  return <span className={`ks-spinner ks-spinner--${size}`} aria-label="Chargement" />;
}
