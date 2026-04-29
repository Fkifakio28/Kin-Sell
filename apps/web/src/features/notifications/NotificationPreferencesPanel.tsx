/**
 * Préférences granulaires de notifications — par catégorie × canal.
 * À intégrer dans la section "Paramètres" du dashboard.
 */
import { useEffect, useState } from "react";
import { notificationsBd, type NotificationPreferences } from "../../lib/services/notifications-bd";
import "./notification-preferences.css";

const CATEGORIES = [
  { key: "Order", label: "Commandes", icon: "📦", desc: "Confirmation, expédition, livraison" },
  { key: "Negotiation", label: "Marchandages", icon: "💬", desc: "Offre reçue, contre-offre, acceptation" },
  { key: "Payment", label: "Paiements", icon: "💳", desc: "Paiement réussi, échec, remboursement" },
  { key: "Message", label: "Messages", icon: "✉️", desc: "Nouveau message, conversation" },
  { key: "Social", label: "Social", icon: "❤️", desc: "Likes, commentaires, abonnements" },
  { key: "System", label: "Système", icon: "⚙️", desc: "Sécurité, mises à jour Kin-Sell" },
] as const;

const CHANNELS: { key: "Email" | "Push" | "InApp"; label: string }[] = [
  { key: "Email", label: "Email" },
  { key: "Push", label: "Push" },
  { key: "InApp", label: "In-app" },
];

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    notificationsBd
      .getPreferences()
      .then(setPrefs)
      .catch((e) => setError(e?.message ?? "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (field: keyof NotificationPreferences) => {
    if (!prefs) return;
    const next = !prefs[field];
    const previous = prefs[field];
    setPrefs({ ...prefs, [field]: next });
    setSaving(field);
    setError(null);
    try {
      const updated = await notificationsBd.updatePreferences({ [field]: next });
      setPrefs(updated);
      setInfo("Préférences enregistrées ✅");
      setTimeout(() => setInfo(null), 2000);
    } catch (e: any) {
      setPrefs((p) => (p ? { ...p, [field]: previous } : p));
      setError(e?.message ?? "Erreur d'enregistrement");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <section className="ud-glass-panel np-prefs">
        <p style={{ textAlign: "center", padding: 16 }}>⏳ Chargement…</p>
      </section>
    );
  }
  if (!prefs) {
    return (
      <section className="ud-glass-panel np-prefs">
        <p className="np-prefs-error">⚠️ {error ?? "Préférences indisponibles"}</p>
      </section>
    );
  }

  return (
    <section className="ud-glass-panel np-prefs">
      <div className="np-prefs-head">
        <span className="np-prefs-icon">🎚️</span>
        <div>
          <h3 className="np-prefs-title">Préférences de notifications</h3>
          <p className="np-prefs-subtitle">
            Choisissez par catégorie comment vous souhaitez être alerté.
          </p>
        </div>
      </div>

      {info && <div className="np-prefs-info">{info}</div>}
      {error && <div className="np-prefs-error">⚠️ {error}</div>}

      <div className="np-prefs-grid">
        <div className="np-prefs-row np-prefs-row--head">
          <div />
          {CHANNELS.map((c) => (
            <div key={c.key} className="np-prefs-col-head">
              {c.label}
            </div>
          ))}
        </div>
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className="np-prefs-row">
            <div className="np-prefs-cat">
              <span className="np-prefs-cat-icon">{cat.icon}</span>
              <div>
                <strong>{cat.label}</strong>
                <small>{cat.desc}</small>
              </div>
            </div>
            {CHANNELS.map((ch) => {
              const field = `notify${cat.key}${ch.key}` as keyof NotificationPreferences;
              const value = prefs[field];
              return (
                <label key={ch.key} className="np-prefs-toggle">
                  <input
                    type="checkbox"
                    checked={value}
                    disabled={saving === field}
                    onChange={() => void toggle(field)}
                  />
                  <span className="np-prefs-switch" />
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="np-prefs-foot">
        <p className="np-prefs-tip">
          💡 <strong>Astuce</strong> : les notifications transactionnelles critiques (commandes,
          paiements) restent actives par défaut pour ne rien manquer d'important.
        </p>
      </div>
    </section>
  );
}
