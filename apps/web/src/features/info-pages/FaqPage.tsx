import { useState } from "react";
import "./faq.css";

/* ── SVG icon helpers ── */
const IconChevronDown = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const IconGlobe = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>
);
const IconUser = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconShoppingBag = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
);
const IconTag = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
);
const IconTool = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
);
const IconMessageCircle = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
);
const IconMapPin = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);
const IconShield = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);

/* ── FAQ Data ── */
interface FaqItem {
  q: string;
  a: string;
}
interface FaqCategory {
  id: string;
  icon: JSX.Element;
  label: string;
  items: FaqItem[];
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "general",
    icon: <IconGlobe />,
    label: "Général",
    items: [
      {
        q: "Qu'est-ce que Kin-Sell ?",
        a: "Kin-Sell est une plateforme digitale africaine qui permet d'acheter des biens, de vendre des biens et de proposer des services. Elle met en relation des particuliers et des entreprises dans un environnement sécurisé, structuré et transparent.",
      },
      {
        q: "Qui peut utiliser Kin-Sell ?",
        a: "Tout le monde. Les visiteurs peuvent consulter les annonces librement. Les utilisateurs enregistrés peuvent acheter, vendre et interagir. Les entreprises disposent d'un espace professionnel avec des outils dédiés (vitrine, gestion d'annonces, statistiques).",
      },
      {
        q: "Kin-Sell est-il disponible en dehors de Kinshasa ?",
        a: "Kin-Sell est lancé à Kinshasa et s'étendra progressivement à d'autres villes et régions. La plateforme est conçue pour être accessible partout en RDC et en Afrique à terme.",
      },
    ],
  },
  {
    id: "account",
    icon: <IconUser />,
    label: "Compte",
    items: [
      {
        q: "Comment créer un compte ?",
        a: "Cliquez sur « S'inscrire », renseignez votre nom, email et mot de passe. La création de compte est rapide et gratuite — que ce soit en tant que particulier ou en tant qu'entreprise.",
      },
      {
        q: "Est-ce gratuit ?",
        a: "Oui, l'inscription et l'utilisation de base de Kin-Sell sont entièrement gratuites. Certaines fonctionnalités avancées pour les entreprises pourront être proposées sous forme d'abonnement à l'avenir.",
      },
      {
        q: "Comment modifier mon profil ?",
        a: "Rendez-vous dans votre espace personnel, section « Mon profil ». Vous pouvez y modifier votre nom, photo, description et informations de contact à tout moment.",
      },
    ],
  },
  {
    id: "buying",
    icon: <IconShoppingBag />,
    label: "Achat",
    items: [
      {
        q: "Comment acheter un bien ou un service ?",
        a: "Parcourez les annonces via l'Explorer ou la recherche. Quand un bien ou un service vous intéresse, contactez le vendeur/prestataire via la messagerie interne. Négociez directement, puis convenez des modalités de remise ou de prestation.",
      },
      {
        q: "Les achats sont-ils sécurisés ?",
        a: "Kin-Sell met en place plusieurs mesures pour sécuriser les échanges : messagerie interne (traçabilité), système d'adresses sécurisé (pas de domicile personnel), vérification de profils et outil de signalement. Nous recommandons fortement les lieux de remise publics.",
      },
      {
        q: "Puis-je acheter sans créer de compte ?",
        a: "Vous pouvez consulter les annonces en tant que visiteur, mais pour contacter un vendeur ou négocier, la création d'un compte gratuit est nécessaire.",
      },
    ],
  },
  {
    id: "selling",
    icon: <IconTag />,
    label: "Vente",
    items: [
      {
        q: "Comment vendre sur Kin-Sell ?",
        a: "Créez un compte, puis publiez votre annonce avec titre, description, photos et prix. Votre annonce sera visible dans l'Explorer et les résultats de recherche. Les acheteurs intéressés vous contacteront via la messagerie.",
      },
      {
        q: "Est-ce payant de publier une annonce ?",
        a: "Non. La publication d'annonces est gratuite sur Kin-Sell. Des options de mise en avant (boost de visibilité) pourront être proposées ultérieurement.",
      },
      {
        q: "Combien d'annonces puis-je publier ?",
        a: "Il n'y a pas de limite stricte pour les utilisateurs particuliers. Les comptes entreprises bénéficient d'un espace dédié avec gestion avancée de leur catalogue.",
      },
    ],
  },
  {
    id: "services",
    icon: <IconTool />,
    label: "Services",
    items: [
      {
        q: "Comment proposer un service ?",
        a: "Créez une annonce en sélectionnant la catégorie « Services ». Décrivez votre offre — entretien, prestation technique, expertise, etc. — et indiquez votre zone de couverture et vos tarifs.",
      },
      {
        q: "Y a-t-il des catégories de services ?",
        a: "Oui, Kin-Sell propose différentes catégories : entretien à domicile, prestations techniques, services professionnels, et plus encore. Ces catégories évoluent en fonction des besoins de la communauté.",
      },
    ],
  },
  {
    id: "negotiation",
    icon: <IconMessageCircle />,
    label: "Négociation",
    items: [
      {
        q: "Comment fonctionne la négociation ?",
        a: "Sur Kin-Sell, la négociation fait partie de l'expérience. Vous pouvez proposer un prix différent au vendeur via la messagerie. L'échange continue jusqu'à ce qu'un accord soit trouvé. Une fois accepté, cet accord engage les deux parties.",
      },
      {
        q: "Le vendeur est-il obligé d'accepter ma proposition ?",
        a: "Non. Le vendeur est libre d'accepter, de refuser ou de faire une contre-proposition. La négociation est un échange respectueux entre deux parties.",
      },
      {
        q: "Puis-je annuler après un accord ?",
        a: "Un accord conclu sur Kin-Sell est un engagement moral entre les parties. Les annulations répétées ou abusives peuvent entraîner des restrictions sur votre compte.",
      },
    ],
  },
  {
    id: "addresses",
    icon: <IconMapPin />,
    label: "Adresses",
    items: [
      {
        q: "Pourquoi Kin-Sell utilise un système d'adresses ?",
        a: "Pour protéger votre sécurité. Au lieu de partager votre adresse personnelle, vous utilisez des adresses de rencontre adaptées au type de transaction : livraison, entretien ou prestation.",
      },
      {
        q: "C'est quoi une adresse de livraison ?",
        a: "C'est un lieu public où vous recevez un bien acheté — un café, un centre commercial, une station connue. Jamais votre domicile. L'objectif : une remise en main propre sécurisée, dans un endroit fréquenté.",
      },
      {
        q: "C'est quoi une adresse d'entretien ?",
        a: "C'est le lieu où un prestataire vient effectuer un entretien — ménage, plomberie, électricité. Cette adresse peut être votre domicile, mais uniquement avec un prestataire de confiance et vérifié.",
      },
      {
        q: "C'est quoi une adresse de prestation ?",
        a: "C'est un lieu extérieur où une prestation est réalisée — cabinet, atelier, espace de coworking. Le prestataire définit l'adresse et le client s'y rend.",
      },
      {
        q: "Pourquoi éviter de donner son adresse personnelle ?",
        a: "Votre domicile est votre espace privé. Le partager avec un inconnu présente des risques : repérage, visite non désirée, insécurité. Kin-Sell vous encourage à toujours privilégier un lieu public et neutre pour les premières rencontres.",
      },
    ],
  },
  {
    id: "security",
    icon: <IconShield />,
    label: "Sécurité",
    items: [
      {
        q: "Comment éviter les arnaques ?",
        a: "Restez vigilant : vérifiez les profils, utilisez la messagerie Kin-Sell (pas de canaux externes), méfiez-vous des offres trop belles, exigez de voir le bien avant paiement, rencontrez-vous dans un lieu public. En cas de doute, signalez.",
      },
      {
        q: "Que faire en cas de problème ?",
        a: "Utilisez le bouton « Signaler » sur l'annonce ou le profil concerné. Vous pouvez aussi contacter notre support à support@kin-sell.com. Nous traitons chaque signalement avec sérieux et réactivité.",
      },
      {
        q: "Kin-Sell protège-t-il mes données ?",
        a: "Oui. Vos données personnelles ne sont jamais vendues. Les analyses sont faites sur des données anonymisées et agrégées. Consultez notre page « Protection des données » pour tous les détails.",
      },
      {
        q: "Mon compte peut-il être suspendu ?",
        a: "Oui, en cas de comportement frauduleux, de signalements multiples ou de violation des conditions d'utilisation. Kin-Sell se réserve le droit de suspendre ou supprimer un compte pour protéger la communauté.",
      },
    ],
  },
];

/* ── Accordion Item ── */
function FaqAccordion({ q, a }: FaqItem) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-accordion ${open ? "faq-accordion--open" : ""}`}>
      <button
        className="faq-accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="faq-accordion-chevron"><IconChevronDown /></span>
      </button>
      <div className="faq-accordion-body">
        <p>{a}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

export function FaqPage() {
  const [activeCategory, setActiveCategory] = useState("general");
  const active = FAQ_CATEGORIES.find((c) => c.id === activeCategory) ?? FAQ_CATEGORIES[0];

  return (
    <div className="faq">
      {/* ══════ HERO ══════ */}
      <section className="faq-hero">
        <div className="faq-hero-glow" aria-hidden="true" />
        <h1 className="faq-hero-title">
          Foire aux <span className="faq-accent">questions</span>
        </h1>
        <p className="faq-hero-subtitle">
          Tout ce que vous devez savoir sur Kin-Sell. Des réponses simples, directes et
          utiles pour acheter, vendre et proposer vos services en toute confiance.
        </p>
      </section>

      {/* ══════ VERSION COURTE ══════ */}
      <section className="faq-quick glass-container">
        <h2 className="faq-quick-title">L'essentiel en 30 secondes</h2>
        <div className="faq-quick-grid">
          <div className="faq-quick-item">
            <strong>Inscription</strong>
            <p>Gratuite et rapide — particulier ou entreprise.</p>
          </div>
          <div className="faq-quick-item">
            <strong>Acheter / Vendre</strong>
            <p>Publiez, négociez et concluez directement entre membres.</p>
          </div>
          <div className="faq-quick-item">
            <strong>Services</strong>
            <p>Proposez ou trouvez des prestations dans votre zone.</p>
          </div>
          <div className="faq-quick-item">
            <strong>Sécurité</strong>
            <p>Adresses protégées, messagerie interne, signalement.</p>
          </div>
        </div>
      </section>

      {/* ══════ CATEGORY TABS + CONTENT ══════ */}
      <section className="faq-main">
        <nav className="faq-tabs" aria-label="Catégories FAQ">
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`faq-tab glass-button ${activeCategory === cat.id ? "faq-tab--active" : "glass-button--outline"}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span className="faq-tab-icon">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </nav>

        <div className="faq-content">
          <div className="faq-content-header">
            <span className="faq-content-icon">{active.icon}</span>
            <h2>{active.label}</h2>
          </div>
          <div className="faq-accordions">
            {active.items.map((item) => (
              <FaqAccordion key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════ DIDN'T FIND ══════ */}
      <section className="faq-contact glass-container">
        <h2 className="faq-contact-title">Vous n'avez pas trouvé votre réponse ?</h2>
        <p className="faq-contact-text">
          Notre équipe est disponible pour vous aider. Envoyez-nous un message et nous
          répondrons dans les plus brefs délais.
        </p>
        <div className="faq-contact-info">
          <strong>Email :</strong>
          <span>support@kin-sell.com</span>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section className="faq-cta">
        <div className="faq-cta-block glass-container">
          <h2 className="faq-cta-title">
            Prêt à <span className="faq-accent">commencer</span> ?
          </h2>
          <p className="faq-cta-text">
            Rejoignez la communauté Kin-Sell et commencez dès maintenant à acheter, vendre
            ou proposer vos services.
          </p>
          <div className="faq-cta-buttons">
            <a href="/explorer" className="glass-button">Explorer Kin-Sell</a>
            <a href="/how-it-works" className="glass-button glass-button--outline">Comment ça marche</a>
          </div>
        </div>
      </section>
    </div>
  );
}
