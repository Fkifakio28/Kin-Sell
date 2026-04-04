import { Spinner } from "./Spinner";
import "./feedback.css";

export interface LoaderProps {
  /** Texte sous le spinner. */
  text?: string;
}

export function Loader({ text = "Chargement…" }: LoaderProps) {
  return (
    <div className="ks-loader" role="status">
      <Spinner size="lg" />
      {text && <span>{text}</span>}
    </div>
  );
}
