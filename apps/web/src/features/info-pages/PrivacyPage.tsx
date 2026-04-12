import "./privacy.css";

/* ── SVG icon helpers ── */
const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconUser = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconDatabase = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
);
const IconBarChart = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
);
const IconLock = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const IconSliders = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
);
const IconEye = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconMail = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);
const IconXOctagon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
);
const IconRefresh = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconX = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconInfo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);
const IconCookie = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/><circle cx="10" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="13" r="1" fill="currentColor"/><circle cx="13" cy="17" r="1" fill="currentColor"/></svg>
);

/* ── Data ── */
const COLLECTED_DATA = [
  {
    icon: <IconUser />,
    title: "Informations de compte",
    items: ["Nom et prénom", "Adresse email", "Numéro de téléphone", "Photo de profil (optionnelle)", "Nom de l'entreprise (pour comptes business)", "Date de naissance (optionnelle)"],
  },
  {
    icon: <IconEye />,
    title: "Activité sur la plateforme",
    items: ["Annonces créées et consultées", "Vues de posts et stories", "Catégories visitées", "Biens et services favoris", "Impressions et clics publicitaires internes"],
  },
  {
    icon: <IconMail />,
    title: "Interactions",
    items: ["Messages texte, audio, photo et vidéo", "Négociations et accords", "Avis et signalements", "Commentaires sur les publications"],
  },
  {
    icon: <IconDatabase />,
    title: "Données techniques",
    items: ["Type d'appareil et navigateur (User-Agent)", "Identifiant de session et d'appareil", "Adresse IP (pour la sécurité anti-fraude)", "Tokens de notifications push (Firebase)"],
  },
  {
    icon: <IconShield />,
    title: "Localisation",
    items: ["Position GPS précise (latitude/longitude)", "Ville, pays et région", "Adresse physique (pour livraison et boutiques)"],
  },
  {
    icon: <IconLock />,
    title: "Données financières",
    items: ["Historique d'abonnements et de paiements", "Référence Mobile Money (Orange Money, M-Pesa)", "Achats via Apple In-App Purchase ou PayPal", "Coordonnées bancaires pour virements (IBAN/BIC)"],
  },
  {
    icon: <IconBarChart />,
    title: "Photos, vidéos et audio",
    items: ["Photos d'annonces et de profil", "Vidéos de présentation", "Messages vocaux et audio", "Contenu de stories et publications SoKin"],
  },
  {
    icon: <IconSliders />,
    title: "Contacts importés",
    items: ["Nom et téléphone de vos contacts (optionnel)", "Sources : téléphone, Facebook, Google, saisie manuelle", "Utilisés uniquement pour les suggestions de connexion"],
  },
];

const DATA_USES = [
  { icon: <IconSliders />, title: "Améliorer la plateforme", text: "Comprendre comment les utilisateurs naviguent pour rendre l'expérience plus fluide, intuitive et adaptée aux besoins réels." },
  { icon: <IconShield />, title: "Assurer la sécurité", text: "Détecter les comportements suspects, prévenir la fraude et protéger tous les membres de la communauté Kin-Sell." },
  { icon: <IconUser />, title: "Personnaliser l'expérience", text: "Vous proposer du contenu pertinent : annonces recommandées, services proches de vous, biens susceptibles de vous intéresser." },
  { icon: <IconBarChart />, title: "Affiner les recommandations", text: "Mieux comprendre les tendances pour suggérer des biens et services au bon moment, au bon endroit." },
];

const NOT_DONE = [
  "Kin-Sell ne vend jamais vos données personnelles à des tiers.",
  "Kin-Sell ne partage pas vos informations sensibles (adresse, téléphone) avec d'autres utilisateurs sans votre accord.",
  "Kin-Sell ne donne accès à aucune donnée privée à des entreprises externes à des fins commerciales.",
  "Kin-Sell ne monétise pas vos conversations ou échanges privés.",
];

const SECURITY_MEASURES = [
  { title: "Chiffrement des données", text: "Vos informations sensibles sont protégées par un chiffrement moderne lors du stockage et de la transmission." },
  { title: "Accès restreint", text: "Seuls les membres autorisés de l'équipe technique accèdent aux données, et uniquement lorsque nécessaire." },
  { title: "Surveillance continue", text: "Des systèmes de détection surveillent les activités anormales et alertent notre équipe en temps réel." },
  { title: "Sauvegardes sécurisées", text: "Les données sont sauvegardées régulièrement dans des environnements protégés pour éviter toute perte." },
];

const USER_RIGHTS = [
  { icon: <IconEye />, title: "Accès", text: "Vous pouvez demander à tout moment une copie des données personnelles que Kin-Sell détient sur vous." },
  { icon: <IconSliders />, title: "Modification", text: "Vous pouvez corriger ou mettre à jour vos informations de profil directement depuis votre espace personnel." },
  { icon: <IconX />, title: "Suppression", text: "Vous pouvez demander la suppression de votre compte et de vos données. Ce processus est irréversible." },
  { icon: <IconLock />, title: "Contrôle", text: "Vous choisissez quelles informations sont visibles et à qui. Vous restez maître de votre profil." },
];

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function PrivacyPage() {
  return (
    <div className="privacy">
      {/* ══════ 1. HERO ══════ */}
      <section className="privacy-hero">
        <div className="privacy-hero-glow" aria-hidden="true" />
        <h1 className="privacy-hero-title">
          Protection et traitement des{" "}
          <span className="privacy-accent">données</span>
        </h1>
        <p className="privacy-hero-subtitle">
          Chez Kin-Sell, vos données sont un dépôt de confiance. Nous les protégeons avec
          le même sérieux que vous accordez à votre sécurité.
        </p>
        <p className="privacy-meta">Dernière mise à jour : 13 avril 2026</p>
      </section>

      {/* ══════ RÉSUMÉ RAPIDE ══════ */}
      <section className="privacy-summary glass-container">
        <h2 className="privacy-summary-title">En quelques mots</h2>
        <p className="privacy-summary-intro">
          Avant d'entrer dans le détail, voici ce qu'il faut retenir :
        </p>
        <ul className="privacy-summary-list">
          <li><IconCheck /> Vos données personnelles ne sont jamais vendues</li>
          <li><IconCheck /> L'analyse de données est uniquement basée sur des données anonymisées et agrégées</li>
          <li><IconCheck /> Vous gardez le contrôle total sur vos informations</li>
          <li><IconCheck /> La sécurité de vos données est une priorité technique et humaine</li>
          <li><IconCheck /> Vous pouvez demander l'accès, la modification ou la suppression à tout moment</li>
        </ul>
      </section>

      {/* ══════ 2. INTRODUCTION ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">1</div>
        <div className="privacy-block-content glass-container">
          <h2>Introduction</h2>
          <p>
            La confidentialité est au cœur de tout ce que nous construisons. Kin-Sell est née de
            la conviction qu'une plateforme d'achat, de vente de <strong>biens</strong> et de{" "}
            <strong>services</strong> peut être à la fois performante et respectueuse de ses utilisateurs.
          </p>
          <p>
            Ce document explique, en termes simples, quelles données nous collectons, pourquoi
            nous les utilisons et comment nous les protégeons. Pas de jargon juridique inutile —
            juste de la transparence.
          </p>
          <p>
            Que vous soyez <strong>visiteur</strong>, <strong>utilisateur enregistré</strong> ou{" "}
            <strong>entreprise</strong>, notre engagement reste le même : vos données vous
            appartiennent. Kin-Sell n'est qu'un gardien temporaire, jamais un propriétaire.
          </p>
        </div>
      </section>

      {/* ══════ 3. DONNÉES COLLECTÉES ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">2</div>
        <div className="privacy-block-content glass-container">
          <h2>Données collectées</h2>
          <p>
            Pour vous offrir une expérience fiable et sécurisée, Kin-Sell collecte certaines
            informations. Voici un aperçu clair de ce que nous recueillons :
          </p>
          <div className="privacy-collected-grid">
            {COLLECTED_DATA.map((cat) => (
              <div key={cat.title} className="privacy-collected-card glass-card">
                <div className="privacy-collected-icon">{cat.icon}</div>
                <h3>{cat.title}</h3>
                <ul>
                  {cat.items.map((item) => (
                    <li key={item}>
                      <IconCheck /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="privacy-callout privacy-callout--info">
            <span className="privacy-callout-icon"><IconInfo /></span>
            <p>
              <strong>Important :</strong> nous ne collectons que les données strictement
              nécessaires au bon fonctionnement de la plateforme. Rien de plus.
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 4. UTILISATION DES DONNÉES ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">3</div>
        <div className="privacy-block-content glass-container">
          <h2>Utilisation des données</h2>
          <p>
            Chaque donnée collectée a un objectif clair. Nous n'utilisons vos informations que
            pour améliorer votre expérience et la sécurité de la plateforme.
          </p>
          <div className="privacy-uses-grid">
            {DATA_USES.map((use) => (
              <div key={use.title} className="privacy-use-card glass-card">
                <div className="privacy-use-icon">{use.icon}</div>
                <h3>{use.title}</h3>
                <p>{use.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ 5. DONNÉES ANALYTIQUES ══════ */}
      <section className="privacy-block privacy-block--highlight">
        <div className="privacy-block-number privacy-block-number--special">4</div>
        <div className="privacy-block-content glass-container privacy-analytics">
          <div className="privacy-analytics-header">
            <IconBarChart />
            <h2>Données analytiques</h2>
          </div>
          <p className="privacy-analytics-intro">
            Kin-Sell analyse des données <strong>globales</strong> pour comprendre les tendances
            du marché, améliorer les services et proposer des insights pertinents à la communauté.
          </p>

          <div className="privacy-analytics-highlight glass-card">
            <h3>Ce que cela signifie concrètement</h3>
            <p>
              Grâce aux données agrégées, nous pouvons par exemple identifier que la demande pour
              un certain type de <strong>bien</strong> ou de <strong>service</strong> augmente dans
              une zone donnée, ou qu'un nouveau besoin émerge sur le marché. Ces informations
              permettent d'améliorer les recommandations et d'enrichir l'expérience de chacun.
            </p>
          </div>

          <div className="privacy-analytics-guarantees">
            <h3>Nos garanties</h3>
            <div className="privacy-guarantees-grid">
              <div className="privacy-guarantee-item privacy-guarantee-item--yes">
                <IconCheck />
                <div>
                  <strong>Données anonymisées</strong>
                  <p>Aucune information ne peut être liée à un individu spécifique.</p>
                </div>
              </div>
              <div className="privacy-guarantee-item privacy-guarantee-item--yes">
                <IconCheck />
                <div>
                  <strong>Données agrégées</strong>
                  <p>Les analyses portent sur des ensembles statistiques, pas sur des profils individuels.</p>
                </div>
              </div>
              <div className="privacy-guarantee-item privacy-guarantee-item--yes">
                <IconCheck />
                <div>
                  <strong>Aucune identification individuelle</strong>
                  <p>Même en interne, les résultats d'analyse ne permettent pas de remonter à un utilisateur.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="privacy-callout privacy-callout--info">
            <span className="privacy-callout-icon"><IconInfo /></span>
            <p>
              <strong>En résumé :</strong> nous analysons des chiffres et des tendances, pas des
              personnes. Votre identité est toujours protégée.
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 6. CE QUE KIN-SELL NE FAIT PAS ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">5</div>
        <div className="privacy-block-content glass-container">
          <div className="privacy-not-header">
            <IconXOctagon />
            <h2>Ce que Kin-Sell ne fait pas</h2>
          </div>
          <p>
            La transparence, c'est aussi dire clairement ce que nous ne faisons <strong>jamais</strong> :
          </p>
          <ul className="privacy-not-list">
            {NOT_DONE.map((item) => (
              <li key={item}>
                <span className="privacy-not-icon"><IconX /></span>
                {item}
              </li>
            ))}
          </ul>
          <div className="privacy-callout privacy-callout--warn">
            <span className="privacy-callout-icon"><IconShield /></span>
            <p>
              <strong>Engagement formel :</strong> Kin-Sell s'engage contractuellement à ne jamais
              vendre, louer ou échanger vos données personnelles. C'est un principe fondateur, pas
              une option.
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 7. SÉCURITÉ ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">6</div>
        <div className="privacy-block-content glass-container">
          <h2>Sécurité</h2>
          <p>
            Protéger vos données, c'est protéger votre confiance. Voici les mesures que nous
            mettons en œuvre au quotidien :
          </p>
          <div className="privacy-security-grid">
            {SECURITY_MEASURES.map((m) => (
              <div key={m.title} className="privacy-security-card glass-card">
                <IconLock />
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ 8. DROITS DES UTILISATEURS ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">7</div>
        <div className="privacy-block-content glass-container">
          <h2>Vos droits</h2>
          <p>
            Vos données, vos règles. En tant que membre de Kin-Sell, vous disposez de droits
            clairs sur vos informations personnelles.
          </p>
          <div className="privacy-rights-grid">
            {USER_RIGHTS.map((r) => (
              <div key={r.title} className="privacy-right-card glass-card">
                <div className="privacy-right-icon">{r.icon}</div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          <div className="privacy-callout privacy-callout--info">
            <span className="privacy-callout-icon"><IconInfo /></span>
            <p>
              Pour exercer l'un de ces droits, contactez-nous à{" "}
              <strong>support@kin-sell.com</strong>. Nous répondons dans les plus brefs délais.
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 9. SERVICES TIERS ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">8</div>
        <div className="privacy-block-content glass-container">
          <h2>Services tiers</h2>
          <p>
            Pour assurer un fonctionnement fiable et sécurisé, Kin-Sell fait appel à des
            services tiers strictement encadrés. <strong>Aucun de ces services ne reçoit
            vos données à des fins publicitaires ou de suivi inter-applications.</strong>
          </p>
          <div className="privacy-security-grid">
            <div className="privacy-security-card glass-card">
              <IconShield />
              <h3>Firebase (Google)</h3>
              <p>Envoi de notifications push via Firebase Cloud Messaging. Seul le token d'appareil est partagé.</p>
            </div>
            <div className="privacy-security-card glass-card">
              <IconLock />
              <h3>Google / Apple Sign In</h3>
              <p>Connexion OAuth. Seuls le nom, l'email et l'identifiant du fournisseur sont reçus, à votre initiative.</p>
            </div>
            <div className="privacy-security-card glass-card">
              <IconShield />
              <h3>PayPal / Apple In-App Purchase</h3>
              <p>Traitement des paiements. Kin-Sell ne stocke ni vos numéros de carte ni vos identifiants bancaires PayPal.</p>
            </div>
            <div className="privacy-security-card glass-card">
              <IconLock />
              <h3>Cloudflare Turnstile</h3>
              <p>Protection anti-bot. Un jeton de vérification est échangé, sans cookies de suivi.</p>
            </div>
            <div className="privacy-security-card glass-card">
              <IconShield />
              <h3>OpenStreetMap</h3>
              <p>Géocodage et recherche d'adresses. Les requêtes ne contiennent pas de données personnelles identifiables.</p>
            </div>
          </div>
          <div className="privacy-callout privacy-callout--info">
            <span className="privacy-callout-icon"><IconInfo /></span>
            <p>
              <strong>Aucun suivi inter-applications :</strong> Kin-Sell ne partage aucune
              donnée avec des réseaux publicitaires tiers et n'utilise aucun SDK de tracking
              (pas de Google Analytics, Mixpanel, Facebook Pixel, etc.).
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 10. COOKIES ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">9</div>
        <div className="privacy-block-content glass-container">
          <div className="privacy-cookie-header">
            <IconCookie />
            <h2>Cookies</h2>
          </div>
          <p>
            Kin-Sell utilise des <strong>cookies</strong> — de petits fichiers stockés sur votre
            appareil — pour améliorer votre expérience sur la plateforme.
          </p>
          <div className="privacy-cookie-types">
            <div className="privacy-cookie-type glass-card">
              <h3>Cookies essentiels</h3>
              <p>
                Nécessaires au bon fonctionnement de la plateforme : connexion, sécurité,
                préférences de session. Ils ne peuvent pas être désactivés.
              </p>
            </div>
            <div className="privacy-cookie-type glass-card">
              <h3>Cookies d'analyse</h3>
              <p>
                Nous aident à comprendre comment vous utilisez Kin-Sell (pages visitées, durée,
                parcours). Ces données sont anonymisées et servent uniquement à améliorer la
                plateforme.
              </p>
            </div>
          </div>
          <p className="privacy-cookie-note">
            Vous pouvez gérer vos préférences de cookies depuis les paramètres de votre navigateur
            à tout moment.
          </p>
        </div>
      </section>

      {/* ══════ 11. MODIFICATIONS ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">10</div>
        <div className="privacy-block-content glass-container">
          <div className="privacy-update-header">
            <IconRefresh />
            <h2>Modifications de cette politique</h2>
          </div>
          <p>
            Cette politique peut être mise à jour pour refléter l'évolution de nos pratiques, de
            nos services ou du cadre réglementaire. En cas de modification importante, nous vous
            informerons via la plateforme et/ou par email.
          </p>
          <p>
            La date de "dernière mise à jour" en haut de cette page vous permet de vérifier
            quand cette politique a été modifiée pour la dernière fois.
          </p>
        </div>
      </section>

      {/* ══════ 12. CONTACT ══════ */}
      <section className="privacy-block">
        <div className="privacy-block-number">11</div>
        <div className="privacy-block-content glass-container">
          <div className="privacy-contact-header">
            <IconMail />
            <h2>Nous contacter</h2>
          </div>
          <p>
            Une question sur vos données ? Un doute ? Une demande ? Notre équipe est là pour
            vous répondre clairement et rapidement.
          </p>
          <div className="privacy-contact-box glass-card">
            <div className="privacy-contact-item">
              <strong>Email :</strong>
              <span>support@kin-sell.com</span>
            </div>
            <div className="privacy-contact-item">
              <strong>Objet suggéré :</strong>
              <span>Protection des données — [votre demande]</span>
            </div>
            <div className="privacy-contact-item">
              <strong>Délai de réponse :</strong>
              <span>48 heures maximum (jours ouvrables)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="privacy-cta">
        <div className="privacy-cta-block glass-container">
          <h2 className="privacy-cta-title">
            Votre confiance, notre <span className="privacy-accent">responsabilité</span>
          </h2>
          <p className="privacy-cta-text">
            Kin-Sell est construite pour les gens — pas contre eux. Votre sécurité digitale
            fait partie de notre ADN. Explorez, achetez, vendez et proposez vos services
            en toute sérénité.
          </p>
          <div className="privacy-cta-buttons">
            <a href="/explorer" className="glass-button">Explorer Kin-Sell</a>
            <a href="/about" className="glass-button glass-button--outline">Qui nous sommes</a>
          </div>
        </div>
      </section>
    </div>
  );
}
