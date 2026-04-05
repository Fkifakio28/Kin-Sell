import type { TutorialScenario } from './tutorial-types';

// ══════════════════════════════════════════════
// IA TUTO KIN-SELL — Scénarios tutoriels
// ══════════════════════════════════════════════

// ─── HOME PAGE ────────────────────────────────

const homeOnboarding: TutorialScenario = {
  id: 'home-onboarding',
  name: 'Découvrir Kin-Sell',
  description: 'Visite guidée de la page d\'accueil',
  routes: ['/', '/home'],
  roles: ['USER', 'BUSINESS', 'GUEST'],
  mode: 'guided',
  category: 'onboarding',
  priority: 100,
  autoTrigger: true,
  cooldown: 24 * 60 * 60 * 1000,
  steps: [
    {
      id: 'home-welcome',
      target: '.hero-section, .home-hero, .live-background-shell',
      title: 'Bienvenue sur Kin-Sell ! 🎉',
      content: 'Kin-Sell est ta marketplace locale à Kinshasa. Achète, vends, publie et interagis avec ta communauté. Je vais te montrer les zones principales.',
      contentMobile: 'Bienvenue ! Je vais te guider rapidement.',
      position: 'center',
      skippable: true,
    },
    {
      id: 'home-search',
      target: '.explorer-search-bar, .search-bar, input[type="search"], .home-search',
      title: 'Recherche 🔍',
      content: 'Utilise la barre de recherche pour trouver des produits, services ou vendeurs. Tu peux chercher par nom, catégorie ou ville.',
      contentMobile: 'Cherche ici produits et services.',
      position: 'bottom',
      scrollIntoView: true,
    },
    {
      id: 'home-categories',
      target: '.category-grid, .categories-section, .home-categories',
      title: 'Catégories 🧩',
      content: 'Explore les catégories pour parcourir les offres par thème : électronique, mode, alimentation, services...',
      contentMobile: 'Parcours par catégorie ici.',
      position: 'bottom',
      scrollIntoView: true,
    },
    {
      id: 'home-listings',
      target: '.listings-grid, .home-listings, .featured-listings',
      title: 'Annonces 📦',
      content: 'Voici les dernières annonces. Clique sur une annonce pour voir les détails, le prix et contacter le vendeur.',
      contentMobile: 'Les annonces récentes.',
      position: 'top',
      scrollIntoView: true,
    },
    {
      id: 'home-nav',
      target: '.main-nav, header nav, .header-actions, .mobile-nav',
      title: 'Navigation 🧭',
      content: 'Utilise le menu pour accéder à ton espace personnel, la messagerie, So-Kin et plus encore.',
      contentMobile: 'Le menu principal.',
      position: 'bottom',
    },
  ],
};

// ─── PUBLISH LISTING ──────────────────────────

const publishListing: TutorialScenario = {
  id: 'publish-listing',
  name: 'Publier une annonce',
  description: 'Guide pas à pas pour publier ta première annonce',
  routes: ['/dashboard', '/business/dashboard'],
  roles: ['USER', 'BUSINESS'],
  mode: 'guided',
  category: 'dashboard',
  priority: 90,
  autoTrigger: false,
  steps: [
    {
      id: 'pub-start',
      target: '.ud-section, .bz-section, [data-section="articles"], [data-section="produits"]',
      title: 'Publier une annonce 📝',
      content: 'Je vais te guider pour publier ton annonce. Commençons par accéder à la section articles ou produits.',
      position: 'center',
    },
    {
      id: 'pub-btn',
      target: 'button[data-action="new-listing"], .ud-new-listing-btn, button:has(+ .listing-form)',
      title: 'Créer une annonce',
      content: 'Clique sur ce bouton pour commencer à créer ton annonce.',
      contentMobile: 'Appuie ici pour créer.',
      position: 'bottom',
      waitForAction: 'click',
    },
    {
      id: 'pub-title',
      target: 'input[name="title"], .listing-form input:first-of-type',
      title: 'Titre de l\'annonce',
      content: 'Choisis un titre clair et descriptif. Exemple : "iPhone 14 Pro Max 256GB — État neuf".',
      contentMobile: 'Écris le titre ici.',
      position: 'bottom',
      waitForAction: 'input',
    },
    {
      id: 'pub-image',
      target: 'input[type="file"], .image-upload, .media-upload',
      title: 'Ajouter des photos 📸',
      content: 'Ajoute au moins une photo. Les annonces avec photos reçoivent 5× plus de vues !',
      contentMobile: 'Ajoute une photo.',
      position: 'bottom',
    },
    {
      id: 'pub-price',
      target: 'input[name="price"], input[name="priceUsdCents"], .price-input',
      title: 'Fixe ton prix 💰',
      content: 'Indique le prix en dollars ou en francs congolais. Tu peux aussi activer la négociation.',
      contentMobile: 'Indique le prix.',
      position: 'bottom',
    },
    {
      id: 'pub-submit',
      target: 'button[type="submit"], .listing-submit-btn',
      title: 'Publier ! 🚀',
      content: 'Vérifie les informations puis clique pour publier ton annonce. Elle sera visible immédiatement.',
      contentMobile: 'Valide et publie !',
      position: 'top',
      waitForAction: 'click',
    },
  ],
};

// ─── SO-KIN ───────────────────────────────────

const sokinOnboarding: TutorialScenario = {
  id: 'sokin-onboarding',
  name: 'Découvrir So-Kin',
  description: 'Apprends à publier, interagir et connecter sur So-Kin',
  routes: ['/sokin'],
  roles: ['USER', 'BUSINESS', 'GUEST'],
  mode: 'guided',
  category: 'sokin',
  priority: 80,
  autoTrigger: true,
  cooldown: 12 * 60 * 60 * 1000,
  steps: [
    {
      id: 'sk-welcome',
      target: '.sokin-feed, .sk-feed, .sokin-container',
      title: 'Bienvenue sur So-Kin ✦',
      content: 'So-Kin est le réseau social de Kin-Sell. Publie des "waves", partage tes produits, lance des lives et connecte-toi avec la communauté.',
      contentMobile: 'So-Kin = réseau social Kin-Sell.',
      position: 'center',
    },
    {
      id: 'sk-compose',
      target: '.sk-compose, .sokin-compose, textarea[placeholder], .wave-composer',
      title: 'Publier une wave 🌊',
      content: 'Écris ici pour publier une wave. Tu peux ajouter du texte, des images, des fichiers et même des annonces.',
      contentMobile: 'Publie ta wave ici.',
      position: 'bottom',
      scrollIntoView: true,
    },
    {
      id: 'sk-nav',
      target: '.sk-tabs, .sokin-nav, .sokin-tabs',
      title: 'Navigation So-Kin 🧭',
      content: 'Navigue entre le fil d\'actualité, les profils, le marché, les tendances et les lives.',
      contentMobile: 'Les onglets So-Kin.',
      position: 'bottom',
    },
    {
      id: 'sk-live',
      target: '.sk-live-btn, .go-live-btn, button:contains("Live")',
      title: 'Lancer un live 🎬',
      content: 'Démarre un live pour interagir en temps réel avec ta communauté. Montre tes produits, réponds aux questions !',
      contentMobile: 'Lance un live ici.',
      position: 'bottom',
    },
  ],
};

// ─── TRANSACTION ──────────────────────────────

const transactionGuide: TutorialScenario = {
  id: 'transaction-guide',
  name: 'Suivre une transaction',
  description: 'Comprendre les étapes d\'une transaction de A à Z',
  routes: ['/dashboard', '/business/dashboard'],
  roles: ['USER', 'BUSINESS'],
  mode: 'guided',
  category: 'transaction',
  priority: 85,
  autoTrigger: false,
  steps: [
    {
      id: 'tx-overview',
      target: '.ud-section, [data-section="purchases"], [data-section="sales"], [data-section="commandes"]',
      title: 'Tes transactions 📋',
      content: 'Ici tu retrouves toutes tes commandes. Chaque transaction passe par ces étapes : En attente → Confirmée → En cours → Livrée.',
      contentMobile: 'Tes commandes sont ici.',
      position: 'center',
    },
    {
      id: 'tx-status',
      target: '.ud-badge, .order-status, .transaction-status',
      title: 'Statut de la commande',
      content: 'Le badge de couleur indique l\'état actuel. Jaune = en attente, Bleu = confirmé, Vert = livré, Rouge = annulé.',
      contentMobile: 'La couleur = le statut.',
      position: 'bottom',
    },
    {
      id: 'tx-confirm',
      target: 'button[data-action="confirm"], .confirm-order-btn, .validate-btn',
      title: 'Confirmer / Valider',
      content: 'En tant que vendeur, confirme la commande. En tant qu\'acheteur, valide la réception. C\'est ce qui complète la transaction.',
      contentMobile: 'Confirme ou valide ici.',
      position: 'bottom',
    },
    {
      id: 'tx-negotiate',
      target: '.negotiate-btn, [data-action="negotiate"]',
      title: 'Négocier le prix 🤝',
      content: 'Tu peux négocier avant d\'acheter. Propose un prix et le vendeur acceptera, refusera ou fera une contre-offre.',
      contentMobile: 'Négocie le prix.',
      position: 'bottom',
    },
    {
      id: 'tx-review',
      target: '.review-btn, [data-action="review"]',
      title: 'Laisser un avis ⭐',
      content: 'Après la livraison, laisse un avis. Ça aide la communauté et améliore la réputation du vendeur.',
      contentMobile: 'Laisse un avis.',
      position: 'top',
    },
  ],
};

// ─── USER DASHBOARD ───────────────────────────

const userDashboardGuide: TutorialScenario = {
  id: 'user-dashboard',
  name: 'Ton espace personnel',
  description: 'Découvre les fonctionnalités de ton dashboard',
  routes: ['/dashboard'],
  roles: ['USER'],
  mode: 'guided',
  category: 'dashboard',
  priority: 75,
  autoTrigger: true,
  cooldown: 48 * 60 * 60 * 1000,
  steps: [
    {
      id: 'ud-welcome',
      target: '.ud-container, .dashboard-container',
      title: 'Ton espace privé 🏠',
      content: 'Bienvenue dans ton espace ! Ici tu gères tes annonces, commandes, messages, profil et bien plus.',
      contentMobile: 'Ton espace personnel.',
      position: 'center',
    },
    {
      id: 'ud-nav',
      target: '.ud-sidebar, .ud-nav, .dashboard-sidebar',
      title: 'Menu latéral 📋',
      content: 'Navigue entre les sections avec ce menu. Chaque onglet gère un aspect différent de ton compte.',
      contentMobile: 'Le menu de navigation.',
      position: 'right',
    },
    {
      id: 'ud-overview',
      target: '.ud-stats-row, .dashboard-stats',
      title: 'Vue d\'ensemble 📊',
      content: 'Tes statistiques en un coup d\'œil : annonces actives, commandes, ventes, évaluations.',
      contentMobile: 'Tes stats rapides.',
      position: 'bottom',
    },
    {
      id: 'ud-verification',
      target: '[data-section="verification"], .ud-nav button:contains("Vérification")',
      title: 'Badge vérifié ✅',
      content: 'Demande la vérification pour obtenir ton badge. Plus ton score de crédibilité est élevé, plus tu as de chances !',
      contentMobile: 'Obtiens le badge vérifié.',
      position: 'bottom',
    },
  ],
};

// ─── BUSINESS DASHBOARD ───────────────────────

const businessDashboardGuide: TutorialScenario = {
  id: 'business-dashboard',
  name: 'Espace entreprise',
  description: 'Découvre les outils de gestion de ta boutique',
  routes: ['/business/dashboard'],
  roles: ['BUSINESS'],
  mode: 'guided',
  category: 'dashboard',
  priority: 75,
  autoTrigger: true,
  cooldown: 48 * 60 * 60 * 1000,
  steps: [
    {
      id: 'bz-welcome',
      target: '.ud-container, .dashboard-container',
      title: 'Espace entreprise 🏪',
      content: 'Bienvenue ! Gère ta boutique, tes produits, commandes, publicités et statistiques depuis cet espace.',
      contentMobile: 'Ton espace business.',
      position: 'center',
    },
    {
      id: 'bz-shop',
      target: '[data-section="boutique"]',
      title: 'Ta boutique 🏬',
      content: 'Personnalise l\'apparence de ta boutique : logo, bannière, description. C\'est ce que les clients voient en premier.',
      contentMobile: 'Personnalise ta boutique.',
      position: 'bottom',
    },
    {
      id: 'bz-products',
      target: '[data-section="produits"]',
      title: 'Tes produits 📦',
      content: 'Ajoute et gère tes produits. Plus tu as d\'annonces complètes avec photos, plus tu as de visibilité.',
      contentMobile: 'Gère tes produits.',
      position: 'bottom',
    },
    {
      id: 'bz-orders',
      target: '[data-section="commandes"]',
      title: 'Commandes 🛒',
      content: 'Suis et traite les commandes de tes clients. Confirme, expédie et finalise les transactions.',
      contentMobile: 'Traite tes commandes.',
      position: 'bottom',
    },
    {
      id: 'bz-stats',
      target: '[data-section="analytics"]',
      title: 'Analytics 📊',
      content: 'Consulte tes performances : ventes, visites, taux de conversion, tendances.',
      contentMobile: 'Tes statistiques.',
      position: 'bottom',
    },
  ],
};

// ─── PUBLIC PROFILE ───────────────────────────

const publicProfileGuide: TutorialScenario = {
  id: 'public-profile',
  name: 'Comprendre un profil',
  description: 'Ce que tu vois sur un profil public',
  routes: ['/user/'],
  roles: ['USER', 'BUSINESS', 'GUEST'],
  mode: 'contextual',
  category: 'public',
  priority: 50,
  autoTrigger: false,
  steps: [
    {
      id: 'pp-badge',
      target: '.up-verified, .up-name-row',
      title: 'Badge de vérification',
      content: '✅ = vérifié par Kin-Sell, 🤖 = crédibilité IA validée, ◐ = profil actif. Les badges indiquent le niveau de confiance.',
      contentMobile: 'Le badge = niveau de confiance.',
      position: 'bottom',
    },
    {
      id: 'pp-rating',
      target: '.up-pill--rating, .up-meta',
      title: 'Note et avis ⭐',
      content: 'La note moyenne et le nombre d\'avis reflètent l\'expérience des autres utilisateurs avec ce vendeur.',
      contentMobile: 'La réputation du vendeur.',
      position: 'bottom',
    },
    {
      id: 'pp-listings',
      target: '.up-catalog, .up-listings',
      title: 'Annonces du vendeur 📦',
      content: 'Parcours les produits et services proposés par ce vendeur. Clique pour voir les détails.',
      contentMobile: 'Ses annonces.',
      position: 'top',
    },
  ],
};

// ─── MESSAGING ────────────────────────────────

const messagingGuide: TutorialScenario = {
  id: 'messaging-guide',
  name: 'Utiliser la messagerie',
  description: 'Envoyer des messages et passer des appels',
  routes: ['/messaging', '/dashboard'],
  roles: ['USER', 'BUSINESS'],
  mode: 'contextual',
  category: 'dashboard',
  priority: 60,
  autoTrigger: false,
  steps: [
    {
      id: 'msg-list',
      target: '.conversation-list, .msg-list',
      title: 'Conversations 💬',
      content: 'Tes conversations avec les vendeurs et acheteurs. Les messages non lus apparaissent en gras.',
      contentMobile: 'Tes conversations.',
      position: 'right',
    },
    {
      id: 'msg-compose',
      target: '.message-input, textarea, .msg-compose',
      title: 'Envoyer un message',
      content: 'Écris ton message et envoie-le. Tu peux aussi partager des images et des fichiers.',
      contentMobile: 'Écris ici.',
      position: 'top',
    },
    {
      id: 'msg-call',
      target: '.call-btn, .video-call-btn, [data-action="call"]',
      title: 'Appels audio/vidéo 📞',
      content: 'Lance un appel audio ou vidéo directement depuis la conversation pour discuter en temps réel.',
      contentMobile: 'Appelle depuis ici.',
      position: 'bottom',
    },
  ],
};

// ─── ADMIN DASHBOARD ──────────────────────────

const adminGuide: TutorialScenario = {
  id: 'admin-dashboard',
  name: 'Espace administration',
  description: 'Guide de l\'interface admin',
  routes: ['/admin/dashboard'],
  roles: ['ADMIN', 'SUPER_ADMIN'],
  mode: 'guided',
  category: 'admin',
  priority: 70,
  autoTrigger: true,
  cooldown: 72 * 60 * 60 * 1000,
  steps: [
    {
      id: 'ad-welcome',
      target: '.ad-container, .admin-dashboard',
      title: 'Administration Kin-Sell 🛡️',
      content: 'Bienvenue dans l\'espace admin. Gère les utilisateurs, modère le contenu, surveille les transactions et les signalements.',
      position: 'center',
    },
    {
      id: 'ad-nav',
      target: '.ad-sidebar, .admin-nav',
      title: 'Menu admin',
      content: 'Chaque section couvre un domaine : utilisateurs, sécurité, blog, transactions, vérifications, IA...',
      contentMobile: 'Le menu admin.',
      position: 'right',
    },
    {
      id: 'ad-verification',
      target: '[data-section="verification"]',
      title: 'Vérifications ✅',
      content: 'Gère les demandes de vérification. Approuve, rejette ou verrouille les badges selon les métriques IA.',
      position: 'bottom',
    },
  ],
};

// ─── EXPLORER ─────────────────────────────────

const explorerGuide: TutorialScenario = {
  id: 'explorer-guide',
  name: 'Explorer le marché',
  description: 'Comment chercher et filtrer les annonces',
  routes: ['/explorer'],
  roles: ['USER', 'BUSINESS', 'GUEST'],
  mode: 'contextual',
  category: 'onboarding',
  priority: 65,
  autoTrigger: false,
  steps: [
    {
      id: 'exp-search',
      target: '.explorer-search-bar, .search-input',
      title: 'Recherche avancée 🔍',
      content: 'Tape ce que tu cherches. Tu peux filtrer par ville, catégorie, prix et type (produit ou service).',
      contentMobile: 'Cherche ici.',
      position: 'bottom',
    },
    {
      id: 'exp-map',
      target: '.map-container, .explorer-map',
      title: 'Carte interactive 🗺️',
      content: 'Visualise les annonces sur la carte. Les marqueurs montrent les offres proches de toi.',
      contentMobile: 'La carte des annonces.',
      position: 'top',
    },
    {
      id: 'exp-results',
      target: '.explorer-results, .listings-grid',
      title: 'Résultats',
      content: 'Parcours les résultats. Clique sur une annonce pour voir les détails, le prix et contacter le vendeur.',
      contentMobile: 'Les résultats ici.',
      position: 'top',
    },
  ],
};

// ─── VERIFICATION REQUEST ─────────────────────

const verificationGuide: TutorialScenario = {
  id: 'verification-request',
  name: 'Demander la vérification',
  description: 'Comment obtenir ton badge vérifié',
  routes: ['/dashboard', '/business/dashboard'],
  roles: ['USER', 'BUSINESS'],
  mode: 'guided',
  category: 'dashboard',
  priority: 55,
  autoTrigger: false,
  steps: [
    {
      id: 'vr-section',
      target: '[data-section="verification"]',
      title: 'Section vérification ✅',
      content: 'Ici tu peux voir ton statut de vérification, ton score de crédibilité IA et soumettre une demande.',
      position: 'center',
    },
    {
      id: 'vr-score',
      target: '.ud-glass-panel svg, .credibility-score',
      title: 'Score de crédibilité 📊',
      content: 'Ce score est calculé automatiquement par notre IA : transactions complétées, avis, ancienneté, activité... Plus il est élevé, plus tu as de chances.',
      contentMobile: 'Ton score IA.',
      position: 'bottom',
    },
    {
      id: 'vr-request',
      target: '.btn-primary, button:contains("vérification")',
      title: 'Soumettre la demande',
      content: 'Clique pour envoyer ta demande. L\'IA évalue d\'abord, puis un admin valide. Tu seras notifié du résultat.',
      contentMobile: 'Envoie ta demande.',
      position: 'top',
      waitForAction: 'click',
    },
  ],
};

// ─── BUSINESS SHOP ────────────────────────────

const businessShopGuide: TutorialScenario = {
  id: 'business-shop-public',
  name: 'Comprendre une boutique',
  description: 'Explorer une page boutique publique',
  routes: ['/business/'],
  roles: ['USER', 'BUSINESS', 'GUEST'],
  mode: 'contextual',
  category: 'public',
  priority: 45,
  autoTrigger: false,
  steps: [
    {
      id: 'bs-hero',
      target: '.business-lux-hero',
      title: 'Identité de la boutique 🏪',
      content: 'Le nom, le badge de vérification et la description de la boutique. Le badge indique si l\'entreprise est vérifiée.',
      position: 'bottom',
    },
    {
      id: 'bs-catalog',
      target: '.business-lux-catalog, .shop-products',
      title: 'Catalogue 📦',
      content: 'Explore les produits et services proposés. Clique sur un article pour voir les détails et acheter ou négocier.',
      contentMobile: 'Les offres de la boutique.',
      position: 'top',
    },
    {
      id: 'bs-reviews',
      target: '.business-lux-reviews, .shop-reviews',
      title: 'Avis clients ⭐',
      content: 'Lis les avis des autres acheteurs pour évaluer la fiabilité de cette boutique.',
      contentMobile: 'Les avis clients.',
      position: 'top',
    },
  ],
};

// ═══ EXPORT ALL SCENARIOS ═══

export const ALL_SCENARIOS: TutorialScenario[] = [
  homeOnboarding,
  publishListing,
  sokinOnboarding,
  transactionGuide,
  userDashboardGuide,
  businessDashboardGuide,
  publicProfileGuide,
  messagingGuide,
  adminGuide,
  explorerGuide,
  verificationGuide,
  businessShopGuide,
];

/** Get scenarios matching a route and role */
export function getMatchingScenarios(
  pathname: string,
  role: string | undefined
): TutorialScenario[] {
  const userRole = role ?? 'GUEST';
  return ALL_SCENARIOS
    .filter(s => {
      const routeMatch = s.routes.some(r => pathname === r || pathname.startsWith(r));
      const roleMatch = s.roles.includes(userRole as any);
      return routeMatch && roleMatch;
    })
    .sort((a, b) => b.priority - a.priority);
}

/** Get an auto-triggerable scenario for the current context */
export function getAutoTriggerScenario(
  pathname: string,
  role: string | undefined,
  completedIds: string[],
  dismissedIds: string[],
  disabledIds: string[],
  disabledPages: string[],
  lastShownAt: number,
): TutorialScenario | null {
  if (disabledPages.some(p => pathname.startsWith(p))) return null;
  const now = Date.now();
  const scenarios = getMatchingScenarios(pathname, role);
  for (const s of scenarios) {
    if (!s.autoTrigger) continue;
    if (completedIds.includes(s.id)) continue;
    if (dismissedIds.includes(s.id)) continue;
    if (disabledIds.includes(s.id)) continue;
    if (s.cooldown && now - lastShownAt < s.cooldown) continue;
    return s;
  }
  return null;
}
