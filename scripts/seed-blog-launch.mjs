#!/usr/bin/env node
/**
 * Seed Kin-Sell blog avec articles de lancement.
 * Usage : node seed-blog-launch.mjs <batch>
 *   batch = 1 | 2 | 3 | check
 *
 * Doit être exécuté depuis /home/kinsell/Kin-Sell/apps/api (pour résoudre @prisma/client).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Slug helper (sans dépendre du backend)
const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// Banque d'images Unsplash (URLs CDN directes, libres d'usage)
const IMG = {
  marketplace: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80",
  shopping: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1600&q=80",
  team: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80",
  africa: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80",
  phone: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1600&q=80",
  payments: "https://images.unsplash.com/photo-1556742205-e10c9486e506?auto=format&fit=crop&w=1600&q=80",
  city: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?auto=format&fit=crop&w=1600&q=80",
  ecommerce: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1600&q=80",
  rocket: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
  delivery: "https://images.unsplash.com/photo-1601158935942-52255782d322?auto=format&fit=crop&w=1600&q=80",
  photoStudio: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=1600&q=80",
  analytics: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80",
  ai: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=80",
  chat: "https://images.unsplash.com/photo-1611606063065-ee7946f0787a?auto=format&fit=crop&w=1600&q=80",
  map: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1600&q=80",
  notif: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=1600&q=80",
  community: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1600&q=80",
  growth: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80",
  laptop: "https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1600&q=80",
  smartphone: "https://images.unsplash.com/photo-1565849904461-04a58ad377e0?auto=format&fit=crop&w=1600&q=80",
  meeting: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80",
  startup: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1600&q=80",
  packaging: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1600&q=80",
  rocketLaunch: "https://images.unsplash.com/photo-1457364887197-9150188c107b?auto=format&fit=crop&w=1600&q=80",
  digital: "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&w=1600&q=80",
  network: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80",
  customer: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=1600&q=80",
  trends: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=80",
  data: "https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=1600&q=80",
  future: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1600&q=80",
};

// ════════════════════════════════════════════════════════════
// BATCH 1 — Identité, vocation, vision, futur (10 articles)
// ════════════════════════════════════════════════════════════
const BATCH_1 = [
  {
    title: "Bienvenue sur Kin-Sell — connecter Kinshasa au commerce digital",
    excerpt: "Kin-Sell est la première marketplace sociale pensée à Kinshasa, par des Kinois, pour rapprocher acheteurs et vendeurs en toute confiance.",
    coverImage: IMG.city,
    category: "vocation",
    tags: ["kin-sell", "vocation", "kinshasa", "lancement"],
    content: `# Bienvenue sur Kin-Sell\n\nKin-Sell, c'est plus qu'une marketplace : c'est **un quartier digital**. Ici, chaque vendeur est un voisin, chaque acheteur un client de confiance, et chaque transaction un acte de proximité — boosté par la technologie.\n\n## Pourquoi Kin-Sell ?\n\nÀ Kinshasa, le commerce informel pèse plus de 70 % de l'économie. Pourtant, la majorité des vendeurs n'ont pas de vitrine numérique. Kin-Sell existe pour combler ce fossé.\n\n- **Publier une annonce gratuitement** en moins de 2 minutes\n- **Carte interactive** pour explorer les vendeurs autour de soi\n- **Messagerie + appels intégrés** pour négocier sans quitter la plateforme\n- **Paiements et coupons** pour sécuriser chaque transaction\n\n## Notre engagement\n\nKin-Sell est conçu **mobile-first**, optimisé pour les connexions 2G/3G qui restent majoritaires dans nos quartiers. Pas de friction, pas de surcoût, pas de barrière.\n\n## Et après ?\n\nNous publierons régulièrement des **guides, retours d'expérience et nouveautés** sur ce blog. Activez les notifications, suivez Kin-Sell sur Sokin, et **devenez ambassadeur** de votre commerce.\n\n> *« Vendre près de chez soi, acheter en confiance, grandir ensemble. »*\n\nBienvenue dans Kin-Sell. 🇨🇩`,
  },
  {
    title: "Pourquoi Kin-Sell est né : le problème que nous résolvons",
    excerpt: "Trop de vendeurs talentueux à Kinshasa restent invisibles. Kin-Sell change la donne en leur offrant une vitrine sociale, sécurisée et gratuite.",
    coverImage: IMG.shopping,
    category: "vocation",
    tags: ["kin-sell", "histoire", "marketplace"],
    content: `# Pourquoi Kin-Sell est né\n\n## Le constat\n\nÀ Kinshasa, des milliers de vendeurs — boutiques, particuliers, créateurs — vendent chaque jour via WhatsApp, Facebook, ou simplement de bouche à oreille. Mais ces canaux sont **éphémères, peu sécurisés et fragmentés**.\n\nUn acheteur perd du temps à chercher. Un vendeur peine à se faire remarquer. Une transaction se conclut sans trace.\n\n## La solution Kin-Sell\n\nNous avons construit une plateforme qui :\n\n1. **Centralise** les annonces dans un explorateur unique\n2. **Géolocalise** les vendeurs sur une carte temps réel\n3. **Sécurise** les échanges (messagerie chiffrée, signalement, MessageGuard IA)\n4. **Booste** les meilleurs vendeurs grâce à Sokin et aux abonnements Pro\n\n## Une plateforme africaine\n\nPas une copie d'Amazon. Pas une déclinaison d'eBay. Kin-Sell est pensée **pour le contexte africain** : faible bande passante, paiements mobiles, économie de proximité, oralité commerciale.\n\nNotre code, notre serveur, notre équipe — tout est ici. Et c'est ce qui fait la différence.`,
  },
  {
    title: "La vision Kin-Sell : devenir le 1er marketplace social d'Afrique francophone",
    excerpt: "De Kinshasa à Dakar en passant par Abidjan : voici la trajectoire ambitieuse que Kin-Sell trace pour les 5 prochaines années.",
    coverImage: IMG.africa,
    category: "vision",
    tags: ["vision", "expansion", "afrique"],
    content: `# La vision Kin-Sell\n\n## Aujourd'hui : Kinshasa\n\nKin-Sell V3.0 est lancé à Kinshasa avec un objectif simple : **prouver qu'une marketplace 100 % africaine peut rivaliser avec les géants mondiaux**, en étant plus rapide, plus sociale, plus locale.\n\n## Demain : la RDC\n\nDès 2026, nous étendrons Kin-Sell à **Lubumbashi, Goma, Bukavu, Mbuji-Mayi et Kisangani**. Notre architecture multi-pays est déjà en place.\n\n## Après-demain : l'Afrique francophone\n\nNotre ambition est d'être présents dans **15 pays d'Afrique francophone d'ici 2029** : Côte d'Ivoire, Sénégal, Cameroun, Bénin, Togo, Gabon, Congo-Brazzaville, Madagascar...\n\n## Pourquoi nous y arriverons\n\n- **Stack technique moderne** (React, Node, Postgres, IA Gemini)\n- **Plugin Bluetooth/audio natif** pour appels HD même en faible débit\n- **Pricing accessible** : Free pour 90 % des usages, Pro à partir de 5 USD/mois\n- **Communauté Sokin** qui valorise les meilleurs vendeurs\n\n> *« Un marketplace, c'est de la confiance. Et la confiance se construit avec la proximité. »*\n\nRejoignez-nous. L'aventure commence ici.`,
  },
  {
    title: "Kin-Sell V3 : les appels audio HD avec support Bluetooth débarquent",
    excerpt: "Mise à jour majeure : Kin-Sell V3.0 introduit les appels audio natifs avec routing intelligent (écouteur, haut-parleur, casque filaire, Bluetooth).",
    coverImage: IMG.smartphone,
    category: "actualite",
    tags: ["v3", "appels", "bluetooth", "innovation"],
    content: `# Kin-Sell V3.0 — Les appels audio sont là\n\n## Ce qui change\n\nDepuis cette version, vous pouvez **appeler n'importe quel vendeur ou acheteur** directement depuis la messagerie Kin-Sell, sans quitter l'app.\n\n## Routing audio intelligent\n\nLe nouveau **plugin Android natif** détecte automatiquement vos périphériques audio :\n\n- 🎧 **Écouteur** (par défaut)\n- 📢 **Haut-parleur** (mode mains-libres)\n- 🎙️ **Casque filaire** (jack 3.5mm ou USB-C)\n- 🔵 **Bluetooth SCO** (oreillette, casque BT, hearing aids)\n\nLe basculement se fait en un tap. Si vous débranchez votre casque pendant l'appel, l'audio bascule automatiquement sur l'écouteur.\n\n## Anti-zombie : finis les appels fantômes\n\nNotre nouveau **protocole callId + expiresAt** garantit qu'un appel non répondu ne reste pas accroché en notification. Plus jamais de notification fantôme à 3 h du matin.\n\n## Pour qui ?\n\nLes appels Kin-Sell sont **gratuits et illimités** pour tous les utilisateurs. Pas de minutes facturées, pas de tarif premium. Juste de la connexion.\n\nMettez à jour votre APK pour profiter de la V3.0.`,
  },
  {
    title: "Kin-Sell, votre quartier digital : explorer Kinshasa en mode carte",
    excerpt: "La carte interactive Kin-Sell change la façon de découvrir des vendeurs : géolocalisation temps réel, filtrage par catégorie, distance précise.",
    coverImage: IMG.map,
    category: "guide",
    tags: ["explorer", "carte", "geolocalisation"],
    content: `# Explorer Kin-Sell en mode carte\n\n## Trouvez ce que vous cherchez, près de chez vous\n\nLa **carte Kin-Sell** affiche en temps réel tous les vendeurs et annonces autour de votre position. Plus besoin de scroller des pages de résultats : visualisez l'offre commerciale de votre commune.\n\n## Comment ça marche ?\n\n1. Ouvrez l'app et cliquez sur **Explorer**\n2. Activez la géolocalisation (permission demandée une seule fois)\n3. Choisissez une catégorie (mode, électronique, alimentation, services...)\n4. Filtrez par distance (500 m, 1 km, 5 km, ville entière)\n\n## Les avantages\n\n- **Économisez le temps** : trouvez le vendeur le plus proche\n- **Économisez le transport** : pas de course à travers la ville\n- **Soutenez votre quartier** : favorisez le commerce de proximité\n\n## Astuce vendeur\n\nPour apparaître sur la carte, **renseignez précisément votre adresse** (commune, quartier, repère) lors de la publication. Plus la localisation est exacte, plus vous serez vu par les bons acheteurs.`,
  },
  {
    title: "Comment Kin-Sell garantit la sécurité de vos transactions",
    excerpt: "MessageGuard IA, signalement, paiements sécurisés, vérification d'identité : découvrez les 5 piliers de la sécurité Kin-Sell.",
    coverImage: IMG.payments,
    category: "securite",
    tags: ["securite", "transactions", "confiance"],
    content: `# La sécurité Kin-Sell\n\nFaire confiance à un inconnu sur Internet, c'est le défi de toute marketplace. Voici **comment Kin-Sell réduit ce risque à son strict minimum**.\n\n## 1. MessageGuard IA\n\nNotre IA scanne en temps réel les messages de la messagerie pour détecter :\n- Tentatives d'arnaque (fausses promesses, faux liens)\n- Demandes inappropriées\n- Spam et harcèlement\n\nLes messages suspects sont **avertis** ou **bloqués** automatiquement.\n\n## 2. Signalement en 1 tap\n\nChaque annonce, chaque profil, chaque message peut être **signalé instantanément**. Notre équipe modère sous 24 h.\n\n## 3. Vérification d'identité (Pro)\n\nLes vendeurs Pro Vendeur et Business affichent un **badge vérifié** : leur identité a été contrôlée via document officiel.\n\n## 4. Paiements traçables\n\nLes coupons CPC/CPI/CPA et la future intégration Mobile Money permettent de **garder une trace** de chaque transaction.\n\n## 5. Communauté active\n\nLa communauté Sokin signale, note et commente. Un vendeur malhonnête est rapidement repéré.\n\n## Que faire en cas de problème ?\n\n- Cliquez sur **Signaler** dans le profil ou l'annonce\n- Contactez-nous via le centre d'aide\n- Notre équipe répond sous 24 h ouvrées`,
  },
  {
    title: "Kin-Sell est lancé à Kinshasa — voici la roadmap d'expansion",
    excerpt: "De la commune de Gombe au continent : la feuille de route précise du déploiement géographique de Kin-Sell sur les 24 prochains mois.",
    coverImage: IMG.rocketLaunch,
    category: "vision",
    tags: ["roadmap", "expansion", "rdc"],
    content: `# Kin-Sell — Roadmap d'expansion\n\n## Phase 1 : Kinshasa (2026 - en cours)\n\n- ✅ Lancement V3.0 (avril 2026)\n- ✅ Couverture des 24 communes de Kinshasa\n- 🚧 Acquisition 50 000 utilisateurs actifs (objectif fin 2026)\n- 🚧 Onboarding de 1 000 vendeurs Business\n\n## Phase 2 : RDC (2026 - 2027)\n\n- Q3 2026 : Lubumbashi (capitale économique)\n- Q4 2026 : Goma + Bukavu (Est)\n- Q1 2027 : Mbuji-Mayi + Kisangani (Centre/Nord)\n- Q2 2027 : Boma + Matadi (Côte ouest)\n\n## Phase 3 : Afrique francophone (2027 - 2029)\n\n- 2027 : Brazzaville, Pointe-Noire, Libreville\n- 2028 : Abidjan, Dakar, Yaoundé\n- 2029 : Cotonou, Lomé, Bamako, Niamey\n\n## Phase 4 : continent (2029+)\n\nLagos, Le Caire, Casablanca, Nairobi, Johannesburg... Le ciel est la limite.\n\n## Comment vous pouvez nous aider\n\n- **Utilisez Kin-Sell** et invitez vos contacts\n- **Devenez ambassadeur** dans votre commune (rejoignez le programme Sokin Plus)\n- **Investissez** : nous ouvrons une levée de fonds Seed en Q3 2026 (contact : invest@kin-sell.com)`,
  },
  {
    title: "L'équipe derrière Kin-Sell : engagement local, ambition continentale",
    excerpt: "Kin-Sell est porté par une équipe 100 % congolaise, basée à Kinshasa, avec une vision panafricaine. Découvrez les visages du projet.",
    coverImage: IMG.team,
    category: "equipe",
    tags: ["equipe", "kinshasa", "fondateurs"],
    content: `# L'équipe Kin-Sell\n\n## Une équipe née à Kinshasa\n\nKin-Sell est imaginé, conçu et opéré **depuis Kinshasa, par une équipe congolaise**. Pas de délocalisation, pas de sous-traitance offshore. Chaque ligne de code est écrite ici.\n\n## Nos rôles\n\n- **Direction technique** : architecture, sécurité, performances\n- **Produit** : design system, UX mobile-first, accessibilité\n- **Communauté** : modération, support, ambassadeurs\n- **Données & IA** : MarketIntel, MessageGuard, IA Ads\n\n## Nos valeurs\n\n1. **Excellence locale** : un produit pensé pour Kinshasa peut rayonner sur l'Afrique\n2. **Confidentialité** : vos données restent en RDC (serveurs locaux et hybrides)\n3. **Open mindset** : nous écoutons, nous itérons, nous publions\n4. **Mobile-first 2G** : si ça marche en 2G, ça marche partout\n\n## Rejoindre l'équipe\n\nNous recrutons régulièrement des profils tech, produit et community. Envoyez votre CV à **jobs@kin-sell.com** ou postulez via la page Carrières.\n\nKin-Sell, c'est aussi votre histoire.`,
  },
  {
    title: "Kin-Sell vs marketplaces classiques : 7 différences qui changent tout",
    excerpt: "Pourquoi Kin-Sell n'est pas un clone d'Amazon ou d'OLX. Tour d'horizon des spécificités qui font la singularité de notre plateforme.",
    coverImage: IMG.startup,
    category: "vision",
    tags: ["comparaison", "innovation", "different"],
    content: `# 7 différences qui font Kin-Sell\n\n## 1. Mobile-first 2G/3G\nLes apps des géants pèsent 200+ MB. Kin-Sell : **122 MB** avec un service worker offline. Tout fonctionne même quand le réseau faiblit.\n\n## 2. Carte interactive native\nPas une feature secondaire. La **carte est le cœur** de l'expérience. Vous voyez le commerce de votre quartier en un clin d'œil.\n\n## 3. Messagerie + appels intégrés\nLes autres marketplaces vous renvoient sur WhatsApp. Chez Kin-Sell, **tout se passe in-app** : messages, photos, vocaux, appels HD avec Bluetooth.\n\n## 4. Sokin : le réseau social marchand\nVotre boutique a **un mur, des followers, des stories**. Le commerce devient social.\n\n## 5. Tarification accessible\nFREE couvre 90 % des usages. Les packs Pro démarrent à **5 USD/mois** — le prix de 2 carburants.\n\n## 6. IA opérationnelle\nMessageGuard, IA Ads, IA Messager, MarketIntel : 4 IA qui travaillent **pour vous**, pas pour la pub des géants.\n\n## 7. 100 % africain\nNotre code, notre data, notre support, notre vision : **tout est ici**. Vous payez, l'argent reste en Afrique.`,
  },
  {
    title: "La feuille de route Kin-Sell 2026-2027 : ce que nous préparons",
    excerpt: "Paiements Mobile Money intégrés, livraison à la demande, IA générative pour les annonces : voici ce qui arrive dans Kin-Sell d'ici fin 2027.",
    coverImage: IMG.future,
    category: "roadmap",
    tags: ["roadmap", "futur", "innovation"],
    content: `# Roadmap Kin-Sell 2026-2027\n\n## Q3 2026\n- 💳 **Mobile Money intégré** (Airtel Money, M-Pesa, Orange Money)\n- 📦 **Livraison à la demande** (partenariat avec coursiers locaux)\n- 🌍 **Multi-pays** : Lubumbashi, Goma\n\n## Q4 2026\n- 🤖 **IA génératrice d'annonces** : photo + 2 mots → annonce complète\n- 🎙️ **Vocal commerce** : publier une annonce en parlant\n- 📊 **Analytics+ V2** : prévisions de ventes IA\n\n## Q1 2027\n- 🏪 **Boutiques virtuelles 3D** (préview des produits)\n- 💎 **Programme de fidélité** (Sokin Points)\n- 🔄 **Troc et échanges** (mode barter)\n\n## Q2 2027\n- 🚀 **Lancement multi-pays** : Brazzaville, Pointe-Noire\n- ⚡ **Paiements crypto** (USDT, BTC) en option\n- 🎓 **Kin-Sell Academy** : formations gratuites pour vendeurs\n\n## Q3-Q4 2027\n- 🌐 **API publique** pour partenaires\n- 🛍️ **Marketplace B2B** (gros acheteurs / fournisseurs)\n- 📈 **IPO ou tour Série A** (à discuter)\n\n## Vous avez des idées ?\nÉcrivez-nous à **roadmap@kin-sell.com**. La feuille de route est co-construite avec vous.`,
  },
];

// ════════════════════════════════════════════════════════════
// BATCH 2 — Guides vendeurs + abonnements (10 articles)
// ════════════════════════════════════════════════════════════
const BATCH_2 = [
  {
    title: "Publier votre première annonce sur Kin-Sell en 5 étapes",
    excerpt: "Tutoriel pas à pas pour réussir votre première publication : photos, prix, description, géolocalisation, mise en ligne.",
    coverImage: IMG.smartphone,
    category: "guide",
    tags: ["guide", "publication", "demarrage"],
    content: `# Publier votre première annonce\n\nVendre sur Kin-Sell, c'est gratuit et rapide. Voici les **5 étapes** pour une publication efficace.\n\n## 1. Choisir une bonne photo\n\n- Lumière naturelle (près d'une fenêtre)\n- Fond uni (mur blanc, drap)\n- Cadrage net, produit centré\n- 5 photos max : face, dos, profil, détail, contexte\n\n## 2. Rédiger un titre clair\n\n- 60 caractères max\n- Marque + modèle + état (ex : « iPhone 13 Pro Max 256 Go - Comme neuf »)\n- Évitez les MAJUSCULES et les emojis dans le titre\n\n## 3. Décrire honnêtement\n\n- État réel (neuf, comme neuf, bon état, à réviser)\n- Date d'achat / durée d'usage\n- Accessoires inclus\n- Raison de la vente (rassure l'acheteur)\n\n## 4. Fixer le bon prix\n\nUtilisez **MarketIntel** (visible dans votre tableau de bord) pour comparer aux prix moyens de Kinshasa. Un prix juste = vente rapide.\n\n## 5. Géolocaliser et publier\n\nIndiquez votre commune et un point de rendez-vous neutre. Cliquez sur **Publier**. Votre annonce est en ligne instantanément.\n\n## Bonus : booster votre annonce\n\nLes packs **AUTO** et **PRO VENDEUR** vous donnent accès aux **boosts**, qui multiplient votre visibilité par 5 sur la carte et l'explorateur.`,
  },
  {
    title: "Photos d'annonce qui vendent : les 7 règles d'or",
    excerpt: "Une bonne photo, c'est 80 % des ventes. Découvrez les techniques pros, sans matériel coûteux, pour des photos qui font cliquer.",
    coverImage: IMG.photoStudio,
    category: "guide",
    tags: ["photos", "guide", "marketing"],
    content: `# Photos qui vendent : 7 règles d'or\n\n## Règle 1 — La lumière du matin\nEntre 9h et 11h, la lumière est douce et chaude. C'est l'heure idéale pour photographier vos produits.\n\n## Règle 2 — Le fond uni\nUn drap blanc, un carton plat, un mur peint. **Pas de désordre derrière le produit**.\n\n## Règle 3 — Cadrage carré\nKin-Sell affiche les vignettes en carré. Cadrez en 1:1 pour éviter les coupes brutales.\n\n## Règle 4 — Photo principale = présentation produit\nPas de personne, pas de main, pas de logo Kin-Sell. **Juste le produit, propre.**\n\n## Règle 5 — Photos secondaires = preuves\nUne photo des accessoires, une photo de l'étiquette, une photo en situation (sur le bureau, dans la voiture, à la cuisine).\n\n## Règle 6 — Aucun filtre exagéré\nLes filtres Instagram font fuir. Préférez **Photoroom** ou **Snapseed** pour ajustements légers.\n\n## Règle 7 — Vidéo de 15 secondes\nLes annonces avec vidéo ont **3x plus de vues**. Une rotation de 15 s suffit. Les packs Pro permettent jusqu'à 60 s.\n\n## Outils gratuits recommandés\n- **Photoroom** (détourage automatique)\n- **Snapseed** (retouche)\n- **CapCut** (mini-vidéo)`,
  },
  {
    title: "Quel pack Kin-Sell choisir ? Guide complet utilisateur (FREE → PRO VENDEUR)",
    excerpt: "FREE, BOOST, AUTO ou PRO VENDEUR : décryptage de chaque pack utilisateur Kin-Sell pour choisir le bon investissement selon votre profil.",
    coverImage: IMG.growth,
    category: "abonnement",
    tags: ["abonnement", "packs", "pricing"],
    content: `# Quel pack Kin-Sell choisir ?\n\n## FREE — Idéal pour débuter\n- 5 annonces actives max\n- Messagerie + appels gratuits\n- Carte standard\n- **0 USD/mois**\n\n👉 Pour qui : vous testez Kin-Sell, vente occasionnelle.\n\n## BOOST — Pour les vendeurs réguliers\n- 20 annonces actives\n- 3 boosts par mois (visibilité x5)\n- Statistiques de base\n- **2,5 USD/mois**\n\n👉 Pour qui : vous vendez chaque semaine.\n\n## AUTO — Pour les semi-pros\n- 50 annonces actives\n- 10 boosts par mois\n- Renouvellement automatique des annonces\n- Vidéos jusqu'à 60 s\n- **5 USD/mois**\n\n👉 Pour qui : vous avez un mini-stock régulier.\n\n## PRO VENDEUR — Pour les vrais commerçants\n- Annonces illimitées\n- Boosts illimités\n- Badge vérifié\n- Analytics+ V2\n- Support prioritaire\n- **10 USD/mois**\n\n👉 Pour qui : c'est votre activité principale.\n\n## Comment choisir ?\n\nDémarrez en **FREE**. Si vous publiez plus de 5 annonces / semaine ou si vos ventes ralentissent, passez à **BOOST**. Si vous vendez quotidiennement, passez à **AUTO** ou **PRO VENDEUR**.\n\n**Astuce** : 10 USD investis dans PRO VENDEUR rapportent en moyenne 80 USD de ventes additionnelles par mois (source : MarketIntel Kin-Sell).`,
  },
  {
    title: "Packs Business Kin-Sell : STARTER, BUSINESS et SCALE expliqués",
    excerpt: "Vous êtes une boutique, une marque, une PME ? Voici comment choisir le bon pack Business Kin-Sell pour faire décoller vos ventes.",
    coverImage: IMG.meeting,
    category: "abonnement",
    tags: ["business", "abonnement", "pme"],
    content: `# Packs Business Kin-Sell\n\nKin-Sell propose **3 packs Business** dédiés aux boutiques, marques et PME qui veulent vendre à grande échelle.\n\n## STARTER — Première vitrine en ligne\n- Profil Business vérifié\n- 100 produits actifs\n- 1 admin équipe\n- Catalogue produit\n- **15 USD/mois**\n\n👉 Pour qui : votre boutique débute le digital.\n\n## BUSINESS — Croissance accélérée\n- 500 produits actifs\n- 5 admins équipe\n- Boutique virtuelle dédiée (URL kin-sell.com/votre-boutique)\n- Analytics+ avancées\n- 30 boosts/mois\n- **35 USD/mois**\n\n👉 Pour qui : vous avez 1 à 5 employés et un stock régulier.\n\n## SCALE — Volume et automatisation\n- Produits illimités\n- Admins illimités\n- API import catalogue (CSV / Shopify)\n- IA Ads premium (création automatique de visuels)\n- IA Messager (réponses auto aux clients)\n- Account manager dédié\n- **75 USD/mois**\n\n👉 Pour qui : vous traitez 100+ commandes/mois.\n\n## ROI démontré\n\nLes boutiques **BUSINESS** voient en moyenne leurs ventes multipliées par 2,3 dès le 2e mois. Les boutiques **SCALE** font x4 en 6 mois (étude Kin-Sell 2026).\n\n## Démarrer\n\n[Choisir mon pack Business →](/pricing)`,
  },
  {
    title: "5 erreurs qui font fuir les acheteurs (et comment les éviter)",
    excerpt: "Photos floues, prix injustifiés, descriptions vides, réponses lentes : les pièges classiques des vendeurs débutants et nos solutions.",
    coverImage: IMG.customer,
    category: "guide",
    tags: ["erreurs", "guide", "vente"],
    content: `# 5 erreurs qui font fuir les acheteurs\n\n## Erreur 1 — Photos floues ou sombres\n**Solution** : prenez vos photos en lumière du jour, fond uni, en mode rafale puis sélectionnez la meilleure.\n\n## Erreur 2 — Prix sans justification\n« iPhone à 1500 USD » sans contexte = méfiance. **Indiquez** : modèle exact, état, accessoires, comparaison de prix.\n\n## Erreur 3 — Description trop courte\n« Téléphone à vendre » = 0 vente. Une bonne description fait **150 à 300 mots**, structurée :\n- État\n- Caractéristiques techniques\n- Histoire (comment vous l'avez eu)\n- Conditions de vente (livraison, paiement)\n\n## Erreur 4 — Réponses lentes\nUn acheteur qui attend 2 h va voir ailleurs. **Activez les notifications push** Kin-Sell, répondez sous 15 min.\n\n## Erreur 5 — Pas de point de rendez-vous clair\n« Quartier tel » = trop vague. Proposez **un lieu neutre, public, sécurisé** : station-service, mall, bureau de votre quartier.\n\n## Bonus — Le syndrome « pas négociable »\nMettre « PRIX FIXE » dans le titre fait fuir 60 % des acheteurs. **Acceptez la négociation** : c'est culturel, c'est la norme à Kinshasa.`,
  },
  {
    title: "Comment Sokin transforme votre boutique en réseau social marchand",
    excerpt: "Sokin, le fil social Kin-Sell, vous permet de raconter votre boutique en stories, posts, lives et fidéliser une vraie communauté.",
    coverImage: IMG.community,
    category: "sokin",
    tags: ["sokin", "communaute", "social"],
    content: `# Sokin : votre boutique devient sociale\n\n## C'est quoi Sokin ?\n\nSokin, c'est le **fil social** intégré à Kin-Sell. Chaque profil (acheteur ou vendeur) peut :\n- Publier des **posts photo/vidéo** (15 s à 3 min selon le pack)\n- Lancer des **stories** (24 h)\n- Faire des **lives** (PRO VENDEUR et SCALE)\n- Recevoir des **likes, commentaires, partages**\n\n## Pourquoi c'est puissant\n\nLes acheteurs Kin-Sell ne cherchent pas que des produits. Ils suivent des **personnes, des marques, des histoires**. Sokin, c'est :\n\n- Présenter votre arrivage de la semaine\n- Faire vivre votre boutique en coulisses\n- Annoncer des promos exclusives à vos followers\n- Récolter des feedbacks en direct\n\n## Cas client : Mama Aldine, vendeuse de pagnes\n\nMama Aldine publie une story chaque matin sur Sokin. Elle a passé de 3 ventes/semaine à **15 ventes/semaine** en 2 mois. Son secret : **régularité + authenticité**.\n\n## Mes 3 conseils Sokin\n\n1. **Publiez 1 post par jour** (régularité > qualité)\n2. **Répondez à TOUS les commentaires** (engagement)\n3. **Faites un live le week-end** (lien direct avec vos clients)\n\n## Sokin Plus\n\nLes vendeurs PRO VENDEUR débloquent **Sokin Plus** : analytics détaillées, planification de posts, stickers premium.`,
  },
  {
    title: "Boostez votre visibilité avec les coupons CPC, CPI et CPA",
    excerpt: "Les coupons publicitaires Kin-Sell vous permettent de toucher des milliers d'acheteurs avec un budget maîtrisé. Mode d'emploi.",
    coverImage: IMG.analytics,
    category: "publicite",
    tags: ["coupons", "publicite", "ads"],
    content: `# Coupons CPC, CPI, CPA : décryptage\n\nLes coupons sont les **outils publicitaires Kin-Sell** pour amplifier la portée de vos annonces ou de votre boutique.\n\n## CPC — Coût Par Clic\n\nVous payez chaque fois qu'un acheteur **clique** sur votre annonce sponsorisée.\n- Tarif : 0,02 USD à 0,08 USD / clic\n- Idéal pour : générer du trafic vers une annonce précise\n- Quand l'utiliser : nouvelle annonce à lancer\n\n## CPI — Coût Par Impression\n\nVous payez par **1000 affichages** (1000 vues sur l'explorateur).\n- Tarif : 0,5 USD / 1000 impressions\n- Idéal pour : faire connaître votre marque\n- Quand l'utiliser : campagne de notoriété\n\n## CPA — Coût Par Action\n\nVous payez uniquement quand l'acheteur **réalise une action** (message envoyé, achat finalisé).\n- Tarif : 0,5 USD à 5 USD / action\n- Idéal pour : maximiser le ROI\n- Quand l'utiliser : annonce déjà bien rodée\n\n## Mon premier coupon : combien investir ?\n\nDémarrez avec **5 USD en CPC** sur votre meilleure annonce. Vous obtiendrez 60 à 250 clics. Mesurez le taux de conversion (clics → messages → ventes).\n\n## Boost vs coupon : la différence\n\n- **Boost** = mise en avant de votre annonce sur la carte\n- **Coupon** = campagne publicitaire ciblée par budget et action\n\nLes deux sont complémentaires. Les packs **AUTO+** débloquent les coupons CPC, **PRO VENDEUR** débloque CPC + CPI, **SCALE** débloque tous les coupons.`,
  },
  {
    title: "Analytics+ V2 : transformez vos données en ventes",
    excerpt: "Le module Analytics+ V2 disponible dans les packs payants vous donne des insights actionables pour optimiser votre stratégie.",
    coverImage: IMG.data,
    category: "analytics",
    tags: ["analytics", "data", "performance"],
    content: `# Analytics+ V2 — Transformez vos données en ventes\n\nDisponible dans **AUTO, PRO VENDEUR, BUSINESS et SCALE**, Analytics+ V2 est votre tableau de bord ventes.\n\n## Ce que vous voyez\n\n### Vues & engagement\n- Vues par annonce / par jour\n- Taux de clic (CTR)\n- Temps moyen sur l'annonce\n- Profil des visiteurs (commune, âge approx, pack)\n\n### Conversions\n- Messages reçus par annonce\n- Taux de conversion message → vente\n- Délai moyen avant vente\n- Annonces qui n'ont jamais vendu (à retravailler)\n\n### Revenus\n- CA total / mensuel / par catégorie\n- Top 10 des produits qui vendent\n- Saisonnalité (jours/heures de pic)\n\n## Insights IA\n\nL'IA Kin-Sell vous propose des **recommandations actionables** :\n- « Cette annonce a 200 vues mais 0 message → revoyez le titre »\n- « Vos ventes pic à 18h → publiez vos boosts à 17h45 »\n- « Vos prix sont 15 % au-dessus du marché → ajustez de 5 % »\n\n## Comparaison concurrentielle\n\nMarketIntel intégré : voyez les **prix moyens, délais de vente et top vendeurs** de votre catégorie à Kinshasa.\n\n## Cas pratique\n\nUne boutique BUSINESS a découvert via Analytics+ V2 que 70 % de ses ventes venaient de la commune de Lemba. Elle a concentré ses boosts sur cette zone et **doublé ses ventes en 6 semaines**.\n\n[Activer Analytics+ V2 →](/pricing)`,
  },
  {
    title: "Gérer plusieurs vendeurs dans votre boutique Business",
    excerpt: "Les packs Business permettent d'ajouter des collaborateurs avec des rôles précis. Voici comment structurer votre équipe Kin-Sell.",
    coverImage: IMG.network,
    category: "business",
    tags: ["business", "equipe", "gestion"],
    content: `# Gérer une équipe sur Kin-Sell Business\n\n## Ajouter un collaborateur\n\nDans votre tableau de bord Business :\n1. Onglet **Équipe**\n2. **Inviter** par email\n3. Choisir le **rôle** (voir ci-dessous)\n4. Le collaborateur reçoit un email + push notification\n\n## Les 4 rôles\n\n### 1. Owner (vous)\nAccès total : ajout/suppression de membres, facturation, fermeture de boutique.\n\n### 2. Manager\nGère catalogue, stock, promotions. Pas accès à la facturation.\n\n### 3. Vendeur\nPublie, modifie ses propres annonces, répond aux messages. Pas accès aux statistiques globales.\n\n### 4. Modérateur (SCALE seulement)\nGère uniquement la modération des commentaires Sokin et le SAV.\n\n## Limites par pack\n\n| Pack | Membres max |\n|---|---|\n| STARTER | 1 owner |\n| BUSINESS | 5 (1 owner + 4 collaborateurs) |\n| SCALE | Illimité |\n\n## Bonnes pratiques\n\n- **Un compte = une personne** (jamais de partage de mot de passe)\n- **Activez le 2FA** pour les rôles Manager et Owner\n- **Audit trail** : chaque action est loggée (utile en cas de litige)\n\n## Cas pratique\n\nUne boutique électronique (5 employés) sur le pack BUSINESS a structuré son équipe :\n- 1 Owner (le patron)\n- 1 Manager (catalogue + stock)\n- 3 Vendeurs (réponse messages + livraisons)\n\nRésultat : **temps de réponse moyen passé de 2h à 12 minutes**, ventes +180 % en 3 mois.`,
  },
  {
    title: "Pourquoi passer à un abonnement Kin-Sell payant change tout",
    excerpt: "Statistiques internes Kin-Sell : les vendeurs qui passent à un pack payant voient en moyenne leurs ventes multipliées par 4 en 90 jours.",
    coverImage: IMG.rocket,
    category: "abonnement",
    tags: ["abonnement", "roi", "upgrade"],
    content: `# Pourquoi passer à un pack payant\n\n## Les chiffres parlent\n\nNous avons étudié 1 200 vendeurs Kin-Sell sur 90 jours (Q1 2026). Résultats :\n\n- **FREE → BOOST** : ventes x **2,1**\n- **FREE → AUTO** : ventes x **3,4**\n- **FREE → PRO VENDEUR** : ventes x **4,2**\n\n## Pourquoi un tel écart ?\n\n### 1. Plus d'annonces visibles\nFREE = 5 actives. AUTO = 50. **10x plus de chances** d'être trouvé.\n\n### 2. Boosts inclus\nUne annonce boostée apparaît **5x plus** sur la carte et l'explorateur.\n\n### 3. Renouvellement automatique\nVos annonces ne s'archivent jamais. Elles **remontent** régulièrement en haut des résultats.\n\n### 4. Coupons publicitaires\nCPC, CPI, CPA = vous **achetez de l'audience qualifiée** pour quelques USD.\n\n### 5. Analytics+ V2\nVous savez **ce qui marche, ce qui ne marche pas**, et vous pivotez vite.\n\n### 6. Badge vérifié\nLes acheteurs font **3x plus confiance** à un vendeur PRO ou Business.\n\n## Calcul ROI moyen\n\n- Pack PRO VENDEUR : **10 USD / mois**\n- Ventes additionnelles : **+80 USD / mois**\n- ROI : **8x**\n\n## Comment essayer sans risque\n\nKin-Sell offre **7 jours d'essai gratuit** sur AUTO et PRO VENDEUR. Aucun engagement, vous résiliez en 1 clic.\n\n[Tester PRO VENDEUR gratuitement 7 jours →](/pricing)`,
  },
];

// ════════════════════════════════════════════════════════════
// BATCH 3 — Innovations IA, Sokin, MarketIntel, communauté (10 articles)
// ════════════════════════════════════════════════════════════
const BATCH_3 = [
  {
    title: "MessageGuard IA : votre garde du corps numérique sur Kin-Sell",
    excerpt: "Comment notre IA scanne en temps réel les conversations pour vous protéger des arnaques, du spam et du harcèlement.",
    coverImage: IMG.ai,
    category: "ia",
    tags: ["ia", "messageguard", "securite"],
    content: `# MessageGuard IA — Votre garde du corps numérique\n\n## Le contexte\n\nSur toute marketplace, **les arnaques arrivent en messagerie** : faux liens, demandes de paiement avant rendez-vous, usurpation d'identité, harcèlement.\n\nKin-Sell a construit **MessageGuard**, une IA dédiée à la protection de la messagerie.\n\n## Comment ça marche\n\nÀ chaque message envoyé, MessageGuard analyse en moins de 200 ms :\n- **Le contenu textuel** (mots-clés d'arnaque, URLs suspectes)\n- **Le comportement** (rythme d'envoi anormal, copier-coller massif)\n- **L'historique** (compte récent, signalements antérieurs)\n\n## Les 3 verdicts\n\n### ✅ OK\nMessage normal, livré sans interruption.\n\n### ⚠️ WARNED\nMessage livré, mais une bannière prévient le destinataire (« Ce message contient un lien externe — restez prudent »).\n\n### 🚫 BLOCKED\nMessage non délivré. L'expéditeur est notifié. En cas de récidive, son compte est suspendu.\n\n## Confidentialité\n\nMessageGuard analyse **localement et anonymement**. Aucun humain ne lit vos messages. Les données sont supprimées après 30 jours.\n\n## Pour l'admin\n\nLes super-admins disposent d'un **dashboard MessageGuard** pour ajuster la sévérité, voir les logs, et fine-tuner le modèle.\n\n## Résultat\n\nDepuis le lancement de MessageGuard en V3.0, **les signalements ont chuté de 73 %**. Notre objectif : 95 % d'ici fin 2026.`,
  },
  {
    title: "MarketIntel : l'oracle des prix et des tendances Kin-Sell",
    excerpt: "Vous hésitez sur un prix ? MarketIntel vous donne les statistiques live de votre catégorie à Kinshasa. Disponible dans tous les packs payants.",
    coverImage: IMG.trends,
    category: "ia",
    tags: ["marketintel", "prix", "tendances"],
    content: `# MarketIntel — L'oracle Kin-Sell\n\n## Le problème\n\nPourquoi votre annonce ne vend pas ? Souvent, **le prix est mal calé** :\n- Trop haut → les acheteurs zappent\n- Trop bas → vous perdez de l'argent\n\n## La solution : MarketIntel\n\nMarketIntel est l'IA d'analyse de marché Kin-Sell. Elle :\n- Scanne **toutes les annonces** d'une catégorie\n- Calcule **prix médian, min, max** par condition (neuf, occasion)\n- Mesure **délai moyen de vente** par tranche de prix\n- Détecte **les tendances** (catégories qui montent, qui baissent)\n\n## Ce que vous voyez\n\nQuand vous publiez une annonce, MarketIntel affiche en bas :\n- 💰 Prix médian de votre catégorie : 380 USD\n- ⚡ Vente la plus rapide : 7 jours\n- 📈 Tendance : +12 % ce mois (forte demande)\n- 🎯 Recommandation : prix entre 350 et 400 USD\n\n## Disponibilité\n\nMarketIntel est inclus dans **AUTO, PRO VENDEUR, BUSINESS et SCALE**. Les utilisateurs FREE et BOOST voient la version simplifiée (prix médian uniquement).\n\n## Cas pratique\n\nUn revendeur de smartphones a baissé ses prix de 8 % après recommandation MarketIntel. **Ses ventes ont augmenté de 220 %** en 30 jours. Marge nette : +180 USD.\n\n[Activer MarketIntel →](/pricing)`,
  },
  {
    title: "IA Ads : générez des visuels publicitaires pros en 1 clic",
    excerpt: "Plus besoin de Photoshop ni de graphiste. L'IA Ads Kin-Sell crée des bannières, posts Sokin et stories avec votre produit, votre logo, vos couleurs.",
    coverImage: IMG.digital,
    category: "ia",
    tags: ["ia", "ads", "visuels"],
    content: `# IA Ads — Visuels pros en 1 clic\n\n## Pour qui ?\n\nDisponible dans **PRO VENDEUR, BUSINESS et SCALE**, l'IA Ads génère des visuels marketing à partir de :\n- Une photo de votre produit\n- Votre logo (optionnel)\n- 1-2 mots de contexte (ex : « promo », « livraison gratuite »)\n\n## Ce que ça produit\n\n- 📸 **Bannières** (formats : carré, paysage, story)\n- 🎬 **Mini-vidéos** (5 à 15 s, animations légères)\n- 📝 **Légendes** (textes Sokin et descriptions d'annonce)\n- 🎨 **Variations** (3 styles différents par génération)\n\n## Workflow\n\n1. Upload photo du produit\n2. Choix du gabarit (promo, nouveauté, déstockage, lancement)\n3. L'IA génère 3 variantes en 30 s\n4. Vous choisissez, vous publiez\n\n## Combinable avec coupons\n\nLes visuels IA Ads peuvent être **directement boostés** via coupons CPC/CPI. Workflow complet : génération → boost → suivi conversion.\n\n## Comparaison\n\n| Méthode | Temps | Coût |\n|---|---|---|\n| Graphiste freelance | 2-3 jours | 30-100 USD |\n| Canva pro + apprendre | 30 min/visuel | 5 USD/mois |\n| **IA Ads Kin-Sell** | **30 secondes** | **inclus dans pack** |\n\n## Limites\n\nL'IA Ads génère des **visuels marketing**, pas des photos produits. Pour les photos catalogue, utilisez vos propres photos optimisées.`,
  },
  {
    title: "IA Messager : automatisez les premières réponses sans perdre le contact humain",
    excerpt: "L'IA Messager répond instantanément aux questions courantes (prix, dispo, livraison) et vous transmet les vrais prospects. Pour SCALE.",
    coverImage: IMG.chat,
    category: "ia",
    tags: ["ia", "messager", "automation"],
    content: `# IA Messager — Réponses auto, contact humain préservé\n\n## Le défi des boutiques actives\n\nQuand vous recevez 50 messages par jour, **80 % sont les mêmes questions** :\n- « C'est combien ? »\n- « C'est encore disponible ? »\n- « Vous livrez où ? »\n\n## La solution\n\nL'IA Messager (pack **SCALE**) répond automatiquement aux questions courantes en utilisant les **infos publiques de votre annonce** :\n- Prix → extrait du champ prix\n- Disponibilité → extrait du statut de l'annonce\n- Localisation → extrait de votre profil\n\n## Configuration\n\n1. Activer dans le tableau de bord SCALE\n2. Définir les **réponses-types** (livraison, paiement, garantie)\n3. Choisir le **ton** (formel, amical, jeune)\n4. Définir le **seuil de transfert humain** (« si l'acheteur dit \"je veux acheter\" → ping vous »)\n\n## Sécurité du tunnel humain\n\nL'IA Messager **ne ferme jamais une vente** sans validation humaine. Elle qualifie le prospect, recueille son besoin, vous résume la conversation, puis vous reprenez la main.\n\n## Résultats clients\n\nUne boutique électronique SCALE a réduit son **temps de réponse moyen de 45 min à 12 secondes**, et fait **3,5x plus de ventes** en 60 jours.\n\n## Disponibilité\n\nUniquement pour le pack **SCALE** (75 USD/mois). En cours de bêta sur PRO VENDEUR (Q3 2026).`,
  },
  {
    title: "Sokin Plus : la prochaine étape pour les créateurs Kin-Sell",
    excerpt: "Vous voulez transformer Kin-Sell en mini-Instagram marchand ? Sokin Plus déverrouille analytics, planification, stickers premium et lives illimités.",
    coverImage: IMG.community,
    category: "sokin",
    tags: ["sokin", "creator", "premium"],
    content: `# Sokin Plus — Pour les créateurs Kin-Sell\n\n## Pour qui ?\n\nSokin Plus est destiné aux **créateurs de contenu, influenceurs, marques personnelles** qui utilisent Kin-Sell comme un canal social marchand.\n\n## Ce qui est inclus\n\n### 📊 Analytics avancées\n- Vues / engagement par post\n- Taux de croissance followers\n- Heures de pic d'audience\n- Top contenus du mois\n\n### 📅 Planification\n- Programmer posts et stories à l'avance\n- Calendrier éditorial intégré\n- Suggestions IA de contenus à publier\n\n### 🎨 Stickers premium\n- Pack exclusif Kin-Sell (badges, gif animés, polices)\n- Mise à jour mensuelle\n\n### 🔴 Lives illimités\n- Lives de 4 heures max\n- Replay disponibles 7 jours\n- Boutique cliquable pendant le live\n\n### 🔥 Boost automatique\n- Vos meilleurs posts boostés automatiquement\n- Selon performance, audience-cible\n\n## Tarif\n\nSokin Plus est inclus dans **PRO VENDEUR (10 USD/mois)** et **BUSINESS / SCALE**.\n\n## Cas d'usage : Beauté & cosmétique\n\nUne créatrice de contenu beauté à Kinshasa publie 1 live + 5 stories + 1 post / jour. Sokin Plus lui a permis de **passer de 2 000 à 18 000 followers en 4 mois**, avec un taux de conversion de **6 %**.\n\n[Découvrir Sokin Plus →](/pricing)`,
  },
  {
    title: "La communauté Kin-Sell : un mouvement, pas seulement une app",
    excerpt: "Programme ambassadeurs, événements de quartier, certification vendeurs : Kin-Sell construit une vraie communauté marchande à Kinshasa.",
    coverImage: IMG.community,
    category: "communaute",
    tags: ["communaute", "ambassadeurs", "evenements"],
    content: `# La communauté Kin-Sell\n\nKin-Sell, ce n'est pas qu'une app. **C'est un mouvement.**\n\n## Le programme Ambassadeurs\n\nDevenez **ambassadeur Kin-Sell de votre commune** :\n- Aidez les vendeurs débutants à publier leurs premières annonces\n- Organisez des mini-meetups (5-10 personnes / mois)\n- Recevez **5 % de commission** sur les abonnements de vos parrainés\n- Badge spécial sur votre profil\n\nCandidatures via : **ambassadeurs@kin-sell.com**\n\n## Les Kin-Sell Days\n\nChaque trimestre, nous organisons un **Kin-Sell Day** dans une commune différente :\n- Atelier « publier sa première annonce »\n- Démo des fonctionnalités (Sokin, MarketIntel, IA Ads)\n- Mini-marché Kin-Sell (vendeurs vérifiés en présentiel)\n- Networking + cadeaux\n\nProchain Kin-Sell Day : **commune de Lemba, mai 2026**.\n\n## Certification Vendeur Kin-Sell\n\nLes vendeurs **PRO VENDEUR et Business** peuvent obtenir le **certificat Kin-Sell** :\n- 1 jour de formation (en ligne ou présentiel)\n- Test de connaissance produit + service client\n- Badge **Certifié Kin-Sell** sur le profil\n- Boost permanent +20 % de visibilité\n\n## Sokin Friends\n\nLe groupe Telegram Sokin Friends rassemble plus de **2 500 vendeurs** Kin-Sell qui s'entraident, partagent des astuces, et organisent des collabs.\n\n[Rejoindre Sokin Friends →](https://t.me/sokin_friends)`,
  },
  {
    title: "Kin-Sell offline : comment l'app fonctionne sans connexion",
    excerpt: "Service worker, cache intelligent, file d'attente d'envoi : Kin-Sell continue de marcher quand le réseau coupe — découvrez comment.",
    coverImage: IMG.network,
    category: "innovation",
    tags: ["offline", "performance", "pwa"],
    content: `# Kin-Sell offline — Quand le réseau coupe\n\nÀ Kinshasa, **les coupures de connexion sont la norme**, pas l'exception. Kin-Sell est conçu pour continuer de fonctionner même sans réseau.\n\n## Service Worker (PWA)\n\nKin-Sell utilise un **service worker** qui :\n- Pré-cache les pages visitées (toutes consultables offline)\n- Met en cache les images des annonces vues\n- Affiche une page d'accueil offline avec votre dernier feed\n\n## File d'attente d'envoi\n\nVous écrivez un message sans réseau ? Pas de panique :\n- Le message est **mis en file d'attente locale**\n- Dès que le réseau revient, **envoi automatique**\n- L'horodatage indique « envoi différé » côté destinataire\n\n## Annonces brouillon\n\nVous publiez une annonce en 2G qui coupe ? L'annonce est **sauvegardée en brouillon localement**. À la reconnexion, vous pouvez la finaliser et la publier.\n\n## Optimisations 2G\n\n- Images compressées en **WebP** (30-50 % plus légères que JPEG)\n- Vidéos en H.264 540p, **bitrate adapté à la vitesse réseau**\n- Bundle JS séparé en chunks (chargement progressif)\n- Brotli + Gzip (compression x10)\n\n## Notifications offline\n\nLes notifications push **arrivent même app fermée** grâce à **Firebase Cloud Messaging (FCM)**. Quand vous rouvrez l'app, le contenu s'affiche immédiatement.\n\n## Résultat\n\nKin-Sell se charge en **< 3 s en 3G**, et reste utilisable même à 50 kbps. **C'est notre fierté technique.**`,
  },
  {
    title: "Comment Kin-Sell révolutionne le commerce de proximité à Kinshasa",
    excerpt: "Témoignages de 5 vendeurs Kinois qui ont changé de vie grâce à Kin-Sell : du débrouillard à l'entrepreneur structuré.",
    coverImage: IMG.startup,
    category: "temoignage",
    tags: ["temoignages", "communaute", "impact"],
    content: `# Kin-Sell : 5 témoignages qui changent la donne\n\n## Aldine — Vendeuse de pagnes (Bandalungwa)\n\n*« Avant Kin-Sell, je vendais 3 pagnes par semaine sur le marché. Maintenant, j'en vends 15 à 20 grâce aux stories Sokin. J'ai pu ouvrir une vraie boutique en 6 mois. »*\n\n## Jean-Marie — Réparateur de smartphones (Lemba)\n\n*« J'avais peur que les clients pensent que j'étais un arnaqueur en ligne. Le badge \"Certifié Kin-Sell\" a tout changé. J'ai 4x plus de demandes. »*\n\n## Mama Christine — Cuisine traditionnelle (Matete)\n\n*« Je pensais que Kin-Sell c'était que pour les téléphones. Mais ma cuisine fait un carton ! J'ai 200 followers sur Sokin et je livre dans 8 communes. »*\n\n## Patrick — Importateur électronique (Gombe)\n\n*« Le pack BUSINESS m'a permis de structurer mon catalogue de 800 produits. Mes 4 vendeurs gèrent les messages depuis leur téléphone. CA x3 en 5 mois. »*\n\n## Sarah — Créatrice mode (Limete)\n\n*« Sokin Plus, c'est mon Instagram pro. Je fais 1 live par semaine, je vends mes pièces en direct. Ma marque a explosé. »*\n\n---\n\n## Le pattern commun\n\n1. **Démarrage FREE** pour tester\n2. **Passage à BOOST ou AUTO** après 1-2 mois\n3. **Investissement dans le contenu Sokin**\n4. **Régularité + authenticité**\n5. **Ventes qui décollent en 3-6 mois**\n\n[Démarrer mon parcours Kin-Sell →](/auth/register)`,
  },
  {
    title: "Le futur du commerce africain : ce que Kin-Sell prépare pour 2030",
    excerpt: "IA générative, paiements crypto, livraison drone, marketplace B2B panafricain : la vision long-terme de Kin-Sell pour transformer le commerce.",
    coverImage: IMG.future,
    category: "vision",
    tags: ["futur", "innovation", "2030"],
    content: `# Kin-Sell 2030 — Le futur du commerce africain\n\n## L'horizon\n\nEn 2030, Kin-Sell ambitionne d'être **la 1ère marketplace africaine**, présente dans 25 pays, utilisée par 50 millions de personnes.\n\nVoici ce que nous préparons.\n\n## 1. IA générative full-stack\n\n- **Photo virtuelle** : un produit photographié, l'IA crée 10 contextes (sur table, sur étagère, en extérieur, en main, etc.)\n- **Description vocale** : vous parlez 30 secondes, l'IA rédige une annonce optimisée\n- **Négociation IA** : un assistant qui négocie pour vous selon vos règles (« je n'accepte pas en-dessous de X »)\n\n## 2. Paiements digitaux unifiés\n\n- **Mobile Money** intégré (Airtel, M-Pesa, Orange, MTN)\n- **Crypto** (USDT principalement) en option\n- **Banque digitale Kin-Sell** (compte commerçant, carte virtuelle, prêt selon historique)\n\n## 3. Livraison nouvelle génération\n\n- **Coursiers locaux** géolocalisés (V1 — 2026)\n- **Drones de livraison** dans Kinshasa (V2 — 2028)\n- **Casiers Kin-Sell Boxes** dans les communes (V3 — 2029)\n\n## 4. Marketplace B2B\n\n- Mise en relation **fournisseurs / revendeurs**\n- Achats en gros, prix dégressifs\n- Logistique intégrée (entrepôt + livraison)\n\n## 5. Kin-Sell Academy\n\n- Formations gratuites pour **1 million de vendeurs africains**\n- Diplômes reconnus en partenariat avec les universités locales\n- Programme « De vendeur informel à PME »\n\n## 6. Open API\n\n- Permettre à **d'autres apps** de se connecter à l'écosystème Kin-Sell\n- Boutiques personnalisées hors-app\n- Intégrations ERP / comptabilité\n\n## Notre conviction\n\nL'Afrique ne doit pas attendre que les géants étrangers s'occupent d'elle. **Nous construisons nos propres outils.** Et Kin-Sell est en première ligne.\n\n*« L'avenir du commerce africain, on le code aujourd'hui. »*`,
  },
  {
    title: "Devenez ambassadeur Kin-Sell de votre commune et gagnez avec nous",
    excerpt: "Le programme ambassadeurs Kin-Sell rémunère ceux qui font connaître l'app dans leur quartier. 5 % à vie sur les abonnements parrainés.",
    coverImage: IMG.team,
    category: "communaute",
    tags: ["ambassadeurs", "programme", "revenu"],
    content: `# Programme Ambassadeurs Kin-Sell\n\n## Le concept\n\nKin-Sell se développe **par bouche à oreille communautaire**. Plutôt que dépenser en publicité, nous **rémunérons les ambassadeurs locaux** qui font connaître l'app.\n\n## Comment ça marche\n\n### Étape 1 — Candidature\n- Postuler via **ambassadeurs@kin-sell.com**\n- Profil idéal : actif sur Kin-Sell depuis 2+ mois, présent dans une commune ciblée, à l'aise avec le digital\n\n### Étape 2 — Onboarding\n- Formation de 2 h en visio (toolkit, scripts, FAQ)\n- Code parrainage personnalisé\n- Kit goodies (t-shirt, stickers, flyers)\n\n### Étape 3 — Mission terrain\n- Aider 5 nouveaux vendeurs/mois à démarrer\n- Animer 1 mini-meetup tous les 2 mois (5-10 personnes)\n- Partager 2 stories Sokin/semaine\n\n## Rémunération\n\n- **5 USD bonus** par nouvel utilisateur **PRO VENDEUR** parrainé\n- **15 USD bonus** par boutique **BUSINESS** parrainée\n- **5 % à vie** sur les abonnements de votre réseau (récurrent)\n- **Bonus performance** trimestriel (top 10 ambassadeurs)\n\n## Exemples de gain\n\n- **Ambassadeur débutant** : 30 à 80 USD / mois\n- **Ambassadeur actif** : 150 à 300 USD / mois\n- **Top ambassadeur** : 500+ USD / mois (cas réels Q1 2026)\n\n## Évolution\n\nLes meilleurs ambassadeurs intègrent l'**équipe Kin-Sell** comme **community managers régionaux** salariés (CDI ou freelance).\n\n## Postuler\n\n📧 ambassadeurs@kin-sell.com\n📱 ou via le formulaire dédié dans l'app (Profil → Programme Ambassadeurs)\n\n*Construisons ensemble la 1ère marketplace africaine.* 🇨🇩`,
  },
];

// ════════════════════════════════════════════════════════════
async function run() {
  const arg = process.argv[2] ?? "check";

  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true },
  });

  if (!admin) {
    console.error("❌ Aucun SUPER_ADMIN trouvé en DB.");
    process.exit(1);
  }

  const total = await prisma.blogPost.count();
  const published = await prisma.blogPost.count({ where: { status: "PUBLISHED" } });

  console.log(`👤 Admin: ${admin.email} (${admin.id})`);
  console.log(`📰 Articles existants: ${total} total / ${published} publiés`);

  if (arg === "check") return;

  let batch;
  if (arg === "1") batch = BATCH_1;
  else if (arg === "2") batch = BATCH_2;
  else if (arg === "3") batch = BATCH_3;
  else {
    console.error(`❌ Batch ${arg} non disponible. Utilisez: 1 | 2 | 3 | check`);
    process.exit(1);
  }

  console.log(`\n🚀 Création du batch ${arg} (${batch.length} articles)...`);

  let created = 0;
  let skipped = 0;
  for (const a of batch) {
    const baseSlug = slugify(a.title);
    let slug = baseSlug;
    let i = 1;
    while (await prisma.blogPost.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++i}`;
      if (i > 5) break;
    }

    try {
      const post = await prisma.blogPost.create({
        data: {
          authorId: admin.id,
          title: a.title,
          slug,
          content: a.content,
          excerpt: a.excerpt,
          coverImage: a.coverImage,
          category: a.category,
          tags: a.tags,
          language: "fr",
          metaTitle: a.title,
          metaDescription: a.excerpt,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      console.log(`  ✅ ${post.slug}`);
      created++;
    } catch (e) {
      console.error(`  ⚠️  ${a.title}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n✨ Batch ${arg} terminé : ${created} créés, ${skipped} ignorés.`);

  const finalTotal = await prisma.blogPost.count({ where: { status: "PUBLISHED" } });
  console.log(`📊 Total articles publiés en DB : ${finalTotal}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
