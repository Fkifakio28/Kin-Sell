import "./terms.css";

/* ── Icons ── */
const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function TermsPage() {
  return (
    <div className="terms">
      {/* ══════ HERO ══════ */}
      <section className="terms-hero">
        <div className="terms-hero-glow" aria-hidden="true" />
        <h1 className="terms-hero-title">
          Conditions <span className="terms-accent">d'utilisation</span>
        </h1>
        <p className="terms-hero-subtitle">
          Les règles qui encadrent l'utilisation de Kin-Sell. Claires, accessibles et pensées
          pour protéger chaque membre de la communauté.
        </p>
        <p className="terms-meta">Dernière mise à jour : 27 mars 2026</p>
      </section>

      {/* ══════ RÉSUMÉ RAPIDE ══════ */}
      <section className="terms-summary glass-container">
        <h2 className="terms-summary-title">En résumé</h2>
        <p className="terms-summary-intro">
          Avant d'entrer dans le détail, voici l'essentiel à retenir :
        </p>
        <ul className="terms-summary-list">
          <li><IconCheck /> En utilisant Kin-Sell, vous acceptez ces conditions</li>
          <li><IconCheck /> Kin-Sell est un intermédiaire — pas un vendeur</li>
          <li><IconCheck /> Vous êtes responsable de votre contenu et de vos transactions</li>
          <li><IconCheck /> La fraude, les arnaques et les faux profils sont strictement interdits</li>
          <li><IconCheck /> La négociation est possible, mais l'accord final vous engage</li>
          <li><IconCheck /> Kin-Sell peut suspendre un compte en cas d'abus</li>
        </ul>
      </section>

      {/* ══════ 1. INTRODUCTION ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">1</div>
        <div className="terms-block-content glass-container">
          <h2>Introduction</h2>
          <p>
            Bienvenue sur Kin-Sell. Les présentes conditions d'utilisation régissent l'accès et
            l'utilisation de la plateforme Kin-Sell, accessible via le site web et les applications associées.
          </p>
          <p>
            En accédant à Kin-Sell — que ce soit en tant que visiteur, utilisateur inscrit ou entreprise —
            vous reconnaissez avoir pris connaissance des présentes conditions et vous engagez à les respecter.
          </p>
          <p>
            Si vous n'acceptez pas ces conditions, nous vous invitons à ne pas utiliser la plateforme.
          </p>
        </div>
      </section>

      {/* ══════ 2. DÉFINITIONS ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">2</div>
        <div className="terms-block-content glass-container">
          <h2>Définitions</h2>
          <p>Dans les présentes conditions, les termes suivants ont les significations indiquées :</p>
          <div className="terms-definitions">
            <div className="terms-def-item">
              <strong>Plateforme</strong>
              <span>Kin-Sell, incluant le site web, les applications et tous les services associés.</span>
            </div>
            <div className="terms-def-item">
              <strong>Visiteur</strong>
              <span>Toute personne qui consulte Kin-Sell sans être inscrite. Le visiteur peut explorer
              les offres et consulter les profils, mais ne peut pas publier ni interagir.</span>
            </div>
            <div className="terms-def-item">
              <strong>Utilisateur</strong>
              <span>Toute personne physique inscrite sur Kin-Sell. L'utilisateur peut acheter, vendre,
              proposer ou rechercher des biens et des services.</span>
            </div>
            <div className="terms-def-item">
              <strong>Entreprise</strong>
              <span>Toute entité ou personne morale disposant d'un compte professionnel sur Kin-Sell,
              avec une boutique et un espace dédié à la publication de biens et de services.</span>
            </div>
            <div className="terms-def-item">
              <strong>Annonce</strong>
              <span>Toute publication de bien ou de service mise en ligne par un utilisateur ou une entreprise.</span>
            </div>
            <div className="terms-def-item">
              <strong>Bien</strong>
              <span>Tout produit ou objet physique proposé à la vente ou à l'échange sur la plateforme.</span>
            </div>
            <div className="terms-def-item">
              <strong>Service</strong>
              <span>Toute prestation, compétence ou savoir-faire proposé par un utilisateur ou une entreprise.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 3. ACCÈS AU SERVICE ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">3</div>
        <div className="terms-block-content glass-container">
          <h2>Accès au service</h2>
          <h3>3.1 — Consultation libre</h3>
          <p>
            L'accès à Kin-Sell en tant que visiteur est libre et gratuit. Vous pouvez consulter les
            annonces, explorer les boutiques et découvrir les profils publics sans créer de compte.
          </p>
          <h3>3.2 — Inscription</h3>
          <p>
            Pour publier du contenu, interagir avec d'autres membres ou accéder à l'ensemble des
            fonctionnalités, vous devez créer un compte en fournissant des informations exactes et à jour.
          </p>
          <h3>3.3 — Responsabilité du compte</h3>
          <p>
            Vous êtes seul responsable de la confidentialité de vos identifiants de connexion.
            Toute activité réalisée depuis votre compte est présumée être de votre fait.
            En cas de suspicion d'accès non autorisé, vous devez nous en informer immédiatement.
          </p>
          <h3>3.4 — Âge minimum</h3>
          <p>
            Vous devez avoir au moins 18 ans — ou l'âge de la majorité dans votre pays de résidence —
            pour créer un compte et utiliser pleinement Kin-Sell.
          </p>
        </div>
      </section>

      {/* ══════ 4. RÈGLES D'UTILISATION ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">4</div>
        <div className="terms-block-content glass-container">
          <h2>Règles d'utilisation</h2>
          <p>
            En utilisant Kin-Sell, vous vous engagez à respecter un comportement honnête,
            respectueux et conforme à l'esprit de la plateforme.
          </p>
          <h3>Il est strictement interdit de :</h3>
          <ul className="terms-forbidden-list">
            <li><IconX /> Publier de fausses annonces ou du contenu trompeur</li>
            <li><IconX /> Créer de faux profils ou usurper l'identité d'autrui</li>
            <li><IconX /> Commettre une fraude, une arnaque ou une escroquerie</li>
            <li><IconX /> Harceler, menacer ou discriminer d'autres membres</li>
            <li><IconX /> Envoyer du spam ou du contenu promotionnel non autorisé</li>
            <li><IconX /> Publier du contenu illicite, offensant ou contraire à l'ordre public</li>
            <li><IconX /> Tenter de contourner les systèmes de sécurité de la plateforme</li>
            <li><IconX /> Utiliser Kin-Sell à des fins illégales</li>
          </ul>
          <p>
            Tout manquement à ces règles peut entraîner la suspension ou la suppression définitive
            de votre compte, sans préavis.
          </p>
        </div>
      </section>

      {/* ══════ 5. PUBLICATION DE CONTENU ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">5</div>
        <div className="terms-block-content glass-container">
          <h2>Publication de contenu</h2>
          <h3>5.1 — Responsabilité du contenu</h3>
          <p>
            Chaque utilisateur et entreprise est entièrement responsable du contenu qu'il publie
            sur Kin-Sell : descriptions, images, prix, localisation, conditions de vente ou de prestation.
          </p>
          <h3>5.2 — Exactitude des informations</h3>
          <p>
            Les informations publiées doivent être exactes, complètes et à jour. Les descriptions
            trompeuses, les prix fictifs ou les images ne correspondant pas au bien ou au service
            proposé sont interdits.
          </p>
          <h3>5.3 — Contenu prohibé</h3>
          <p>
            Il est interdit de publier du contenu illégal, contrefait, dangereux, discriminatoire
            ou portant atteinte aux droits de tiers. Kin-Sell se réserve le droit de retirer tout
            contenu jugé non conforme sans notification préalable.
          </p>
        </div>
      </section>

      {/* ══════ 6. TRANSACTIONS ══════ */}
      <section className="terms-block terms-block--highlight">
        <div className="terms-block-number">6</div>
        <div className="terms-block-content glass-container">
          <h2>Transactions</h2>
          <div className="terms-important-notice">
            <strong>Point essentiel :</strong> Kin-Sell agit en tant qu'intermédiaire.
            La plateforme met en relation acheteurs et vendeurs, mais ne vend pas directement
            de biens ou de services.
          </div>
          <h3>6.1 — Mise en relation</h3>
          <p>
            Kin-Sell facilite la rencontre entre l'offre et la demande. Les transactions sont
            conclues directement entre les parties concernées (utilisateurs et/ou entreprises).
          </p>
          <h3>6.2 — Responsabilité des parties</h3>
          <p>
            Les utilisateurs et entreprises sont seuls responsables de la qualité, de la conformité
            et de la livraison effective des biens ou services échangés. Kin-Sell ne peut être tenu
            responsable en cas de litige, de défaut ou d'insatisfaction.
          </p>
          <h3>6.3 — Recommandations</h3>
          <p>
            Nous recommandons à chaque membre de vérifier les profils, de consulter les avis
            disponibles et de privilégier les échanges tracés au sein de la plateforme pour
            une meilleure sécurité.
          </p>
        </div>
      </section>

      {/* ══════ 7. NÉGOCIATION ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">7</div>
        <div className="terms-block-content glass-container">
          <h2>Négociation</h2>
          <p>
            Kin-Sell offre la possibilité de négocier les prix et les conditions de certaines offres,
            en fonction du contexte et des préférences du vendeur.
          </p>
          <h3>7.1 — Cadre de la négociation</h3>
          <p>
            La négociation se fait de bonne foi entre les parties. Chaque utilisateur est libre
            d'accepter ou de refuser une proposition de prix.
          </p>
          <h3>7.2 — Accord entre parties</h3>
          <p>
            Lorsqu'un accord est trouvé entre un acheteur et un vendeur, celui-ci engage les deux parties.
            Kin-Sell n'intervient pas dans la négociation et ne peut être tenu responsable du résultat,
            que l'accord soit conclu ou non.
          </p>
          <h3>7.3 — Bonne conduite</h3>
          <p>
            Les négociations abusives, répétitives ou de mauvaise foi peuvent entraîner des restrictions
            sur votre compte.
          </p>
        </div>
      </section>

      {/* ══════ 8. COMPTES ENTREPRISES ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">8</div>
        <div className="terms-block-content glass-container">
          <h2>Comptes entreprises</h2>
          <p>
            Les entreprises inscrites sur Kin-Sell bénéficient de fonctionnalités dédiées :
            boutique en ligne, espace professionnel, visibilité accrue.
          </p>
          <h3>8.1 — Obligations spécifiques</h3>
          <p>
            En tant qu'entreprise, vous vous engagez à :
          </p>
          <ul className="terms-check-list">
            <li><IconCheck /> Fournir des informations commerciales exactes et vérifiables</li>
            <li><IconCheck /> Maintenir un comportement professionnel dans toutes vos interactions</li>
            <li><IconCheck /> Respecter les engagements pris envers vos clients sur la plateforme</li>
            <li><IconCheck /> Mettre à jour régulièrement votre catalogue de biens et services</li>
            <li><IconCheck /> Répondre dans des délais raisonnables aux sollicitations</li>
          </ul>
          <h3>8.2 — Responsabilité renforcée</h3>
          <p>
            Les comptes entreprises sont soumis à un niveau d'exigence plus élevé. En cas de plaintes
            répétées, de comportement trompeur ou de manquement aux engagements, Kin-Sell se réserve
            le droit de restreindre ou supprimer le compte professionnel.
          </p>
        </div>
      </section>

      {/* ══════ 9. SUSPENSION ET SUPPRESSION ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">9</div>
        <div className="terms-block-content glass-container">
          <h2>Suspension et suppression de compte</h2>
          <p>
            Kin-Sell se réserve le droit de suspendre temporairement ou de supprimer définitivement
            tout compte en cas de :
          </p>
          <ul className="terms-forbidden-list">
            <li><IconX /> Violation des présentes conditions d'utilisation</li>
            <li><IconX /> Comportement frauduleux ou trompeur</li>
            <li><IconX /> Plaintes répétées d'autres utilisateurs</li>
            <li><IconX /> Tentative de nuire à la plateforme ou à ses membres</li>
            <li><IconX /> Inactivité prolongée du compte (selon notre politique interne)</li>
          </ul>
          <p>
            En cas de suspension, vous serez informé du motif lorsque c'est possible.
            Kin-Sell n'est pas tenu de fournir un préavis en cas de violation grave.
          </p>
        </div>
      </section>

      {/* ══════ 10. LIMITATION DE RESPONSABILITÉ ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">10</div>
        <div className="terms-block-content glass-container">
          <h2>Limitation de responsabilité</h2>
          <h3>10.1 — Rôle d'intermédiaire</h3>
          <p>
            Kin-Sell agit en tant qu'intermédiaire technique. La plateforme n'est ni vendeur,
            ni acheteur, ni prestataire de service. Elle ne saurait être tenue responsable du
            comportement des membres ni du résultat des transactions.
          </p>
          <h3>10.2 — Disponibilité du service</h3>
          <p>
            Kin-Sell s'efforce de maintenir la plateforme accessible en permanence, mais ne
            garantit pas une disponibilité ininterrompue. Des interruptions temporaires peuvent
            survenir pour maintenance, mise à jour ou cas de force majeure.
          </p>
          <h3>10.3 — Pertes et litiges</h3>
          <p>
            Kin-Sell ne peut être tenu responsable des pertes financières, des dommages directs
            ou indirects résultant de l'utilisation de la plateforme, d'une transaction entre
            membres ou d'un litige entre parties.
          </p>
        </div>
      </section>

      {/* ══════ 11. DONNÉES PERSONNELLES ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">11</div>
        <div className="terms-block-content glass-container">
          <h2>Données personnelles</h2>
          <p>
            Kin-Sell s'engage à protéger vos données personnelles conformément à sa politique
            de confidentialité. La collecte, le traitement et le stockage de vos données sont
            réalisés dans le respect de vos droits fondamentaux.
          </p>
          <p>
            Pour en savoir plus sur la manière dont nous traitons vos données, nous vous invitons
            à consulter notre{" "}
            <a href="/privacy" className="terms-link">Politique de traitement des données</a>.
          </p>
        </div>
      </section>

      {/* ══════ 12. MODIFICATIONS ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">12</div>
        <div className="terms-block-content glass-container">
          <h2>Modifications des conditions</h2>
          <p>
            Kin-Sell se réserve le droit de modifier les présentes conditions d'utilisation à tout
            moment, afin de refléter l'évolution de la plateforme, de ses services ou du cadre
            réglementaire applicable.
          </p>
          <p>
            Les utilisateurs seront informés de toute modification significative. L'utilisation
            continue de la plateforme après modification vaut acceptation des nouvelles conditions.
          </p>
          <p>
            Nous vous encourageons à consulter régulièrement cette page pour rester informé.
          </p>
        </div>
      </section>

      {/* ══════ 13. DROIT APPLICABLE ══════ */}
      <section className="terms-block">
        <div className="terms-block-number">13</div>
        <div className="terms-block-content glass-container">
          <h2>Droit applicable</h2>
          <p>
            Les présentes conditions sont régies par le droit en vigueur dans la juridiction
            où Kin-Sell exerce ses activités. En cas de litige, les parties s'engagent à
            rechercher une résolution amiable avant toute action judiciaire.
          </p>
          <p>
            Si aucune solution amiable n'est trouvée, le litige sera porté devant les tribunaux
            compétents du lieu d'établissement de Kin-Sell.
          </p>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="terms-cta glass-container">
        <h2 className="terms-cta-title">
          Des questions sur nos <span className="terms-accent">conditions</span> ?
        </h2>
        <p className="terms-cta-text">
          Si vous avez besoin de clarifications sur un point précis de ces conditions,
          n'hésitez pas à nous contacter. Notre équipe est là pour vous répondre.
        </p>
        <div className="terms-cta-buttons">
          <a href="/contact" className="glass-button primary btn-lg">Nous contacter</a>
          <a href="/faq" className="glass-button secondary btn-lg">Consulter la FAQ</a>
        </div>
      </section>
    </div>
  );
}
