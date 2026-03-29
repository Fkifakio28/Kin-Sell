import { useState } from "react";
import "./guide.css";

/* ── Icons ── */
const IconPackage = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
);
const IconHome = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
);
const IconUsers = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconTool = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
);
const IconLock = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const IconShield = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconMapPin = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);
const IconAlertTriangle = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);

/* ── Data ── */
const GENERAL_TIPS = [
  { icon: <IconShield />, title: "Vérifiez les profils", text: "Avant toute transaction, consultez le profil du vendeur ou prestataire. Regardez les informations disponibles et les avis." },
  { icon: <IconUsers />, title: "Privilégiez les échanges tracés", text: "Utilisez la messagerie Kin-Sell pour garder une trace de vos échanges. Évitez de basculer immédiatement sur des canaux externes." },
  { icon: <IconAlertTriangle />, title: "Méfiez-vous des offres trop belles", text: "Un prix anormalement bas ou une urgence exagérée sont souvent des signaux d'alerte. Prenez le temps de vérifier." },
  { icon: <IconMapPin />, title: "Choisissez des lieux publics", text: "Pour les remises en main propre, privilégiez toujours un lieu fréquenté et en journée." },
  { icon: <IconLock />, title: "Protégez vos informations", text: "Ne partagez jamais vos mots de passe, codes de vérification ou informations bancaires sensibles avec un autre utilisateur." },
  { icon: <IconTool />, title: "Signalez les abus", text: "Si vous constatez un comportement suspect, une arnaque ou un contenu inapproprié, signalez-le directement depuis la plateforme." },
];

const ADDRESS_SECTIONS = [
  {
    id: "delivery",
    icon: <IconPackage />,
    label: "Livraison",
    title: "Adresse de livraison",
    subtitle: "Où recevez-vous vos achats ?",
    description: "L'adresse de livraison est le lieu où le vendeur vous remet le bien acheté. C'est le point de rencontre pour les remises en main propre ou le lieu de réception d'un colis.",
    recommendation: "Privilégiez toujours une adresse publique et fréquentée pour les remises en main propre. Ne donnez pas votre adresse personnelle à un inconnu.",
    examples: ["Un café ou un restaurant connu", "Une station de taxi ou un arrêt de bus fréquenté", "Un centre commercial ou une galerie marchande", "Un espace public bien éclairé et animé", "Un point relais ou un commerce partenaire"],
    why: "En choisissant un lieu public, vous réduisez les risques liés à la rencontre avec un inconnu. Vous restez dans un environnement visible, sécurisé et neutre.",
    doList: ["Choisir un lieu que vous connaissez bien", "Préférer la journée pour les rencontres", "Informer un proche du lieu et de l'heure", "Vérifier le bien avant de conclure"],
    dontList: ["Donner votre domicile comme point de livraison", "Accepter un lieu isolé ou inconnu", "Vous rendre seul à un rendez-vous tardif"],
  },
  {
    id: "interview",
    icon: <IconUsers />,
    label: "Entretien",
    title: "Adresse d'entretien",
    subtitle: "Rencontrer avant de s'engager",
    description: "L'adresse d'entretien est le lieu où vous rencontrez un prestataire avant une intervention à domicile. C'est une étape de vérification avant de donner accès à votre espace personnel.",
    recommendation: "Toujours rencontrer un prestataire dans un lieu neutre et public avant de l'inviter chez vous. C'est une mesure de prévention essentielle.",
    examples: ["Un café proche de chez vous", "Un espace de coworking ou un hall d'hôtel", "Un restaurant ou une terrasse", "Un lieu public animé dans votre quartier"],
    why: "Cette rencontre préalable vous permet d'évaluer la personne, de poser vos questions, de vérifier son sérieux et de convenir des détails de la prestation — avant de lui donner accès à votre domicile.",
    doList: ["Prendre le temps d'échanger avant toute prestation", "Poser des questions sur l'expérience et les références", "Convenir clairement du prix et des conditions", "Faire confiance à votre instinct"],
    dontList: ["Inviter un inconnu directement chez vous", "Sauter l'étape de l'entretien par précipitation", "Accepter une prestation sans discussion préalable"],
  },
  {
    id: "service",
    icon: <IconTool />,
    label: "Prestation",
    title: "Adresse de prestation",
    subtitle: "Où le service est réalisé",
    description: "L'adresse de prestation est le lieu effectif où le service est exécuté. Elle peut être votre domicile, un lieu professionnel, un chantier ou tout autre endroit convenu entre les parties.",
    recommendation: "Ne communiquez cette adresse qu'après avoir effectué un entretien préalable et validé le prestataire. C'est la dernière étape du processus.",
    examples: ["Votre domicile (après entretien validé)", "Un bureau ou un espace professionnel", "Un chantier ou un lieu de travaux", "Le domicile du client (pour les prestataires)"],
    why: "En réservant cette adresse à l'étape finale — après discussion, validation et entretien — vous vous assurez de n'accueillir que des personnes que vous avez pu évaluer au préalable.",
    doList: ["Communiquer l'adresse seulement après validation", "Confirmer tous les détails par écrit sur Kin-Sell", "Prévoir un créneau précis pour la prestation", "Garder un contact joignable pendant l'intervention"],
    dontList: ["Donner l'adresse dès le premier message", "Accepter un changement de lieu sans discussion", "Laisser un prestataire non vérifié seul chez vous"],
  },
  {
    id: "home",
    icon: <IconLock />,
    label: "Domicile",
    title: "Adresse du domicile",
    subtitle: "Votre adresse privée, protégée",
    description: "Votre adresse personnelle est une information sensible. Sur Kin-Sell, elle n'est jamais affichée publiquement, jamais partagée automatiquement et jamais accessible aux autres utilisateurs.",
    recommendation: "Votre domicile reste privé. Seules les adresses de livraison, d'entretien et de prestation sont utilisées dans le cadre des échanges sur la plateforme.",
    examples: [],
    why: "En séparant clairement votre adresse privée des adresses utilisées pour les échanges, Kin-Sell protège votre vie privée et votre sécurité au quotidien.",
    doList: ["Garder votre domicile privé par défaut", "Utiliser les 3 autres types d'adresses pour vos échanges", "Ne partager votre domicile qu'avec des personnes de confiance"],
    dontList: ["Publier votre adresse personnelle dans une annonce", "Communiquer votre domicile à un inconnu", "Utiliser votre domicile comme adresse de livraison par défaut"],
  },
];

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function GuidePage() {
  const [activeAddr, setActiveAddr] = useState("delivery");
  const current = ADDRESS_SECTIONS.find((s) => s.id === activeAddr)!;

  return (
    <div className="guide">
      {/* ══════ HERO ══════ */}
      <section className="guide-hero">
        <div className="guide-hero-glow" aria-hidden="true" />
        <h1 className="guide-hero-title">
          Conseils <span className="guide-accent">d'utilisation</span>
        </h1>
        <p className="guide-hero-subtitle">
          Des recommandations concrètes pour utiliser Kin-Sell en toute sécurité.
          Protégez-vous, protégez vos échanges.
        </p>
      </section>

      {/* ══════ RÉSUMÉ RAPIDE ══════ */}
      <section className="guide-quick glass-container">
        <h2 className="guide-quick-title">L'essentiel à retenir</h2>
        <div className="guide-quick-grid">
          <div className="guide-quick-item">
            <span className="guide-quick-icon"><IconShield /></span>
            <p><strong>Lieux publics</strong> pour les remises en main propre</p>
          </div>
          <div className="guide-quick-item">
            <span className="guide-quick-icon"><IconUsers /></span>
            <p><strong>Entretien préalable</strong> avant toute prestation à domicile</p>
          </div>
          <div className="guide-quick-item">
            <span className="guide-quick-icon"><IconLock /></span>
            <p><strong>Domicile privé</strong> — jamais affiché, jamais partagé</p>
          </div>
          <div className="guide-quick-item">
            <span className="guide-quick-icon"><IconAlertTriangle /></span>
            <p><strong>Signaler</strong> tout comportement suspect</p>
          </div>
        </div>
      </section>

      {/* ══════ CONSEILS GÉNÉRAUX ══════ */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          Bonnes pratiques <span className="guide-accent">générales</span>
        </h2>
        <div className="guide-tips-grid">
          {GENERAL_TIPS.map((tip) => (
            <div key={tip.title} className="guide-tip-card glass-card">
              <div className="guide-tip-icon">{tip.icon}</div>
              <h3>{tip.title}</h3>
              <p>{tip.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ GESTION DES ADRESSES ══════ */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          Gestion des <span className="guide-accent">adresses</span>
        </h2>
        <p className="guide-section-intro">
          Kin-Sell utilise un système structuré de 4 types d'adresses pour sécuriser vos
          échanges et protéger votre vie privée. Chaque adresse a un rôle précis.
        </p>

        {/* Tabs */}
        <div className="guide-addr-tabs">
          {ADDRESS_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`guide-addr-tab glass-button${activeAddr === s.id ? " guide-addr-tab--active" : ""}`}
              onClick={() => setActiveAddr(s.id)}
            >
              <span className="guide-addr-tab-icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Active address detail */}
        <div className="guide-addr-detail glass-container">
          <div className="guide-addr-header">
            <div className="guide-addr-badge">{current.icon}</div>
            <div>
              <h3>{current.title}</h3>
              <p className="guide-addr-subtitle">{current.subtitle}</p>
            </div>
          </div>

          <p className="guide-addr-desc">{current.description}</p>

          {/* Recommendation callout */}
          <div className="guide-callout guide-callout--info">
            <span className="guide-callout-icon"><IconInfo /></span>
            <p>{current.recommendation}</p>
          </div>

          {/* Examples */}
          {current.examples.length > 0 && (
            <div className="guide-addr-examples">
              <h4>Exemples de lieux recommandés</h4>
              <ul>
                {current.examples.map((ex) => (
                  <li key={ex}><IconCheck /> {ex}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Why */}
          <div className="guide-addr-why">
            <h4>Pourquoi c'est important ?</h4>
            <p>{current.why}</p>
          </div>

          {/* Do / Don't */}
          <div className="guide-addr-dodont">
            <div className="guide-do">
              <h4 className="guide-do-title">À faire</h4>
              <ul>
                {current.doList.map((item) => (
                  <li key={item}><IconCheck /> {item}</li>
                ))}
              </ul>
            </div>
            <div className="guide-dont">
              <h4 className="guide-dont-title">À éviter</h4>
              <ul>
                {current.dontList.map((item) => (
                  <li key={item}><IconX /> {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ FLUX VISUEL ══════ */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          Le parcours <span className="guide-accent">sécurisé</span>
        </h2>
        <p className="guide-section-intro">
          Voici comment les adresses s'enchaînent logiquement sur Kin-Sell, étape par étape.
        </p>
        <div className="guide-flow">
          <div className="guide-flow-step glass-card">
            <div className="guide-flow-num">1</div>
            <div className="guide-flow-icon"><IconPackage /></div>
            <h3>Adresse de livraison</h3>
            <p>Lieu public pour la remise d'un bien acheté</p>
          </div>
          <div className="guide-flow-arrow" aria-hidden="true">→</div>
          <div className="guide-flow-step glass-card">
            <div className="guide-flow-num">2</div>
            <div className="guide-flow-icon"><IconUsers /></div>
            <h3>Adresse d'entretien</h3>
            <p>Lieu neutre pour rencontrer un prestataire</p>
          </div>
          <div className="guide-flow-arrow" aria-hidden="true">→</div>
          <div className="guide-flow-step glass-card">
            <div className="guide-flow-num">3</div>
            <div className="guide-flow-icon"><IconTool /></div>
            <h3>Adresse de prestation</h3>
            <p>Lieu d'exécution du service, après validation</p>
          </div>
          <div className="guide-flow-arrow" aria-hidden="true">→</div>
          <div className="guide-flow-step glass-card guide-flow-step--lock">
            <div className="guide-flow-num">🔒</div>
            <div className="guide-flow-icon"><IconLock /></div>
            <h3>Domicile protégé</h3>
            <p>Privé, jamais partagé automatiquement</p>
          </div>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="guide-cta">
        <div className="guide-cta-block glass-container">
          <h2 className="guide-cta-title">
            Votre sécurité, notre <span className="guide-accent">priorité</span>
          </h2>
          <p className="guide-cta-text">
            Kin-Sell est conçu pour que vos échanges soient plus sûrs, plus structurés
            et plus sereins. Suivez ces conseils et contribuez à un écosystème de confiance.
          </p>
          <div className="guide-cta-buttons">
            <a href="/explorer" className="glass-button primary btn-lg">Explorer Kin-Sell</a>
            <a href="/contact" className="glass-button secondary btn-lg">Signaler un problème</a>
          </div>
        </div>
      </section>
    </div>
  );
}
