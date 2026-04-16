import "./legal.css";
import { SeoMeta } from "../../components/SeoMeta";

/* ── SVG icon helpers ── */
const IconFileText = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
);
const IconServer = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
);
const IconActivity = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);
const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconCopyright = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.83 14.83a4 4 0 1 1 0-5.66"/></svg>
);
const IconLock = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const IconMail = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);
const IconInfo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function LegalPage() {
  return (
    <div className="legal">
      <SeoMeta
        title="Mentions légales | Kin-Sell"
        description="Mentions légales de Kin-Sell : éditeur, hébergement, propriété intellectuelle, responsabilité et contact."
        canonical="https://kin-sell.com/legal"
      />
      {/* ══════ HERO ══════ */}
      <section className="legal-hero">
        <div className="legal-hero-glow" aria-hidden="true" />
        <h1 className="legal-hero-title">
          Mentions <span className="legal-accent">légales</span>
        </h1>
        <p className="legal-hero-subtitle">
          Toutes les informations officielles relatives à Kin-Sell, conformément aux
          obligations en vigueur. Clair, simple et transparent.
        </p>
        <p className="legal-meta">Dernière mise à jour : 27 mars 2026</p>
      </section>

      {/* ══════ VERSION COURTE ══════ */}
      <section className="legal-summary glass-container">
        <h2 className="legal-summary-title">En bref</h2>
        <p className="legal-summary-intro">
          Kin-Sell est une plateforme de mise en relation permettant d'acheter des biens,
          de vendre des biens et de proposer des services. Le site est hébergé par Hostinger.
          Kin-Sell agit comme intermédiaire et ne participe pas directement aux transactions
          entre ses membres.
        </p>
      </section>

      {/* ══════ 1. ÉDITEUR DU SITE ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconFileText /></div>
        <div className="legal-block-content glass-container">
          <h2>Éditeur du site</h2>
          <div className="legal-info-grid">
            <div className="legal-info-item">
              <strong>Nom du site</strong>
              <span>Kin-Sell</span>
            </div>
            <div className="legal-info-item">
              <strong>Propriétaire</strong>
              <span className="legal-placeholder">[Nom du propriétaire / raison sociale]</span>
            </div>
            <div className="legal-info-item">
              <strong>Statut</strong>
              <span className="legal-placeholder">[Personne physique / Entreprise]</span>
            </div>
            <div className="legal-info-item">
              <strong>Adresse</strong>
              <span className="legal-placeholder">[Adresse du siège social]</span>
            </div>
            <div className="legal-info-item">
              <strong>Contact</strong>
              <span>support@kin-sell.com</span>
            </div>
            <div className="legal-info-item">
              <strong>Numéro d'identification</strong>
              <span className="legal-placeholder">[RCCM / NIF / autre identifiant légal]</span>
            </div>
          </div>
          <div className="legal-callout legal-callout--info">
            <span className="legal-callout-icon"><IconInfo /></span>
            <p>
              Les champs entre crochets sont à compléter avec les informations officielles
              du propriétaire de la plateforme.
            </p>
          </div>
        </div>
      </section>

      {/* ══════ 2. HÉBERGEMENT ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconServer /></div>
        <div className="legal-block-content glass-container">
          <h2>Hébergement</h2>
          <p>
            Le site Kin-Sell est hébergé par <strong>Hostinger International Ltd</strong>,
            un fournisseur d'hébergement web reconnu à l'échelle mondiale.
          </p>
          <div className="legal-info-grid">
            <div className="legal-info-item">
              <strong>Hébergeur</strong>
              <span>Hostinger International Ltd</span>
            </div>
            <div className="legal-info-item">
              <strong>Site web</strong>
              <span>hostinger.com</span>
            </div>
          </div>
          <p className="legal-note">
            L'infrastructure d'hébergement assure la disponibilité, la performance et la
            sécurité de la plateforme.
          </p>
        </div>
      </section>

      {/* ══════ 3. ACTIVITÉ ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconActivity /></div>
        <div className="legal-block-content glass-container">
          <h2>Nature de l'activité</h2>
          <p>
            Kin-Sell est une <strong>plateforme digitale de mise en relation</strong> entre
            particuliers et entreprises, opérant principalement en Afrique.
          </p>
          <div className="legal-activity-cards">
            <div className="legal-activity-card glass-card">
              <h3>Achat &amp; vente de biens</h3>
              <p>
                Les utilisateurs peuvent publier, consulter et négocier l'achat ou la vente
                de biens neufs ou d'occasion.
              </p>
            </div>
            <div className="legal-activity-card glass-card">
              <h3>Proposition de services</h3>
              <p>
                Les utilisateurs et entreprises peuvent proposer des services dans
                différentes catégories : entretien, prestation à domicile, expertise, etc.
              </p>
            </div>
            <div className="legal-activity-card glass-card">
              <h3>Mise en relation</h3>
              <p>
                Kin-Sell facilite la connexion entre <strong>visiteurs</strong>,{" "}
                <strong>utilisateurs enregistrés</strong> et <strong>entreprises</strong>{" "}
                via ses outils de recherche, messagerie et négociation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 4. RESPONSABILITÉ ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconShield /></div>
        <div className="legal-block-content glass-container">
          <h2>Limitation de responsabilité</h2>
          <p>
            Kin-Sell agit en qualité d'<strong>intermédiaire technique</strong>. La
            plateforme met à disposition les outils pour faciliter les échanges, mais ne
            participe pas directement aux transactions entre ses membres.
          </p>
          <div className="legal-responsibility-list">
            <div className="legal-resp-item glass-card">
              <h3>Transactions</h3>
              <p>
                Kin-Sell ne peut être tenu responsable des accords, négociations ou
                transactions conclus entre utilisateurs. Chaque partie est responsable de
                ses engagements.
              </p>
            </div>
            <div className="legal-resp-item glass-card">
              <h3>Contenu publié</h3>
              <p>
                Les annonces, descriptions et images sont sous la responsabilité de
                l'utilisateur qui les publie. Kin-Sell se réserve le droit de supprimer
                tout contenu jugé inapproprié, frauduleux ou trompeur.
              </p>
            </div>
            <div className="legal-resp-item glass-card">
              <h3>Disponibilité</h3>
              <p>
                Kin-Sell s'efforce de maintenir la plateforme accessible en permanence,
                mais ne garantit pas une disponibilité sans interruption. Des opérations de
                maintenance ou des incidents techniques peuvent survenir.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 5. PROPRIÉTÉ INTELLECTUELLE ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconCopyright /></div>
        <div className="legal-block-content glass-container">
          <h2>Propriété intellectuelle</h2>
          <p>
            L'ensemble des éléments présents sur Kin-Sell — nom, logo, design, textes,
            graphismes, fonctionnalités, code source — sont protégés par le droit de la
            propriété intellectuelle.
          </p>
          <p>
            Toute reproduction, représentation, modification ou exploitation, partielle ou
            totale, de ces éléments est strictement <strong>interdite</strong> sans
            autorisation écrite préalable du propriétaire de Kin-Sell.
          </p>
          <p>
            Les contenus publiés par les utilisateurs (annonces, photos, descriptions)
            restent la propriété de leurs auteurs respectifs. En publiant sur Kin-Sell,
            l'utilisateur accorde à la plateforme un droit d'affichage limité à
            l'exploitation du service.
          </p>
        </div>
      </section>

      {/* ══════ 6. DONNÉES PERSONNELLES ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconLock /></div>
        <div className="legal-block-content glass-container">
          <h2>Données personnelles</h2>
          <p>
            Kin-Sell collecte et traite certaines données personnelles dans le strict cadre
            du fonctionnement de la plateforme. Ces données sont protégées et ne sont
            jamais vendues à des tiers.
          </p>
          <p>
            Pour connaître en détail les pratiques de Kin-Sell en matière de collecte,
            d'utilisation et de protection des données, consultez notre page dédiée :
          </p>
          <div className="legal-link-box glass-card">
            <IconLock />
            <div>
              <a href="/privacy" className="legal-link">
                Protection et traitement des données →
              </a>
              <p>
                Tout savoir sur la gestion de vos données personnelles, vos droits et nos
                engagements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ 7. CONTACT ══════ */}
      <section className="legal-block">
        <div className="legal-block-icon"><IconMail /></div>
        <div className="legal-block-content glass-container">
          <h2>Contact</h2>
          <p>
            Pour toute question relative aux mentions légales, à l'utilisation de la
            plateforme ou à vos droits, notre équipe est disponible :
          </p>
          <div className="legal-contact-box glass-card">
            <div className="legal-contact-item">
              <strong>Email :</strong>
              <span>support@kin-sell.com</span>
            </div>
            <div className="legal-contact-item">
              <strong>Objet :</strong>
              <span>Mentions légales — [votre demande]</span>
            </div>
            <div className="legal-contact-item">
              <strong>Délai :</strong>
              <span>48 heures maximum (jours ouvrables)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="legal-cta">
        <div className="legal-cta-block glass-container">
          <h2 className="legal-cta-title">
            Transparence et <span className="legal-accent">crédibilité</span>
          </h2>
          <p className="legal-cta-text">
            Kin-Sell est un projet sérieux, construit pour durer. Chaque page, chaque
            fonctionnalité et chaque décision reflète notre engagement envers une plateforme
            fiable et respectueuse de ses utilisateurs.
          </p>
          <div className="legal-cta-buttons">
            <a href="/about" className="glass-button">Qui nous sommes</a>
            <a href="/terms" className="glass-button glass-button--outline">Conditions d'utilisation</a>
          </div>
        </div>
      </section>
    </div>
  );
}
