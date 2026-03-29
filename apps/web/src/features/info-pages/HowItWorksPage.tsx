import { useState } from "react";
import "./how-it-works.css";

/* ── Icons ── */
const IconSearch = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const IconEye = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconMessageCircle = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
);
const IconDollar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
const IconCheck = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const IconUserPlus = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
);
const IconEdit = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);
const IconInbox = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
);
const IconTool = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
);
const IconShield = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconUsers = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconBriefcase = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
);
const IconSmallCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

/* ── Steps data ── */
const STEPS_BUY = [
  { icon: <IconSearch />, title: "Recherchez", desc: "Tapez un mot-clé, filtrez par catégorie, zone ou type d'offre." },
  { icon: <IconEye />, title: "Consultez l'annonce", desc: "Photos, description, prix, localisation — tout est visible." },
  { icon: <IconMessageCircle />, title: "Contactez le vendeur", desc: "Posez vos questions directement au vendeur ou prestataire." },
  { icon: <IconDollar />, title: "Négociez si possible", desc: "Certaines annonces permettent la négociation. Proposez votre prix." },
  { icon: <IconCheck />, title: "Concluez", desc: "Convenez des modalités et finalisez votre achat en toute confiance." },
];

const STEPS_SELL = [
  { icon: <IconUserPlus />, title: "Créez votre compte", desc: "Inscription rapide. Complétez votre profil pour inspirer confiance." },
  { icon: <IconEdit />, title: "Publiez une annonce", desc: "Ajoutez photos, description claire, prix et localisation." },
  { icon: <IconInbox />, title: "Recevez des messages", desc: "Les acheteurs intéressés vous contactent directement." },
  { icon: <IconDollar />, title: "Négociez ou fixez votre prix", desc: "Vous décidez : prix ferme ou ouvert à la négociation." },
  { icon: <IconCheck />, title: "Finalisez la vente", desc: "Convenez des détails et concluez la transaction." },
];

const STEPS_SERVICE = [
  { icon: <IconEdit />, title: "Publiez votre service", desc: "Décrivez votre compétence, votre zone et vos disponibilités." },
  { icon: <IconInbox />, title: "Soyez contacté", desc: "Les clients potentiels vous trouvent et vous écrivent." },
  { icon: <IconMessageCircle />, title: "Discutez du besoin", desc: "Échangez pour bien comprendre la demande du client." },
  { icon: <IconDollar />, title: "Convenez d'un prix", desc: "Proposez un tarif adapté au service et au contexte." },
  { icon: <IconTool />, title: "Réalisez la prestation", desc: "Effectuez le service et construisez votre réputation." },
];

type Tab = "buy" | "sell" | "service";

const TABS: { key: Tab; label: string; color: string }[] = [
  { key: "buy", label: "Acheter", color: "var(--color-primary)" },
  { key: "sell", label: "Vendre", color: "#34d399" },
  { key: "service", label: "Proposer un service", color: "var(--color-secondary)" },
];

const STEPS_MAP: Record<Tab, typeof STEPS_BUY> = {
  buy: STEPS_BUY,
  sell: STEPS_SELL,
  service: STEPS_SERVICE,
};

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function HowItWorksPage() {
  const [activeTab, setActiveTab] = useState<Tab>("buy");
  const steps = STEPS_MAP[activeTab];

  return (
    <div className="hiw">
      {/* ══════ HERO ══════ */}
      <section className="hiw-hero">
        <div className="hiw-hero-glow" aria-hidden="true" />
        <h1 className="hiw-hero-title">
          Comment fonctionne <span className="hiw-accent">Kin-Sell</span> ?
        </h1>
        <p className="hiw-hero-subtitle">
          Acheter, vendre et proposer vos services en toute simplicité.
          Kin-Sell est conçu pour être compris par tous — en quelques étapes.
        </p>
        <div className="hiw-hero-ctas">
          <a href="/account" className="glass-button primary btn-lg">Commencer maintenant</a>
          <a href="/explorer" className="glass-button secondary btn-lg">Explorer</a>
        </div>
      </section>

      {/* ══════ VUE GLOBALE ══════ */}
      <section className="hiw-overview">
        <h2 className="hiw-section-title">
          Tout commence <span className="hiw-accent">ici</span>
        </h2>
        <div className="hiw-overview-grid">
          <div className="hiw-overview-card glass-card">
            <div className="hiw-overview-icon hiw-icon--buy"><IconSearch /></div>
            <h3>Acheter</h3>
            <p>Trouvez le bien ou le service dont vous avez besoin, au meilleur prix.</p>
          </div>
          <div className="hiw-overview-card glass-card">
            <div className="hiw-overview-icon hiw-icon--sell"><IconEdit /></div>
            <h3>Vendre</h3>
            <p>Publiez vos annonces et touchez des acheteurs près de chez vous.</p>
          </div>
          <div className="hiw-overview-card glass-card">
            <div className="hiw-overview-icon hiw-icon--service"><IconTool /></div>
            <h3>Proposer un service</h3>
            <p>Mettez votre savoir-faire en avant et trouvez vos prochains clients.</p>
          </div>
        </div>
      </section>

      {/* ══════ PARCOURS UTILISATEUR (TABS) ══════ */}
      <section className="hiw-journey">
        <h2 className="hiw-section-title">
          Les étapes, <span className="hiw-accent">pas à pas</span>
        </h2>

        {/* Tabs */}
        <div className="hiw-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`hiw-tab glass-button${activeTab === tab.key ? " hiw-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              style={activeTab === tab.key ? { borderColor: tab.color, color: tab.color } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="hiw-steps">
          {steps.map((step, i) => (
            <div key={step.title} className="hiw-step glass-card">
              <div className="hiw-step-number">{i + 1}</div>
              <div className="hiw-step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ NÉGOCIATION ══════ */}
      <section className="hiw-negotiation">
        <div className="hiw-negotiation-block glass-container">
          <div className="hiw-negotiation-icon"><IconDollar /></div>
          <h2 className="hiw-section-title">
            La <span className="hiw-accent">négociation</span> sur Kin-Sell
          </h2>
          <div className="hiw-negotiation-content">
            <p>
              Sur Kin-Sell, certaines annonces permettent la <strong>négociation de prix</strong>.
              C'est une possibilité, pas une obligation — chaque vendeur choisit.
            </p>
            <ul className="hiw-neg-list">
              <li><IconSmallCheck /> Le vendeur indique si la négociation est possible</li>
              <li><IconSmallCheck /> L'acheteur propose un prix, le vendeur accepte ou refuse</li>
              <li><IconSmallCheck /> L'accord final engage les deux parties</li>
              <li><IconSmallCheck /> Kin-Sell ne décide pas à votre place — vous gardez le contrôle</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ══════ SÉCURITÉ & CONFIANCE ══════ */}
      <section className="hiw-security">
        <h2 className="hiw-section-title">
          Un cadre <span className="hiw-accent">rassurant</span>
        </h2>
        <div className="hiw-security-grid">
          {[
            { icon: <IconUsers />, title: "Profils visibles", desc: "Consultez les informations du vendeur avant de vous engager." },
            { icon: <IconShield />, title: "Plateforme structurée", desc: "Vos échanges se font dans un cadre organisé et tracé." },
            { icon: <IconEye />, title: "Informations claires", desc: "Prix, photos, localisation — toutes les infos sont accessibles." },
            { icon: <IconMessageCircle />, title: "Conseils intégrés", desc: "Des guides et bonnes pratiques pour chaque étape." },
          ].map((item) => (
            <div key={item.title} className="hiw-security-card glass-card">
              <div className="hiw-security-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ PARTICULIERS VS ENTREPRISES ══════ */}
      <section className="hiw-comparison">
        <h2 className="hiw-section-title">
          Particuliers <span className="hiw-accent">&</span> Entreprises
        </h2>
        <div className="hiw-comparison-grid">
          <div className="hiw-comparison-card glass-card">
            <div className="hiw-comparison-badge"><IconUsers /></div>
            <h3>Particuliers</h3>
            <ul className="hiw-comparison-list">
              <li><IconSmallCheck /> Inscription simple et gratuite</li>
              <li><IconSmallCheck /> Publiez biens et services librement</li>
              <li><IconSmallCheck /> Négociation possible sur vos annonces</li>
              <li><IconSmallCheck /> Flexibilité totale sur les prix et conditions</li>
            </ul>
          </div>
          <div className="hiw-comparison-card glass-card">
            <div className="hiw-comparison-badge"><IconBriefcase /></div>
            <h3>Entreprises</h3>
            <ul className="hiw-comparison-list">
              <li><IconSmallCheck /> Boutique en ligne professionnelle</li>
              <li><IconSmallCheck /> Catalogue structuré de biens et services</li>
              <li><IconSmallCheck /> Visibilité renforcée sur la plateforme</li>
              <li><IconSmallCheck /> Possibilité de prix fixes ou négociables</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="hiw-cta">
        <div className="hiw-cta-block glass-container">
          <h2 className="hiw-cta-title">
            Prêt à <span className="hiw-accent">commencer</span> ?
          </h2>
          <p className="hiw-cta-text">
            Que vous souhaitiez acheter, vendre ou proposer un service — c'est simple,
            c'est rapide, et c'est fait pour vous.
          </p>
          <div className="hiw-cta-buttons">
            <a href="/account" className="glass-button primary btn-lg">Créer mon compte</a>
            <a href="/explorer" className="glass-button secondary btn-lg">Explorer les offres</a>
          </div>
        </div>
      </section>
    </div>
  );
}
