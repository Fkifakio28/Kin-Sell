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
