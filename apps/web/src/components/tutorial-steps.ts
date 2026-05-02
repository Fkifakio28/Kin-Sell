/**
 * Définition des étapes du tutoriel interactif — par page.
 * Chaque tableau est utilisé avec <TutorialOverlay pageKey="…" steps={…} />
 */
import type { TutorialStep } from "./TutorialOverlay";

/* ═══════════════════════════════════════════════════════
   HOME — Desktop
   ═══════════════════════════════════════════════════════ */

export const homeDesktopSteps: TutorialStep[] = [
  {
    id: "hd-search",
    selector: ".h-search",
    title: "Barre de recherche",
    description:
      "Tapez un mot-clé pour trouver un produit, un service ou un vendeur. Les résultats s'affichent instantanément.",
    placement: "bottom",
  },
  {
    id: "hd-categories",
    selector: ".h-cat-box",
    title: "Catégories",
    description:
      "Parcourez les catégories disponibles à Kinshasa : électronique, mode, alimentation… Cliquez pour filtrer les annonces.",
    placement: "right",
  },
  {
    id: "hd-articles",
    selector: ".h-articles-grid",
    title: "Articles récents",
    description:
      "Voici les produits et services publiés récemment. Faites défiler pour explorer les annonces.",
    placement: "top",
  },
  {
    id: "hd-card",
    selector: ".h-article-card",
    title: "Carte produit",
    description:
      "Chaque carte affiche le prix, la photo et le vendeur. Vous pouvez ajouter au panier ou négocier directement.",
    placement: "left",
  },
  {
    id: "hd-dashboard",
    selector: ".h-dash-card",
    title: "Tableau de bord rapide",
    description:
      "Consultez vos stats en un coup d'œil : panier, commandes et montants. Cliquez pour accéder aux détails.",
    placement: "bottom",
  },
  {
    id: "hd-sokin",
    selector: ".h-sokin-box",
    title: "So-Kin — Feed social",
    description:
      "Découvrez So-Kin, le fil d'actualité local de Kinshasa. Likez, commentez et partagez avec la communauté.",
    placement: "left",
  },
  {
    id: "hd-notif",
    selector: ".h-action-btn--notif",
    title: "Notifications",
    description:
      "Restez informé de vos messages, commandes et alertes. Le badge rouge indique les notifications non lues.",
    placement: "bottom",
  },
  {
    id: "hd-voir-tout",
    selector: ".h-articles-link",
    title: "Voir tout",
    description:
      "Cliquez ici pour accéder à l'Explorer et voir toutes les annonces disponibles avec filtres avancés.",
    placement: "bottom",
  },
];

/* ═══════════════════════════════════════════════
   HOME — Mobile
   ═══════════════════════════════════════════════ */

export const homeMobileSteps: TutorialStep[] = [
  {
    id: "hm-menu",
    selector: ".hm-topbar-btn",
    title: "Menu principal",
    description:
      "Ouvrez le menu latéral pour accéder à votre profil, vos commandes, la messagerie et les paramètres.",
    placement: "bottom",
  },
  {
    id: "hm-search",
    selector: ".hm-topbar-logo",
    title: "Bienvenue sur Kin-Sell !",
    description:
      "Vous êtes sur la place de marché de Kinshasa. Utilisez la loupe en haut pour rechercher des produits et services.",
    placement: "bottom",
  },
  {
    id: "hm-suggestions",
    selector: ".hm-suggestions",
    title: "Suggestions pour vous",
    description:
      "Des articles sélectionnés selon vos préférences et votre localisation. Faites défiler horizontalement pour en voir plus.",
    placement: "bottom",
  },
  {
    id: "hm-tabs",
    selector: ".hm-tabs",
    title: "Filtres par type",
    description:
      "Basculez entre Produits, Services et Tout pour affiner ce qui s'affiche dans le fil.",
    placement: "bottom",
  },
  {
    id: "hm-listings",
    selector: ".hm-listings",
    title: "Annonces du marché",
    description:
      "Parcourez toutes les annonces récentes. Appuyez sur une carte pour voir les détails, ou sur le bouton négocier pour discuter le prix.",
    placement: "top",
  },
  {
    id: "hm-longpress",
    selector: ".hm-market-card",
    title: "Appui long — détails rapides",
    description:
      "Maintenez votre doigt appuyé sur une carte pour afficher la description complète, le prix et les boutons Marchander / Ajouter au panier.",
    placement: "auto",
  },
  {
    id: "hm-create",
    selector: ".hm-bnav-create",
    title: "Publier une annonce",
    description:
      "Appuyez sur le « + » pour publier un produit, un service ou un post So-Kin. C'est rapide et gratuit !",
    placement: "top",
  },
  {
    id: "hm-bottomnav",
    selector: ".hm-bottomnav",
    title: "Navigation rapide",
    description:
      "Accédez en un tap à l'accueil, au panier, aux notifications et à votre compte depuis la barre du bas.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   EXPLORER — Mobile
   ═══════════════════════════════════════════════════════ */

export const explorerMobileSteps: TutorialStep[] = [
  {
    id: "exm-toggle",
    selector: ".ex-toggle",
    title: "Produits ou Services",
    description:
      "Basculez entre Produits et Services pour filtrer les annonces affichées.",
    placement: "bottom",
  },
  {
    id: "exm-cats",
    selector: ".ex-cats-scroll",
    title: "Catégories",
    description:
      "Faites défiler les catégories et appuyez pour filtrer par type d'article.",
    placement: "bottom",
  },
  {
    id: "exm-grid",
    selector: ".ex-articles-grid",
    title: "Résultats",
    description:
      "Les articles correspondants s'affichent ici. Appuyez sur une carte pour voir les détails.",
    placement: "top",
  },
  {
    id: "exm-card",
    selector: ".ex-article-card",
    title: "Carte article",
    description:
      "Photo, prix et vendeur en un coup d'œil. Ajoutez au panier ou négociez directement.",
    placement: "auto",
  },
  {
    id: "exm-longpress",
    selector: ".ex-article-card",
    title: "Appui long — détails rapides",
    description:
      "Maintenez appuyé sur un article pour voir sa description complète et accéder aux boutons Marchander et Ajouter au panier.",
    placement: "auto",
  },
  {
    id: "exm-showall",
    selector: ".ex-show-all",
    title: "Voir tout",
    description:
      "Chargez plus d'articles ou accédez à la liste complète dans cette catégorie.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   EXPLORER — Desktop
   ═══════════════════════════════════════════════════════ */

export const explorerDesktopSteps: TutorialStep[] = [
  {
    id: "exd-switch",
    selector: ".explorer-switch-toggle",
    title: "Produits / Services",
    description:
      "Changez de vue entre produits et services d'un simple clic.",
    placement: "bottom",
  },
  {
    id: "exd-cats",
    selector: ".explorer-categories-scroll",
    title: "Catégories",
    description:
      "Parcourez et sélectionnez une catégorie pour affiner les résultats.",
    placement: "bottom",
  },
  {
    id: "exd-grid",
    selector: ".explorer-articles-grid",
    title: "Grille d'articles",
    description:
      "Tous les articles filtrés apparaissent ici. Survolez une carte pour apercevoir les détails.",
    placement: "top",
  },
  {
    id: "exd-card",
    selector: ".explorer-article-card",
    title: "Carte article",
    description:
      "Photo, prix, vendeur — et actions rapides : panier 🛒 ou négociation 🤝.",
    placement: "left",
  },
  {
    id: "exd-shops",
    selector: ".explorer-shops-section",
    title: "Boutiques",
    description:
      "Découvrez les boutiques et vendeurs populaires de Kinshasa. Cliquez pour visiter leur page.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   MESSAGING
   ═══════════════════════════════════════════════════════ */

export const messagingSteps: TutorialStep[] = [
  {
    id: "mg-list",
    selector: ".mg-conv-list",
    title: "Vos conversations",
    description:
      "Toutes vos discussions apparaissent ici. Les conversations non lues sont mises en évidence.",
    placement: "right",
  },
  {
    id: "mg-search",
    selector: ".mg-search-input",
    title: "Rechercher",
    description:
      "Retrouvez rapidement une conversation par nom ou mot-clé.",
    placement: "bottom",
  },
  {
    id: "mg-header",
    selector: ".mg-conv-header",
    title: "En-tête de conversation",
    description:
      "Nom du contact, statut en ligne, et boutons d'appel audio/vidéo.",
    placement: "bottom",
  },
  {
    id: "mg-composer",
    selector: ".mg-composer",
    title: "Écrire un message",
    description:
      "Tapez votre message ici. Vous pouvez aussi envoyer des photos, fichiers ou messages vocaux.",
    placement: "top",
  },
  {
    id: "mg-send",
    selector: ".mg-send-btn",
    title: "Envoyer",
    description:
      "Appuyez pour envoyer votre message. Les messages sont livrés en temps réel.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   BUSINESS DASHBOARD
   ═══════════════════════════════════════════════════════ */

export const businessDashboardSteps: TutorialStep[] = [
  {
    id: "bz-stats",
    selector: ".ud-stat-card",
    title: "Vos statistiques",
    description:
      "Visualisez vos ventes, revenus et commandes récentes en un coup d'œil.",
    placement: "bottom",
  },
  {
    id: "bz-actions",
    selector: ".ud-actions-grid",
    title: "Actions rapides",
    description:
      "Publiez un article, lancez une promo, gérez votre boutique ou consultez vos commandes.",
    placement: "bottom",
  },
  {
    id: "bz-products",
    selector: ".bz-product-list",
    title: "Vos articles",
    description:
      "Liste de vos produits et services publiés. Modifiez, archivez ou boostez chaque article.",
    placement: "top",
  },
  {
    id: "bz-boutique",
    selector: ".bz-bout-recap",
    title: "Votre boutique",
    description:
      "Aperçu de votre page boutique publique. Personnalisez logo, couverture et description.",
    placement: "auto",
  },
  {
    id: "bz-nav",
    selector: ".ud-nav",
    title: "Menu latéral",
    description:
      "Naviguez entre les sections : articles, boutique, commandes, abonnement, analytics.",
    placement: "right",
  },
];

/* ═══════════════════════════════════════════════════════
   ADMIN DASHBOARD
   ═══════════════════════════════════════════════════════ */

export const adminDashboardSteps: TutorialStep[] = [
  {
    id: "ad-stats",
    selector: ".ad-stats-grid",
    title: "Statistiques globales",
    description:
      "Nombre d'utilisateurs, d'articles, de transactions et de revenus de la plateforme.",
    placement: "bottom",
  },
  {
    id: "ad-card",
    selector: ".ad-stat-card",
    title: "Carte statistique",
    description:
      "Chaque carte affiche un indicateur clé. Cliquez pour accéder au détail.",
    placement: "bottom",
  },
  {
    id: "ad-search",
    selector: ".ad-search-bar",
    title: "Recherche utilisateurs",
    description:
      "Trouvez un utilisateur par nom, email ou identifiant pour consulter ou gérer son compte.",
    placement: "bottom",
  },
  {
    id: "ad-table",
    selector: ".ad-table",
    title: "Table des utilisateurs",
    description:
      "Liste paginée de tous les comptes. Actions : voir, suspendre, modifier le rôle.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   USER DASHBOARD — Vue d'ensemble
   ═══════════════════════════════════════════════════════ */

export const userDashboardSteps: TutorialStep[] = [
  {
    id: "ud-nav",
    selector: ".ud-nav",
    title: "Menu privé",
    description:
      "Naviguez entre vos espaces. La section active est surlignée et vos actions clés sont au bouton violet.",
    placement: "right",
  },
  {
    id: "ud-profile",
    selector: ".ud-profile-card",
    title: "Profil & rôle",
    description:
      "Vérifiez votre identité et votre rôle. Le halo doré vous aide à repérer les zones importantes.",
    placement: "right",
  },
  {
    id: "ud-kpi",
    selector: ".ud-ov-kpi-row",
    title: "Indicateurs rapides",
    description:
      "Ventes, achats, panier, articles. Touchez une carte pour aller directement à la section.",
    placement: "bottom",
  },
  {
    id: "ud-account",
    selector: ".ud-ov-card--account",
    title: "Mon compte Kin‑Sell",
    description:
      "Plan, ID et taux de complétion. La barre violette montre votre progression.",
    placement: "bottom",
  },
  {
    id: "ud-quick",
    selector: ".ud-ov-quick-grid",
    title: "Actions rapides",
    description:
      "Publier, messagerie, panier et explorer en un clic. Les boutons principaux sont violets.",
    placement: "top",
  },
  {
    id: "ud-history",
    selector: ".ud-ov-table",
    title: "Historique récent",
    description:
      "Cliquez une ligne pour ouvrir le détail d'une transaction.",
    placement: "top",
  },
  {
    id: "ud-completion",
    selector: ".ud-ov-completion",
    title: "Compléter le profil",
    description:
      "Plus la barre violette est pleine, plus votre profil inspire confiance.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   USER — Espace de Vente
   ═══════════════════════════════════════════════════════ */

export const userSalesSteps: TutorialStep[] = [
  {
    id: "us-topbar",
    selector: ".ud-ord-topbar",
    title: "Espace de vente",
    description:
      "Vue globale des commandes. Les badges colorés indiquent l'état (en cours, livré, annulé).",
    placement: "bottom",
  },
  {
    id: "us-tabs",
    selector: ".ud-tx-tabs",
    title: "En cours / Historique",
    description:
      "Basculez entre vos transactions actives et l'historique.",
    placement: "bottom",
  },
  {
    id: "us-card",
    selector: ".ud-neg-card",
    title: "Carte transaction",
    description:
      "Chaque carte représente une négociation ou une commande. Les infos clés sont regroupées ici.",
    placement: "top",
  },
  {
    id: "us-actions",
    selector: ".ud-sord-actions",
    title: "Actions vendeur",
    description:
      "Passez à l'étape suivante, ouvrez le détail ou générez le QR/Code. Le bouton violet est prioritaire.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   BUSINESS DASHBOARD V2 — Complet
   ═══════════════════════════════════════════════════════ */

export const businessDashboardStepsV2: TutorialStep[] = [
  {
    id: "bz-nav",
    selector: ".ud-nav",
    title: "Menu Business",
    description:
      "Chaque section gère un aspect de votre boutique. Le violet indique l'action principale.",
    placement: "right",
  },
  {
    id: "bz-kpis",
    selector: ".ud-stats-row",
    title: "KPIs essentiels",
    description:
      "Revenus, ventes du mois, commandes actives et panier moyen.",
    placement: "bottom",
  },
  {
    id: "bz-orders",
    selector: ".ud-panel--transactions",
    title: "Commandes récentes",
    description:
      "Accédez aux détails et aux statuts. Cliquez « Voir tout » pour gérer.",
    placement: "top",
  },
  {
    id: "bz-analytics",
    selector: ".bz-analytics-mini",
    title: "Mini‑analytics",
    description:
      "Aperçu rapide des articles actifs, clients et commandes.",
    placement: "top",
  },
  {
    id: "bz-products",
    selector: ".bz-product-list",
    title: "Produits clés",
    description:
      "Liste de vos articles visibles. Stock faible signalé.",
    placement: "top",
  },
  {
    id: "bz-actions",
    selector: ".ud-actions-grid",
    title: "Actions rapides",
    description:
      "Publier un produit, un service, ou gérer les commandes.",
    placement: "bottom",
  },
];

/* ═══════════════════════════════════════════════════════
   BUSINESS — Commandes
   ═══════════════════════════════════════════════════════ */

export const businessOrdersSteps: TutorialStep[] = [
  {
    id: "bo-topbar",
    selector: ".ud-ord-topbar",
    title: "Gestion des commandes",
    description:
      "Vue d'ensemble des statuts. Les badges colorés indiquent le progrès.",
    placement: "bottom",
  },
  {
    id: "bo-panel",
    selector: ".ud-commerce-panel",
    title: "Liste des commandes",
    description:
      "Chaque carte correspond à une commande client.",
    placement: "top",
  },
  {
    id: "bo-filter",
    selector: ".ud-neg-filter-select",
    title: "Filtrer par statut",
    description:
      "Affinez pour traiter plus vite les commandes urgentes.",
    placement: "bottom",
  },
  {
    id: "bo-card",
    selector: ".ud-neg-card",
    title: "Carte commande",
    description:
      "Détails client, produits et montant.",
    placement: "top",
  },
  {
    id: "bo-actions",
    selector: ".ud-sord-actions",
    title: "Actions vendeur",
    description:
      "Passez à l'étape suivante ou partagez le QR/Code.",
    placement: "top",
  },
];

/* ═══════════════════════════════════════════════════════
   PANIER — Rempli
   ═══════════════════════════════════════════════════════ */

export const cartSteps: TutorialStep[] = [
  {
    id: "cart-hero",
    selector: ".cart-hero",
    title: "Votre panier",
    description:
      "Tout ce que vous avez sélectionné est ici.",
    placement: "bottom",
  },
  {
    id: "cart-summary",
    selector: ".cart-summary-row",
    title: "Résumé",
    description:
      "Nombre d'articles et total. Le badge violet attire l'œil.",
    placement: "bottom",
  },
  {
    id: "cart-seller",
    selector: ".cart-seller-header",
    title: "Groupé par vendeur",
    description:
      "Les articles sont regroupés par boutique pour simplifier la livraison.",
    placement: "bottom",
  },
  {
    id: "cart-item",
    selector: ".cart-item",
    title: "Carte article",
    description:
      "Produit, prix, état du marchandage. Le contour doré indique l'élément actif.",
    placement: "top",
  },
  {
    id: "cart-qty",
    selector: ".cart-qty-group",
    title: "Quantité",
    description:
      "Utilisez + et − pour ajuster la quantité.",
    placement: "top",
  },
  {
    id: "cart-checkout",
    selector: ".cart-checkout",
    title: "Validation",
    description:
      "Vérifiez le total et cliquez sur le bouton violet pour valider.",
    placement: "left",
  },
];

/* ═══════════════════════════════════════════════════════
   PANIER — Vide
   ═══════════════════════════════════════════════════════ */

export const cartEmptySteps: TutorialStep[] = [
  {
    id: "cart-empty",
    selector: ".cart-empty",
    title: "Panier vide",
    description:
      "Ajoutez des articles depuis l'Explorer ou So‑Kin.",
    placement: "bottom",
  },
  {
    id: "cart-actions",
    selector: ".cart-actions-row",
    title: "Explorer maintenant",
    description:
      "Le bouton violet vous ramène vers les annonces.",
    placement: "bottom",
  },
];

/* -------------------------------------------------------
   USER - Articles (espace de vente : publication & gestion)
   ------------------------------------------------------- */

export const userArticlesSteps: TutorialStep[] = [
  {
    id: "ua-topbar",
    selector: ".ud-art-topbar",
    title: "Votre espace de vente",
    description:
      "C'est ici que vous gerez tout ce que vous vendez : produits et services. En un coup d'oeil, vous voyez le nombre d'articles actifs, inactifs et archives.",
    placement: "bottom",
  },
  {
    id: "ua-stats",
    selector: ".ud-art-stats-inline",
    title: "Statistiques rapides",
    description:
      "Les indicateurs colores vous montrent combien de vos annonces sont visibles (vert) ou hors ligne. Un article INACTIF n'apparait plus aux acheteurs.",
    placement: "bottom",
  },
  {
    id: "ua-publish",
    selector: ".ud-art-publish-btn",
    title: "Publier un article",
    description:
      "Cliquez sur + pour creer une nouvelle annonce en quelques etapes : titre, categorie, prix, photos et localisation. C'est gratuit !",
    placement: "left",
  },
  {
    id: "ua-filters",
    selector: ".ud-art-filters",
    title: "Filtrer vos articles",
    description:
      "Affichez uniquement les actifs, inactifs, archives ou en promo pour retrouver rapidement un article a modifier.",
    placement: "bottom",
  },
  {
    id: "ua-list",
    selector: ".ud-art-list",
    title: "Liste de vos annonces",
    description:
      "Chaque ligne est un article : image, titre, type, prix et statut. Les actions rapides sont a droite pour modifier, promouvoir ou desactiver.",
    placement: "top",
  },
];

/* -------------------------------------------------------
   BUSINESS - Produits (catalogue)
   ------------------------------------------------------- */

export const businessProductsSteps: TutorialStep[] = [
  {
    id: "bp-topbar",
    selector: ".bz-art-topbar",
    title: "Catalogue produits",
    description:
      "Votre espace de vente produits. Stock, statut et prix sont geres ici. Les acheteurs voient uniquement les produits ACTIFS.",
    placement: "bottom",
  },
  {
    id: "bp-stats",
    selector: ".bz-art-stats-inline",
    title: "Compteurs du catalogue",
    description:
      "Actifs / inactifs / archives. Pensez a reactiver vos articles hors ligne pour qu'ils reviennent dans les resultats.",
    placement: "bottom",
  },
  {
    id: "bp-publish",
    selector: ".bz-art-publish-btn",
    title: "Ajouter un produit",
    description:
      "Creez un nouveau produit en 3 etapes (infos, prix/stock, medias) ou importez-en plusieurs a la fois via CSV / JSON / XML.",
    placement: "left",
  },
  {
    id: "bp-filters",
    selector: ".bz-art-filters",
    title: "Filtres catalogue",
    description:
      "Filtrez par statut ou affichez uniquement vos produits en PROMO pour ajuster vos campagnes en un clic.",
    placement: "bottom",
  },
  {
    id: "bp-grid",
    selector: ".bz-art-grid",
    title: "Vos produits",
    description:
      "Chaque carte affiche visuel, statut, prix et stock. Cliquez pour editer, desactiver, archiver ou lancer une promo.",
    placement: "top",
  },
];

/* -------------------------------------------------------
   BUSINESS - Services
   ------------------------------------------------------- */

export const businessServicesSteps: TutorialStep[] = [
  {
    id: "bs-topbar",
    selector: ".bz-art-topbar",
    title: "Vos services",
    description:
      "L'espace dedie a vos prestations. Definissez une description claire, une zone d'intervention et votre tarif pour etre trouve par les clients.",
    placement: "bottom",
  },
  {
    id: "bs-stats",
    selector: ".bz-art-stats-inline",
    title: "Visibilite de vos services",
    description:
      "Nombre de services actifs, en pause ou archives. Un service ACTIF apparait dans l'Explorer et sur votre vitrine.",
    placement: "bottom",
  },
  {
    id: "bs-publish",
    selector: ".bz-art-publish-btn",
    title: "Proposer un service",
    description:
      "Cliquez pour creer un nouveau service. Titre clair, categorie precise et description detaillee = plus de contacts.",
    placement: "left",
  },
  {
    id: "bs-filters",
    selector: ".bz-art-filters",
    title: "Filtrer par statut",
    description:
      "Affichez uniquement les services actifs pour vous concentrer sur ce qui est visible aupres des clients.",
    placement: "bottom",
  },
  {
    id: "bs-grid",
    selector: ".bz-art-grid",
    title: "Votre grille de services",
    description:
      "Chaque carte = un service. Editez, desactivez ou boostez directement depuis la carte pour gagner du temps.",
    placement: "top",
  },
];
