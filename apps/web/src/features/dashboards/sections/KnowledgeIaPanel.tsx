/**
 * Knowledge IA — Panneau dashboard
 * Détecte les besoins utilisateur et fournit des conseils (où vendre / trouver main-d'œuvre)
 * Gating : abonnement Kin-Sell Analytique requis (PRO_VENDOR, BUSINESS, SCALE)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  knowledgeAi,
  KNOWLEDGE_GOAL_LABELS,
  KNOWLEDGE_COUNTRY_LABELS,
  KNOWLEDGE_COUNTRIES,
  type KnowledgeGoal,
  type KnowledgeCountry,
  type KnowledgeIntent,
  type KnowledgeRecommendation,
} from "../../../lib/services/knowledge-ai.service";

interface Props {
  hasAnalytics: boolean;
}

const EMPTY_INTENT: Omit<KnowledgeIntent, "id" | "userId" | "createdAt" | "updatedAt"> = {
  goals: [],
  categories: [],
  keywords: [],
  countriesInterest: [],
  notes: null,
};

export function KnowledgeIaPanel({ hasAnalytics }: Props) {
  const [intent, setIntent] = useState<typeof EMPTY_INTENT>(EMPTY_INTENT);
  const [loadedIntent, setLoadedIntent] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [categoriesInput, setCategoriesInput] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");

  const [recommendations, setRecommendations] = useState<KnowledgeRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // ── Load intent
  useEffect(() => {
    let cancelled = false;
    knowledgeAi
      .getIntent()
      .then(({ intent: dto }) => {
        if (cancelled) return;
        if (dto) {
          setIntent({
            goals: dto.goals,
            categories: dto.categories,
            keywords: dto.keywords,
            countriesInterest: dto.countriesInterest,
            notes: dto.notes,
          });
          setCategoriesInput(dto.categories.join(", "));
          setKeywordsInput(dto.keywords.join(", "));
        }
        setLoadedIntent(true);
      })
      .catch(() => setLoadedIntent(true));
    return () => { cancelled = true; };
  }, []);

  // ── Load recommendations (gated)
  const refreshRecommendations = useCallback(async () => {
    if (!hasAnalytics) return;
    setLoadingRecs(true);
    try {
      const { recommendations: recs } = await knowledgeAi.getRecommendations();
      setRecommendations(recs);
    } catch {
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  }, [hasAnalytics]);

  useEffect(() => {
    if (hasAnalytics && loadedIntent) {
      void refreshRecommendations();
    }
  }, [hasAnalytics, loadedIntent, refreshRecommendations]);

  // ── Toggles
  const toggleGoal = (g: KnowledgeGoal) => {
    setIntent((prev) => ({
      ...prev,
      goals: prev.goals.includes(g) ? prev.goals.filter((x) => x !== g) : [...prev.goals, g],
    }));
  };

  const toggleCountry = (c: KnowledgeCountry) => {
    setIntent((prev) => ({
      ...prev,
      countriesInterest: prev.countriesInterest.includes(c)
        ? prev.countriesInterest.filter((x) => x !== c)
        : [...prev.countriesInterest, c],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const categories = categoriesInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
      const keywords = keywordsInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      const payload = {
        goals: intent.goals,
        categories,
        keywords,
        countriesInterest: intent.countriesInterest,
        notes: intent.notes && intent.notes.trim() ? intent.notes.trim() : null,
      };
      const { intent: saved } = await knowledgeAi.saveIntent(payload);
      setIntent({
        goals: saved.goals,
        categories: saved.categories,
        keywords: saved.keywords,
        countriesInterest: saved.countriesInterest,
        notes: saved.notes,
      });
      setCategoriesInput(saved.categories.join(", "));
      setKeywordsInput(saved.keywords.join(", "));
      setSaveMsg("✅ Préférences enregistrées");
      if (hasAnalytics) void refreshRecommendations();
    } catch (err: any) {
      setSaveMsg(`⚠️ Erreur : ${err?.message ?? "impossible d'enregistrer"}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3500);
    }
  };

  const isComplete = useMemo(
    () => intent.goals.length > 0 && intent.countriesInterest.length > 0,
    [intent],
  );

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Section Settings : Qu'est-ce que vous recherchez sur Kin-Sell ? ── */}
      <div
        style={{
          background: "rgba(111,88,255,0.06)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          border: "1px solid rgba(111,88,255,0.15)",
        }}
      >
        <h3 style={{ margin: "0 0 6px", fontSize: 15, color: "var(--color-text-primary, #fff)" }}>
          🔎 Qu'est-ce que vous recherchez sur Kin-Sell ?
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--color-text-secondary, #aaa)" }}>
          Décrivez vos objectifs pour que Knowledge IA puisse vous conseiller : où vendre,
          où trouver de la main-d'œuvre, quelles tendances suivre dans les 8 marchés Kin-Sell.
        </p>

        {/* Goals */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--color-text-primary, #fff)" }}>
          🎯 Vos objectifs
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 14 }}>
          {(Object.keys(KNOWLEDGE_GOAL_LABELS) as KnowledgeGoal[]).map((g) => {
            const meta = KNOWLEDGE_GOAL_LABELS[g];
            const active = intent.goals.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGoal(g)}
                style={{
                  textAlign: "left",
                  background: active ? "rgba(111,88,255,0.18)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? "rgba(111,88,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: "var(--color-text-primary, #fff)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {meta.icon} {meta.label} {active ? " ✓" : ""}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary, #aaa)", marginTop: 2 }}>{meta.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Categories */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary, #fff)" }}>
          📂 Catégories / secteurs
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary, #aaa)", marginLeft: 6 }}>
            (séparées par des virgules)
          </span>
        </label>
        <input
          type="text"
          value={categoriesInput}
          onChange={(e) => setCategoriesInput(e.target.value)}
          placeholder="Ex : vêtements, cosmétique, électronique"
          style={{
            width: "100%", padding: "8px 10px", marginBottom: 12,
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "var(--color-text-primary, #fff)", fontSize: 13,
          }}
        />

        {/* Keywords */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary, #fff)" }}>
          🔑 Mots-clés
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary, #aaa)", marginLeft: 6 }}>
            (séparés par des virgules)
          </span>
        </label>
        <input
          type="text"
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="Ex : bio, artisanat, smartphone"
          style={{
            width: "100%", padding: "8px 10px", marginBottom: 12,
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "var(--color-text-primary, #fff)", fontSize: 13,
          }}
        />

        {/* Countries */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--color-text-primary, #fff)" }}>
          🌍 Pays d'intérêt
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {KNOWLEDGE_COUNTRIES.map((c) => {
            const active = intent.countriesInterest.includes(c);
            const meta = KNOWLEDGE_COUNTRY_LABELS[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCountry(c)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: active ? "rgba(111,88,255,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? "rgba(111,88,255,0.45)" : "rgba(255,255,255,0.08)"}`,
                  color: "var(--color-text-primary, #fff)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {meta.flag} {meta.name}{active ? " ✓" : ""}
              </button>
            );
          })}
        </div>

        {/* Notes */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary, #fff)" }}>
          📝 Notes libres (facultatif)
        </label>
        <textarea
          value={intent.notes ?? ""}
          onChange={(e) => setIntent((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Précisez votre contexte, votre budget, votre zone..."
          rows={2}
          maxLength={500}
          style={{
            width: "100%", padding: "8px 10px", marginBottom: 12,
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, color: "var(--color-text-primary, #fff)", fontSize: 13, resize: "vertical",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: saving ? "rgba(111,88,255,0.4)" : "linear-gradient(135deg, #6f58ff, #9b7aff)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Enregistrement…" : "💾 Enregistrer mes préférences"}
          </button>
          {saveMsg && (
            <span style={{ fontSize: 12, color: saveMsg.startsWith("✅") ? "#4caf50" : "#ff9800" }}>{saveMsg}</span>
          )}
        </div>
      </div>

      {/* ── Section recommandations (gated) ── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(111,88,255,0.08), rgba(155,122,255,0.04))",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(111,88,255,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "var(--color-text-primary, #fff)" }}>
            🧠 Knowledge IA — Conseils personnalisés
          </h3>
          {hasAnalytics && (
            <button
              type="button"
              onClick={() => void refreshRecommendations()}
              disabled={loadingRecs}
              style={{
                padding: "6px 10px", fontSize: 11, border: "1px solid rgba(111,88,255,0.3)",
                borderRadius: 6, background: "transparent", color: "#9b7aff", cursor: "pointer",
              }}
            >
              {loadingRecs ? "⏳ Analyse…" : "🔄 Actualiser"}
            </button>
          )}
        </div>

        {!hasAnalytics ? (
          <div style={{ padding: "14px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-text-secondary, #aaa)", lineHeight: 1.5 }}>
              🔒 Knowledge IA s'appuie sur <strong>Kin-Sell Analytique</strong> pour analyser la demande et
              la main-d'œuvre dans les 8 marchés Kin-Sell et vous fournir des conseils stratégiques.
            </p>
            <Link
              to="/pricing"
              style={{
                display: "inline-block", padding: "8px 16px", borderRadius: 8,
                background: "linear-gradient(135deg, #6f58ff, #9b7aff)", color: "#fff",
                fontWeight: 600, fontSize: 13, textDecoration: "none",
              }}
            >
              🚀 Débloquer avec Kin-Sell Analytique
            </Link>
          </div>
        ) : !isComplete ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary, #aaa)" }}>
            ℹ️ Sélectionnez au moins un <strong>objectif</strong> et un <strong>pays d'intérêt</strong> ci-dessus,
            puis enregistrez pour recevoir vos conseils.
          </p>
        ) : loadingRecs ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary, #aaa)" }}>Analyse en cours…</p>
        ) : recommendations.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary, #aaa)" }}>
            Aucune donnée suffisante dans vos catégories pour générer un conseil. Essayez d'élargir vos catégories
            ou vos pays d'intérêt.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, color: "var(--color-text-primary, #fff)" }}>{rec.title}</strong>
                  <span
                    style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: rec.kind === "DEMAND" ? "rgba(76,175,80,0.15)" : "rgba(255,165,0,0.15)",
                      color: rec.kind === "DEMAND" ? "#4caf50" : "#ffa500",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rec.kind === "DEMAND" ? "📈 Demande" : "👥 Main-d'œuvre"}
                  </span>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary, #aaa)", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                  {rec.message}
                </p>
                {rec.topZones.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {rec.topZones.map((z, i) => {
                      const meta = KNOWLEDGE_COUNTRY_LABELS[z.countryCode];
                      return (
                        <span
                          key={`${rec.id}-${i}`}
                          style={{
                            fontSize: 11,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "rgba(111,88,255,0.12)",
                            border: "1px solid rgba(111,88,255,0.25)",
                            color: "var(--color-text-primary, #fff)",
                          }}
                        >
                          {meta?.flag ?? "🌍"} {meta?.name ?? z.countryCode}
                          {z.city ? ` · ${z.city}` : ""}
                          <span style={{ color: "#9b7aff", fontWeight: 600, marginLeft: 4 }}>
                            · {Math.round(z.score)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default KnowledgeIaPanel;
