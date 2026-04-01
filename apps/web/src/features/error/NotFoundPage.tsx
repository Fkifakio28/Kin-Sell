import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "4rem", margin: 0, color: "var(--color-primary, #6f58ff)" }}>404</h1>
      <p style={{ fontSize: "1.25rem", color: "var(--color-text-secondary, #b0a8d0)", marginTop: "0.5rem" }}>
        Cette page n'existe pas ou a été déplacée.
      </p>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="glass-btn"
          style={{ padding: "0.6rem 1.5rem", cursor: "pointer" }}
        >
          ← Retour
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="glass-btn glass-btn--primary"
          style={{ padding: "0.6rem 1.5rem", cursor: "pointer" }}
        >
          Accueil
        </button>
      </div>
    </div>
  );
}
