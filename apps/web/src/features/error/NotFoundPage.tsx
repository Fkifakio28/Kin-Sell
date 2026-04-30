import { useNavigate } from "react-router-dom";
import { SeoMeta } from "../../components/SeoMeta";
import "./error.css";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="err-page">
      <SeoMeta title="Page introuvable | Kin-Sell" noIndex />
      <h1 className="err-title">404</h1>
      <p className="err-message">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <div className="err-actions">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-btn err-btn"
        >
          ← Retour
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="glass-btn glass-btn--primary err-btn"
        >
          Accueil
        </button>
      </div>
    </div>
  );
}
