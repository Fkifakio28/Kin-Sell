import { useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider";
import "./contact.css";

/* ── SVG icon helpers ── */
const IconHeadphones = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
);
const IconAlertTriangle = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const IconBriefcase = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
);
const IconMessageSquare = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);
const IconMail = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);
const IconClock = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconSend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconInfo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);
const IconGift = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/></svg>
);

/* ── Data ── */
const REQUEST_TYPES = [
  {
    id: "support",
    icon: <IconHeadphones />,
    title: "Support utilisateur",
    description: "Problème de compte, difficulté technique, question sur le fonctionnement de la plateforme.",
    tags: ["Connexion", "Mot de passe", "Bug", "Navigation"],
    color: "var(--color-primary)",
  },
  {
    id: "report",
    icon: <IconAlertTriangle />,
    title: "Signalement",
    description: "Arnaque suspectée, utilisateur suspect, annonce frauduleuse ou contenu inapproprié.",
    tags: ["Arnaque", "Faux profil", "Annonce suspecte", "Abus"],
    color: "#ff6b6b",
  },
  {
    id: "business",
    icon: <IconBriefcase />,
    title: "Entreprises & partenariats",
    description: "Demande de partenariat, publicité, collaboration ou création d'un compte entreprise.",
    tags: ["Partenariat", "Publicité", "Compte pro", "Collaboration"],
    color: "#34d399",
  },
  {
    id: "other",
    icon: <IconMessageSquare />,
    title: "Autre demande",
    description: "Question générale, suggestion d'amélioration ou tout autre sujet.",
    tags: ["Question", "Suggestion", "Feedback", "Autre"],
    color: "var(--color-secondary)",
  },
];

const FORM_REQUEST_OPTIONS = [
  "Support utilisateur",
  "Signalement",
  "Entreprises & partenariats",
  "Autre demande",
];

const FORM_PROBLEM_OPTIONS = [
  "Problème de connexion",
  "Problème de transaction",
  "Signalement d'arnaque",
  "Bug technique",
  "Problème avec une annonce",
  "Autre",
];

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function ContactPage() {
  const { user } = useAuth();
  const paypalDonationUrl = import.meta.env.VITE_PAYPAL_DONATION_URL
    ?? "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=filikifakio%40gmail.com&currency_code=USD";
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    requestType: "",
    problemType: "",
    subject: "",
    message: "",
    userId: "",
    listingUrl: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="contact">
      {/* ══════ 1. HERO ══════ */}
      <section className="contact-hero">
        <div className="contact-hero-glow" aria-hidden="true" />
        <h1 className="contact-hero-title">
          Besoin d'aide ? Nous sommes{" "}
          <span className="contact-accent">là</span>
        </h1>
        <p className="contact-hero-subtitle">
          L'équipe Kin-Sell est disponible pour vous accompagner, répondre à vos questions
          et résoudre vos problèmes. Chaque demande est lue et traitée avec attention.
        </p>
      </section>

      {/* ══════ 2. TYPES DE DEMANDES ══════ */}
      <section className="contact-types">
        <h2 className="contact-section-title">Comment pouvons-nous vous aider ?</h2>
        <p className="contact-section-intro">
          Sélectionnez la catégorie qui correspond le mieux à votre besoin pour une
          réponse plus rapide et plus précise.
        </p>
        <div className="contact-types-grid">
          {REQUEST_TYPES.map((rt) => (
            <div key={rt.id} className="contact-type-card glass-card">
              <div className="contact-type-icon" style={{ color: rt.color }}>
                {rt.icon}
              </div>
              <h3>{rt.title}</h3>
              <p>{rt.description}</p>
              <div className="contact-type-tags">
                {rt.tags.map((t) => (
                  <span key={t} className="contact-tag">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ 3. FORMULAIRE ══════ */}
      <section className="contact-form-section">
        <h2 className="contact-section-title">Envoyez-nous un message</h2>

        {!submitted ? (
          <form className="contact-form glass-container" onSubmit={handleSubmit}>
            {/* Row: Nom + Email */}
            <div className="contact-form-row">
              <div className="contact-field">
                <label htmlFor="contact-name">Nom complet *</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  placeholder="Votre nom"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
              <div className="contact-field">
                <label htmlFor="contact-email">Adresse email *</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  placeholder="votre@email.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Row: Type demande + Type problème */}
            <div className="contact-form-row">
              <div className="contact-field">
                <label htmlFor="contact-request">Type de demande *</label>
                <select
                  id="contact-request"
                  name="requestType"
                  required
                  value={formData.requestType}
                  onChange={handleChange}
                >
                  <option value="" disabled>Choisir une catégorie</option>
                  {FORM_REQUEST_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="contact-field">
                <label htmlFor="contact-problem">Type de problème</label>
                <select
                  id="contact-problem"
                  name="problemType"
                  value={formData.problemType}
                  onChange={handleChange}
                >
                  <option value="" disabled>Précisez (optionnel)</option>
                  {FORM_PROBLEM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sujet */}
            <div className="contact-field">
              <label htmlFor="contact-subject">Sujet *</label>
              <input
                id="contact-subject"
                name="subject"
                type="text"
                required
                placeholder="Résumez votre demande en quelques mots"
                value={formData.subject}
                onChange={handleChange}
              />
            </div>

            {/* Message */}
            <div className="contact-field">
              <label htmlFor="contact-message">Message *</label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={5}
                placeholder="Décrivez votre demande le plus précisément possible…"
                value={formData.message}
                onChange={handleChange}
              />
            </div>

            {/* Optionnels */}
            <div className="contact-form-row">
              <div className="contact-field contact-field--optional">
                <label htmlFor="contact-userid">
                  ID utilisateur <span className="contact-optional">(optionnel)</span>
                </label>
                <input
                  id="contact-userid"
                  name="userId"
                  type="text"
                  placeholder="Votre ID ou nom d'utilisateur"
                  value={formData.userId}
                  onChange={handleChange}
                />
              </div>
              <div className="contact-field contact-field--optional">
                <label htmlFor="contact-listing">
                  Lien de l'annonce <span className="contact-optional">(optionnel)</span>
                </label>
                <input
                  id="contact-listing"
                  name="listingUrl"
                  type="url"
                  placeholder="https://kin-sell.com/annonce/..."
                  value={formData.listingUrl}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button type="submit" className="contact-submit glass-button">
              <IconSend /> Envoyer le message
            </button>
          </form>
        ) : (
          <div className="contact-success glass-container">
            <div className="contact-success-icon"><IconCheck /></div>
            <h3>Message envoyé avec succès !</h3>
            <p>
              Merci pour votre message. L'équipe Kin-Sell reviendra vers vous dans les
              plus brefs délais. Vous recevrez une réponse à l'adresse email indiquée.
            </p>
            <button
              className="glass-button glass-button--outline"
              onClick={() => {
                setSubmitted(false);
                setFormData({
                  name: "",
                  email: "",
                  requestType: "",
                  problemType: "",
                  subject: "",
                  message: "",
                  userId: "",
                  listingUrl: "",
                });
              }}
            >
              Envoyer un autre message
            </button>
          </div>
        )}
      </section>

      {/* ══════ 4. CONTACT DIRECT + TEMPS DE RÉPONSE ══════ */}
      <section className="contact-direct">
        <div className="contact-direct-grid">
          <div className="contact-direct-card glass-card">
            <div className="contact-direct-icon"><IconMail /></div>
            <h3>Contact direct</h3>
            <p>
              Vous préférez nous écrire directement ? Envoyez un email à l'adresse
              ci-dessous.
            </p>
            <span className="contact-email">support@kin-sell.com</span>
          </div>
          <div className="contact-direct-card glass-card">
            <div className="contact-direct-icon"><IconClock /></div>
            <h3>Temps de réponse</h3>
            <p>
              Notre équipe s'engage à traiter chaque demande avec réactivité et soin.
            </p>
            <span className="contact-response-time">24 à 48 heures</span>
            <span className="contact-response-note">(jours ouvrables)</span>
          </div>
          <div className="contact-direct-card glass-card">
            <div className="contact-direct-icon"><IconShield /></div>
            <h3>Signalement urgent</h3>
            <p>
              Arnaque en cours ou danger immédiat ? Utilisez le formulaire avec la catégorie
              « Signalement » — ces demandes sont traitées en priorité.
            </p>
            <span className="contact-urgent-badge">Priorité haute</span>
          </div>
        </div>
      </section>

      {/* ══════ 5. ESPACE DON ══════ */}
      <section className="contact-donation">
        <div className="contact-donation-card glass-container">
          <div className="contact-donation-head">
            <span className="contact-donation-icon"><IconGift /></span>
            <div>
              <h2 className="contact-donation-title">Soutenir Kin-Sell</h2>
              <p className="contact-donation-subtitle">
                Vous pouvez faire un don pour soutenir la plateforme, la sécurité et les améliorations produit.
              </p>
            </div>
          </div>

          <div className="contact-donation-actions">
            <a
              href={paypalDonationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-button"
            >
              Faire un don via PayPal
            </a>

            {isAdmin && (
              <a
                href="/admin/dashboard?section=donations"
                className="glass-button glass-button--outline"
              >
                Ouvrir l'onglet Dons (Super Admin)
              </a>
            )}
          </div>

          <p className="contact-donation-note">
            Transparence: les dons sont consultables et pilotables dans le dashboard admin, section <strong>Dons & Montants</strong>.
          </p>
        </div>
      </section>

      {/* ══════ 6. MESSAGE RASSURANT ══════ */}
      <section className="contact-reassurance glass-container">
        <div className="contact-reassurance-icon"><IconShield /></div>
        <div>
          <h2 className="contact-reassurance-title">Chaque message compte</h2>
          <p className="contact-reassurance-text">
            Chez Kin-Sell, chaque demande est traitée avec attention par une vraie personne
            de notre équipe. Nous ne laissons aucun message sans réponse. Votre satisfaction
            et votre sécurité sont nos priorités absolues.
          </p>
          <div className="contact-reassurance-points">
            <div className="contact-reassurance-point">
              <IconCheck />
              <span>Réponse personnalisée à chaque demande</span>
            </div>
            <div className="contact-reassurance-point">
              <IconCheck />
              <span>Signalements traités en priorité</span>
            </div>
            <div className="contact-reassurance-point">
              <IconCheck />
              <span>Suivi jusqu'à résolution complète</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 7. TIPS AVANT CONTACT ══════ */}
      <section className="contact-tips">
        <h2 className="contact-section-title">Avant de nous contacter</h2>
        <div className="contact-tips-grid">
          <a href="/faq" className="contact-tip-card glass-card">
            <div className="contact-tip-icon"><IconInfo /></div>
            <h3>Consultez la FAQ</h3>
            <p>La réponse à votre question s'y trouve peut-être déjà.</p>
          </a>
          <a href="/guide" className="contact-tip-card glass-card">
            <div className="contact-tip-icon"><IconShield /></div>
            <h3>Conseils d'utilisation</h3>
            <p>Bonnes pratiques pour acheter, vendre et rester en sécurité.</p>
          </a>
          <a href="/how-it-works" className="contact-tip-card glass-card">
            <div className="contact-tip-icon"><IconInfo /></div>
            <h3>Comment ça marche</h3>
            <p>Découvrez le fonctionnement de Kin-Sell étape par étape.</p>
          </a>
        </div>
      </section>

      {/* ══════ 8. CTA FINAL ══════ */}
      <section className="contact-cta">
        <div className="contact-cta-block glass-container">
          <h2 className="contact-cta-title">
            Vous êtes entre de bonnes <span className="contact-accent">mains</span>
          </h2>
          <p className="contact-cta-text">
            Kin-Sell est construit pour les gens. Votre voix fait partie de ce qui nous
            rend meilleurs chaque jour. Continuez à explorer, acheter, vendre et proposer
            vos services en toute confiance.
          </p>
          <div className="contact-cta-buttons">
            <a href="/explorer" className="glass-button">Explorer Kin-Sell</a>
            <a href="/faq" className="glass-button glass-button--outline">Voir la FAQ</a>
          </div>
        </div>
      </section>
    </div>
  );
}
