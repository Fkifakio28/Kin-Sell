import "./about.css";

/* ── SVG icon helpers ── */
const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconUsers = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const IconGlobe = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>
);
const IconZap = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const IconHeart = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
);
const IconEye = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconTarget = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);
const IconTrendingUp = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function AboutPage() {
  return (
    <div className="about">
      {/* ══════ 1. HERO ══════ */}
      <section className="about-hero">
        <div className="about-hero-glow" aria-hidden="true" />
        <h1 className="about-hero-title">
          Qui nous <span className="about-accent">sommes</span>
        </h1>
        <p className="about-hero-subtitle">
          Kin-Sell est une plateforme digitale africaine conçue pour permettre à tous
          d'acheter et de vendre des <strong>biens</strong> et des <strong>services</strong> dans
          un environnement plus clair, plus structuré et plus rassurant.
        </p>
        <div className="about-hero-ctas">
          <a href="/explorer" className="glass-button primary btn-lg">Découvrir la plateforme</a>
          <a href="/account" className="glass-button secondary btn-lg">Créer un compte</a>
        </div>
      </section>

      {/* ══════ 2. PRÉSENTATION ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          Kin-Sell, c'est <span className="about-accent">quoi ?</span>
        </h2>
        <div className="about-prose glass-container">
          <p>
            Kin-Sell est bien plus qu'une marketplace. C'est un <strong>écosystème digital</strong> pensé
            pour les réalités africaines, où particuliers et entreprises peuvent publier, rechercher et
            conclure des transactions autour de biens physiques comme de services professionnels.
          </p>
          <p>
            Que vous vendiez un téléphone, proposiez des cours de langues, cherchiez un chauffeur privé
            ou souhaitiez ouvrir votre boutique en ligne — Kin-Sell vous offre un cadre clair, moderne
            et structuré pour le faire.
          </p>
          <p>
            Notre ambition : structurer le commerce digital en Afrique et le rendre
            accessible à tous, avec une approche centrée sur la <strong>simplicité</strong>,
            la <strong>confiance</strong> et la <strong>sécurité</strong>.
          </p>
        </div>
      </section>

      {/* ══════ 3. LE PROBLÈME ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          Le problème que nous <span className="about-accent">résolvons</span>
        </h2>
        <div className="about-problems-grid">
          {[
            "Échanges désorganisés sur les réseaux sociaux, sans suivi ni structure",
            "Manque de confiance entre acheteurs et vendeurs",
            "Informations incomplètes sur les biens et services proposés",
            "Difficulté à comparer, négocier et conclure proprement",
            "Biens et services mal valorisés, noyés dans le bruit digital",
            "Absence de cadre adapté aux réalités locales africaines",
          ].map((problem) => (
            <div key={problem} className="about-problem-card glass-card">
              <span className="about-problem-icon">⚠</span>
              <p>{problem}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ 4. LA SOLUTION ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          La solution <span className="about-accent">Kin-Sell</span>
        </h2>
        <div className="about-solutions-grid">
          {[
            { text: "Une plateforme structurée avec des espaces bien organisés", icon: <IconZap /> },
            { text: "Une expérience plus claire pour vendre et acheter biens et services", icon: <IconEye /> },
            { text: "Un cadre rassurant pensé pour inspirer la confiance", icon: <IconShield /> },
            { text: "Une meilleure visibilité pour vos offres et vos compétences", icon: <IconTrendingUp /> },
            { text: "Une négociation intelligente adaptée au contexte", icon: <IconHeart /> },
            { text: "Une approche conçue pour l'Afrique, par des Africains", icon: <IconGlobe /> },
          ].map((sol) => (
            <div key={sol.text} className="about-solution-card glass-card">
              <div className="about-solution-icon">{sol.icon}</div>
              <p>{sol.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ 5. À QUI S'ADRESSE KIN-SELL ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          À qui s'adresse <span className="about-accent">Kin-Sell ?</span>
        </h2>
        <div className="about-profiles-grid">
          {/* Visiteur */}
          <div className="about-profile-card glass-card">
            <div className="about-profile-badge">
              <IconEye />
            </div>
            <h3>Visiteur</h3>
            <p className="about-profile-desc">
              Vous découvrez la plateforme librement. Explorez les offres, consultez les profils
              et boutiques, comprenez le fonctionnement — sans engagement.
            </p>
            <ul className="about-profile-list">
              <li><IconCheck /> Découvrir les biens et services</li>
              <li><IconCheck /> Explorer les boutiques</li>
              <li><IconCheck /> Consulter les profils vendeurs</li>
              <li><IconCheck /> Comprendre avant de s'inscrire</li>
            </ul>
          </div>

          {/* Utilisateur */}
          <div className="about-profile-card glass-card about-profile--highlight">
            <div className="about-profile-badge">
              <IconUsers />
            </div>
            <h3>Utilisateur</h3>
            <p className="about-profile-desc">
              Inscrit sur Kin-Sell, vous accédez à tout l'écosystème. Achetez, vendez,
              proposez vos services et gérez votre activité dans un espace structuré.
            </p>
            <ul className="about-profile-list">
              <li><IconCheck /> Acheter et vendre des biens</li>
              <li><IconCheck /> Proposer et trouver des services</li>
              <li><IconCheck /> Gérer son profil et ses annonces</li>
              <li><IconCheck /> Interagir dans un cadre sécurisé</li>
            </ul>
          </div>

          {/* Entreprise */}
          <div className="about-profile-card glass-card">
            <div className="about-profile-badge">
              <IconTarget />
            </div>
            <h3>Entreprise</h3>
            <p className="about-profile-desc">
              Présentez votre boutique, publiez vos biens et services, développez votre visibilité
              et bénéficiez d'un espace professionnel crédible.
            </p>
            <ul className="about-profile-list">
              <li><IconCheck /> Créer sa boutique en ligne</li>
              <li><IconCheck /> Publier biens et services</li>
              <li><IconCheck /> Gagner en visibilité</li>
              <li><IconCheck /> Développer son activité</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ══════ 6. VALEURS ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          Nos <span className="about-accent">valeurs</span>
        </h2>
        <div className="about-values-grid">
          {[
            {
              icon: <IconHeart />,
              title: "Accessibilité",
              text: "Un commerce digital ouvert à tous, sans barrière technique ni financière. Chacun mérite un accès simple aux échanges.",
            },
            {
              icon: <IconShield />,
              title: "Confiance",
              text: "Des interactions plus transparentes, des profils vérifiables et un cadre conçu pour rassurer acheteurs et vendeurs.",
            },
            {
              icon: <IconZap />,
              title: "Simplicité",
              text: "Une expérience fluide et intuitive. Publier, rechercher, négocier et conclure — sans friction inutile.",
            },
            {
              icon: <IconEye />,
              title: "Transparence",
              text: "Des informations claires sur chaque offre, chaque profil, chaque interaction. Pas de zones d'ombre.",
            },
            {
              icon: <IconShield />,
              title: "Sécurité",
              text: "Une plateforme pensée avec une logique de protection des échanges et des données personnelles.",
            },
            {
              icon: <IconGlobe />,
              title: "Innovation africaine",
              text: "Des solutions conçues pour les réalités locales, portées par une vision moderne et ambitieuse du continent.",
            },
          ].map((v) => (
            <div key={v.title} className="about-value-card glass-card">
              <div className="about-value-icon">{v.icon}</div>
              <h3>{v.title}</h3>
              <p>{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ 7. MISSION ══════ */}
      <section className="about-section about-mission-section">
        <div className="about-mission-block glass-container">
          <div className="about-mission-icon"><IconTarget /></div>
          <h2 className="about-section-title">
            Notre <span className="about-accent">mission</span>
          </h2>
          <p className="about-mission-text">
            Rendre le commerce digital plus <strong>accessible</strong>, plus <strong>organisé</strong> et
            plus <strong>fiable</strong> en Afrique. Nous voulons que chaque personne — particulier ou
            entreprise — puisse vendre et acheter des biens et des services dans un cadre clair,
            mieux structuré que les échanges informels, et pensé pour valoriser les dynamiques
            locales et entrepreneuriales du continent.
          </p>
        </div>
      </section>

      {/* ══════ 8. VISION ══════ */}
      <section className="about-section about-vision-section">
        <div className="about-vision-block glass-container">
          <div className="about-vision-icon"><IconTrendingUp /></div>
          <h2 className="about-section-title">
            Notre <span className="about-accent">vision</span>
          </h2>
          <p className="about-vision-text">
            Devenir <strong>la référence du commerce digital africain</strong> — un écosystème fiable,
            moderne et évolutif qui connecte visiteurs, utilisateurs, vendeurs, acheteurs, prestataires
            et entreprises. Une vraie alternative pensée pour l'Afrique, où biens et services trouvent
            leur place dans un environnement de confiance.
          </p>
        </div>
      </section>

      {/* ══════ 9. CONFIANCE ══════ */}
      <section className="about-section">
        <h2 className="about-section-title">
          Pourquoi faire <span className="about-accent">confiance</span> à Kin-Sell ?
        </h2>
        <div className="about-trust-grid">
          {[
            "Plateforme conçue avec une logique de sécurité dès le départ",
            "Expérience plus structurée que les échanges dispersés sur les réseaux",
            "Volonté de protéger chaque utilisateur et chaque transaction",
            "Profils et boutiques organisés pour une meilleure lisibilité",
            "Amélioration continue basée sur les retours de la communauté",
            "Approche sérieuse, moderne et responsable du commerce digital",
          ].map((item) => (
            <div key={item} className="about-trust-item glass-card">
              <span className="about-trust-check"><IconCheck /></span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ 10. CTA FINAL ══════ */}
      <section className="about-cta-section">
        <div className="about-cta-block glass-container">
          <h2 className="about-cta-title">
            Prêt à rejoindre <span className="about-accent">Kin-Sell</span> ?
          </h2>
          <p className="about-cta-text">
            Que vous souhaitiez acheter, vendre, proposer un service ou simplement explorer —
            votre place est ici. Rejoignez un écosystème pensé pour vous.
          </p>
          <div className="about-cta-buttons">
            <a href="/explorer" className="glass-button primary btn-lg">Explorer les offres</a>
            <a href="/account" className="glass-button secondary btn-lg">Créer mon compte</a>
          </div>
        </div>
      </section>
    </div>
  );
}
