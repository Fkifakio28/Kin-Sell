import ExcelJS from 'exceljs';

// ─── All test cases data ───────────────────────────────────────────────────────
const tests = [
  // ── AUTHENTIFICATION ──
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Création de compte', cas: 'Création de compte "utilisateur"', prereq: '1. Lien du site: https://kin-sell.com/\n2. Adresse mail ou numéro de téléphone valide', etapes: '1. Accéder au site via le lien\n2. Cliquer sur "Créer un compte"\n3. Choisir "Utilisateur"\n4. Remplir email, mot de passe (≥8 car.), displayName (≥2 car.)\n5. Résoudre le CAPTCHA Turnstile\n6. Valider', resultat: 'Compte utilisateur (buyer) créé, redirection vers profil, email de bienvenue reçu' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Création de compte', cas: 'Création de compte "business"', prereq: '1. Lien du site: https://kin-sell.com/\n2. Adresse mail ou numéro de téléphone valide', etapes: '1. Accéder au site via le lien\n2. Cliquer sur "Créer un compte"\n3. Choisir "Entreprise"\n4. Remplir les champs (email, mot de passe, nom légal, etc.)\n5. Résoudre le CAPTCHA\n6. Valider', resultat: 'Compte business (seller) créé avec succès' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Création de compte', cas: 'Validation champs — données invalides', prereq: 'Être sur la page d\'inscription', etapes: '1. Laisser email vide\n2. Mot de passe < 8 caractères\n3. displayName < 2 caractères\n4. Valider', resultat: 'Messages d\'erreur clairs sur chaque champ invalide' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Création de compte', cas: 'Email déjà utilisé', prereq: 'Un compte existe avec cet email', etapes: '1. S\'inscrire avec un email déjà enregistré\n2. Valider', resultat: 'Erreur : email déjà utilisé' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Création de compte', cas: 'Détection multi-comptes (même IP)', prereq: 'Un compte déjà créé depuis cette IP', etapes: '1. Créer un 2e compte depuis la même IP en moins de 24h', resultat: 'FraudSignal créé, comportement selon politique sécurité' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Connexion email/mot de passe valides', prereq: 'Compte existant', etapes: '1. Aller sur /login\n2. Saisir email + mot de passe\n3. Résoudre CAPTCHA\n4. Valider', resultat: 'Connecté, redirection dashboard, cookie httpOnly posé' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Connexion — identifiants invalides', prereq: '', etapes: '1. Saisir un mauvais mot de passe\n2. Valider', resultat: 'Erreur : identifiants invalides, rate limit appliqué après X tentatives' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Connexion via Google OAuth', prereq: 'Compte Google existant', etapes: '1. Cliquer "Se connecter avec Google"\n2. Autoriser l\'application', resultat: 'Connecté avec compte Google, profil pré-rempli' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Connexion via Apple OAuth', prereq: 'Compte Apple existant', etapes: '1. Cliquer "Se connecter avec Apple"\n2. Autoriser', resultat: 'Connecté avec compte Apple' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Connexion par OTP téléphone', prereq: 'Numéro de téléphone valide', etapes: '1. Choisir "Connexion par téléphone"\n2. Saisir numéro\n3. Recevoir OTP\n4. Saisir code', resultat: 'Connecté avec numéro vérifié' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Connexion', cas: 'Entrée unifiée (email ou provider)', prereq: '', etapes: '1. Saisir un email sur la page d\'entrée\n2. Valider', resultat: 'Redirigé vers le bon flux (email/password ou OAuth)' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Session', cas: 'Refresh token automatique', prereq: 'Être connecté', etapes: '1. Attendre l\'expiration de l\'access token\n2. Effectuer une requête API', resultat: 'Token rafraîchi silencieusement, session maintenue sans interruption' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Session', cas: 'Déconnexion', prereq: 'Être connecté', etapes: '1. Cliquer sur "Déconnexion"', resultat: 'Session invalidée, cookie supprimé, redirection vers /login' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Session', cas: 'Liste des sessions actives', prereq: 'Être connecté', etapes: '1. Aller dans Paramètres > Sécurité > Sessions', resultat: 'Liste des sessions (appareil, IP, date) affichée' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Session', cas: 'Révoquer une session', prereq: 'Plusieurs sessions actives', etapes: '1. Sélectionner une session\n2. Cliquer "Révoquer"', resultat: 'Session supprimée, appareil déconnecté' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Session', cas: 'Révoquer toutes les sessions', prereq: 'Plusieurs sessions actives', etapes: '1. Cliquer "Déconnecter tous les appareils"', resultat: 'Toutes les sessions sauf l\'actuelle sont révoquées' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: '2FA / TOTP', cas: 'Setup 2FA TOTP', prereq: 'Être connecté, 2FA non activé', etapes: '1. Paramètres > Sécurité > Activer 2FA\n2. Scanner le QR code avec une app TOTP\n3. Saisir le code généré', resultat: '2FA activé, QR code affiché, code vérifié' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: '2FA / TOTP', cas: 'Login avec 2FA activé', prereq: '2FA activé', etapes: '1. Se connecter email/mot de passe\n2. Saisir le code TOTP', resultat: 'Accès autorisé après validation du code TOTP' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: '2FA / TOTP', cas: 'Désactivation 2FA', prereq: '2FA activé', etapes: '1. Paramètres > Sécurité > Désactiver 2FA\n2. Saisir mot de passe pour confirmer', resultat: '2FA désactivé, mot de passe requis pour confirmer' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Mot de passe', cas: 'Mot de passe oublié (forgot)', prereq: 'Compte existant', etapes: '1. Cliquer "Mot de passe oublié"\n2. Saisir email\n3. Recevoir code OTP 6 chiffres\n4. Saisir nouveau mot de passe', resultat: 'Mot de passe réinitialisé, connexion avec le nouveau' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Mot de passe', cas: 'Changement mot de passe (connecté)', prereq: 'Être connecté', etapes: '1. Paramètres > Mot de passe\n2. Saisir ancien + nouveau mot de passe\n3. Valider', resultat: 'Mot de passe mis à jour' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Vérification', cas: 'Vérification email', prereq: 'Email non vérifié', etapes: '1. Paramètres > Demander vérification email\n2. Recevoir code par email\n3. Saisir le code', resultat: 'Email marqué comme vérifié (badge)' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Vérification', cas: 'Vérification téléphone par OTP', prereq: 'Numéro non vérifié', etapes: '1. Paramètres > Vérifier téléphone\n2. Recevoir OTP\n3. Saisir le code', resultat: 'Téléphone marqué comme vérifié' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Suppression compte', cas: 'Demande de suppression de compte', prereq: 'Être connecté', etapes: '1. Paramètres > Supprimer mon compte\n2. Confirmer la suppression\n3. Saisir raison', resultat: 'Compte en statut PENDING_DELETION, raison enregistrée' },
  { mod: 'AUTHENTIFICATION', code: 'AUTH', feat: 'Appel suspension', cas: 'Soumettre un appel de suspension', prereq: 'Compte suspendu', etapes: '1. Sur la page /suspended, remplir le formulaire d\'appel\n2. Soumettre', resultat: 'Appel enregistré, admin notifié' },

  // ── PROFILS UTILISATEUR ──
  { mod: 'PROFILS', code: 'PROF', feat: 'Mon profil', cas: 'Voir mon profil complet', prereq: 'Être connecté', etapes: '1. Aller sur /profile ou /dashboard\n2. Vérifier les informations affichées', resultat: 'Profil complet affiché (nom, bio, avatar, localisation, etc.)' },
  { mod: 'PROFILS', code: 'PROF', feat: 'Mon profil', cas: 'Modifier mon profil', prereq: 'Être connecté', etapes: '1. Modifier displayName, bio, avatar\n2. Sauvegarder', resultat: 'Modifications enregistrées et affichées immédiatement' },
  { mod: 'PROFILS', code: 'PROF', feat: 'Mon profil', cas: 'Complétion de profil obligatoire', prereq: 'Profil incomplet', etapes: '1. Remplir les champs manquants (ville, pays, etc.)\n2. Sauvegarder', resultat: 'Profil marqué comme complet' },
  { mod: 'PROFILS', code: 'PROF', feat: 'Profil public', cas: 'Voir un profil public par username', prereq: '', etapes: '1. Aller sur /user/:username', resultat: 'Profil public affiché avec informations autorisées uniquement' },
  { mod: 'PROFILS', code: 'PROF', feat: 'Localisation', cas: 'Changer la visibilité localisation', prereq: 'Être connecté', etapes: '1. Paramètres > Visibilité\n2. Choisir parmi EXACT_PUBLIC, CITY_PUBLIC, REGION_PUBLIC, etc.', resultat: 'Localisation affichée selon le niveau de visibilité choisi' },
  { mod: 'PROFILS', code: 'PROF', feat: 'Signalement', cas: 'Signaler un utilisateur', prereq: '', etapes: '1. Sur un profil public, cliquer "Signaler"\n2. Choisir raison + message\n3. Valider', resultat: 'Signalement enregistré, admin notifié' },

  // ── BOUTIQUE / BUSINESS ──
  { mod: 'BOUTIQUE', code: 'BIZ', feat: 'Compte business', cas: 'Créer un compte business', prereq: 'Être connecté en tant qu\'utilisateur', etapes: '1. Paramètres > Créer compte business\n2. Remplir legalName, publicName, slug, description\n3. Valider', resultat: 'Compte business créé, boutique accessible par slug' },
  { mod: 'BOUTIQUE', code: 'BIZ', feat: 'Boutique', cas: 'Modifier ma boutique', prereq: 'Compte business existant', etapes: '1. Modifier description, logo, cover, zones de livraison, photos\n2. Sauvegarder', resultat: 'Modifications sauvegardées et visibles sur la page publique' },
  { mod: 'BOUTIQUE', code: 'BIZ', feat: 'Boutique', cas: 'Page publique boutique', prereq: '', etapes: '1. Aller sur /business/:slug', resultat: 'Page boutique affichée : logo, description, photos, articles, contact' },
  { mod: 'BOUTIQUE', code: 'BIZ', feat: 'Follow', cas: 'Suivre une boutique', prereq: 'Être connecté', etapes: '1. Sur la page boutique, cliquer "Suivre"', resultat: 'Boutique suivie, compteur followers incrémenté' },
  { mod: 'BOUTIQUE', code: 'BIZ', feat: 'Follow', cas: 'Ne plus suivre une boutique', prereq: 'Déjà abonné à la boutique', etapes: '1. Cliquer "Ne plus suivre"', resultat: 'Désabonné, compteur décrémenté' },

  // ── ANNONCES / LISTINGS ──
  { mod: 'ANNONCES', code: 'LIST', feat: 'Création annonce', cas: 'Créer une annonce PRODUIT', prereq: 'Être connecté, plan autorisant la création', etapes: '1. Cliquer "Publier une annonce"\n2. Type : PRODUIT\n3. Remplir titre, description, prix, catégorie, stock\n4. Ajouter photos (1-5)\n5. Publier', resultat: 'Annonce créée, modération ContentGuard IA passée, annonce publiée' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Création annonce', cas: 'Créer une annonce SERVICE', prereq: 'Être connecté', etapes: '1. Même flux que PRODUIT\n2. Type : SERVICE\n3. Publier', resultat: 'Annonce service créée et publiée' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Création annonce', cas: 'Limite freemium atteinte', prereq: 'Plan gratuit, maximum d\'annonces atteint', etapes: '1. Tenter de créer une annonce au-delà de la limite', resultat: 'Message d\'erreur / upsell vers un plan supérieur affiché' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Modification', cas: 'Modifier une annonce', prereq: 'Annonce existante', etapes: '1. Aller sur mes annonces\n2. Sélectionner une annonce\n3. Modifier titre/prix/description\n4. Sauvegarder', resultat: 'Modifications enregistrées' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Suppression', cas: 'Supprimer / archiver une annonce', prereq: 'Annonce existante', etapes: '1. Sélectionner annonce\n2. Cliquer "Supprimer" ou "Archiver"', resultat: 'Annonce en statut DELETED ou ARCHIVED, retirée de la recherche' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Liste', cas: 'Mes annonces — liste avec filtres', prereq: 'Avoir des annonces', etapes: '1. Aller sur "Mes annonces"\n2. Filtrer par statut (ACTIVE, ARCHIVED) et type (PRODUIT, SERVICE)', resultat: 'Liste paginée et filtrée correctement' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Statistiques', cas: 'Stats de mes annonces', prereq: 'Avoir des annonces avec vues', etapes: '1. Aller sur statistiques annonces', resultat: 'Nombre de vues, contacts, clics affichés' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Recherche', cas: 'Recherche publique d\'annonces', prereq: '', etapes: '1. Utiliser la barre de recherche\n2. Saisir un mot-clé\n3. Filtrer par type, ville, pays, rayon', resultat: 'Résultats pertinents, paginés, triés par pertinence' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Recherche', cas: 'Dernières annonces publiées', prereq: '', etapes: '1. Page d\'accueil ou section "Dernières annonces"', resultat: 'Annonces récentes affichées par date décroissante' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Vues', cas: 'Compteur de vues enregistré', prereq: '', etapes: '1. Ouvrir le détail d\'une annonce', resultat: 'Vue comptabilisée (POST /listings/:id/view)' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Médias', cas: 'Upload images (1-5, max 10MB chacune)', prereq: '', etapes: '1. Ajouter 1 à 5 images (JPEG, PNG, WebP, GIF)\n2. Vérifier la taille max 10MB par image', resultat: 'Images uploadées, compressées, affichées' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Médias', cas: 'Upload vidéo (1, max 50MB)', prereq: '', etapes: '1. Ajouter une vidéo (MP4, WebM)\n2. Vérifier la taille max 50MB', resultat: 'Vidéo uploadée et lisible' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Médias', cas: 'Upload audio (max 50MB)', prereq: '', etapes: '1. Ajouter un audio (MP3, OGG, WAV)', resultat: 'Audio uploadé et jouable' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Médias', cas: 'Upload format invalide rejeté', prereq: '', etapes: '1. Tenter d\'uploader un fichier .exe, .pdf ou autre format interdit', resultat: 'Upload refusé avec message d\'erreur (validation MIME)' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Promotion', cas: 'Activer une promotion individuelle', prereq: 'Annonce publiée', etapes: '1. Sélectionner annonce\n2. Définir prix promo, dates début/fin, label\n3. Activer', resultat: 'Promo active, prix barré affiché, ancien prix visible' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Promotion', cas: 'Créer une promotion bundle (lot)', prereq: '≥2 annonces du même vendeur', etapes: '1. Sélectionner 2-20 articles\n2. Définir prix bundle et quantités\n3. Créer', resultat: 'Bundle créé, affiché publiquement, prix réduit visible' },
  { mod: 'ANNONCES', code: 'LIST', feat: 'Promotion', cas: 'Annuler une promotion active', prereq: 'Promotion en cours', etapes: '1. Sélectionner la promo\n2. Cliquer "Annuler"', resultat: 'Promo en statut CANCELLED, prix normal restauré' },

  // ── PANIER & COMMANDES ──
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Panier', cas: 'Voir le contenu du panier', prereq: 'Articles dans le panier', etapes: '1. Aller sur /cart', resultat: 'Articles affichés avec prix, quantités et total' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Panier', cas: 'Ajouter un article au panier', prereq: 'Être connecté', etapes: '1. Sur une annonce, cliquer "Ajouter au panier"', resultat: 'Article ajouté, notification temps réel (socket cart:updated)' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Panier', cas: 'Modifier la quantité d\'un item', prereq: 'Item dans le panier', etapes: '1. Modifier la quantité dans le panier', resultat: 'Quantité mise à jour, montant total recalculé' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Panier', cas: 'Supprimer un item du panier', prereq: 'Item dans le panier', etapes: '1. Cliquer sur l\'icône supprimer', resultat: 'Item retiré, total mis à jour' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Checkout', cas: 'Checkout standard', prereq: 'Panier non vide', etapes: '1. Depuis le panier, cliquer "Commander"\n2. Ajouter notes + adresse livraison + coordonnées GPS\n3. Confirmer', resultat: 'Commande(s) créée(s) groupées par vendeur, notification push au vendeur' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Checkout', cas: 'Checkout Mobile Money', prereq: 'Panier non vide', etapes: '1. Choisir Mobile Money\n2. Sélectionner provider (Orange/M-Pesa)\n3. Saisir numéro 243XXXXXXXXX\n4. Confirmer', resultat: 'Paiement initié, attente confirmation webhook' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Commandes', cas: 'Mes commandes (acheteur)', prereq: 'Commandes passées', etapes: '1. Aller sur "Mes commandes"', resultat: 'Commandes listées avec statut, pagination fonctionnelle' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Commandes', cas: 'Mes commandes (vendeur)', prereq: 'Commandes reçues', etapes: '1. Aller sur "Commandes reçues"', resultat: 'Commandes vendeur listées avec statut' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Commandes', cas: 'Détail d\'une commande', prereq: 'Commande existante', etapes: '1. Cliquer sur une commande', resultat: 'Détail complet : articles, prix, statut, infos acheteur/vendeur' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Commandes', cas: 'Changer statut (vendeur)', prereq: 'Commande reçue', etapes: '1. Sélectionner commande\n2. Changer statut : PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED', resultat: 'Statut mis à jour, notification push à l\'acheteur à chaque étape' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Commandes', cas: 'Annuler une commande', prereq: 'Commande en cours', etapes: '1. Sélectionner commande\n2. Annuler', resultat: 'Commande CANCELED, stock restauré si applicable' },
  { mod: 'PANIER & COMMANDES', code: 'CMD', feat: 'Validation', cas: 'Validation QR à la livraison', prereq: 'Commande SHIPPED', etapes: '1. Acheteur affiche le QR de la commande\n2. Vendeur/livreur scanne le QR', resultat: 'Commande validée comme DELIVERED' },

  // ── NÉGOCIATIONS ──
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Négociation simple', cas: 'Créer une négociation (proposer un prix)', prereq: 'Annonce publiée, négociation autorisée', etapes: '1. Sur une annonce, cliquer "Négocier"\n2. Proposer un prix + message\n3. Envoyer', resultat: 'Négociation créée (PENDING), vendeur notifié (push + socket)' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Négociation simple', cas: 'Vendeur accepte la proposition', prereq: 'Négociation reçue', etapes: '1. Voir la négociation reçue\n2. Cliquer "Accepter"', resultat: 'Négociation ACCEPTED, acheteur notifié' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Négociation simple', cas: 'Vendeur refuse la proposition', prereq: 'Négociation reçue', etapes: '1. Cliquer "Refuser"', resultat: 'Négociation REFUSED' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Négociation simple', cas: 'Vendeur fait une contre-offre', prereq: 'Négociation reçue', etapes: '1. Saisir un contre-prix\n2. Envoyer', resultat: 'Contre-offre envoyée, acheteur notifié' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Négociation groupée', cas: 'Négocier un bundle de plusieurs articles', prereq: 'Plusieurs articles du même vendeur', etapes: '1. Sélectionner plusieurs articles\n2. Proposer un prix global\n3. Envoyer', resultat: 'Négociation bundle créée' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Auto-Shop', cas: 'Configurer les règles auto-négociation', prereq: 'Compte business', etapes: '1. Aller sur Auto-Shop\n2. Activer pour un article\n3. Définir plancher (30-99%), discount max (1-50%), fermeté', resultat: 'Règles enregistrées, IA active pour cet article' },
  { mod: 'NÉGOCIATIONS', code: 'NEG', feat: 'Auto-Shop', cas: 'Vérifier la négociation automatique IA', prereq: 'Règles auto configurées', etapes: '1. Un acheteur envoie une offre sur un article avec auto-rules', resultat: 'IA répond automatiquement selon les règles (accepte, refuse ou contre-offre)' },

  // ── BILLING / ABONNEMENTS ──
  { mod: 'BILLING', code: 'BILL', feat: 'Catalogue', cas: 'Voir les plans disponibles', prereq: '', etapes: '1. Aller sur /forfaits (ou /plans, /pricing)', resultat: 'Plans USER (FREE, BOOST, AUTO, PRO_VENDEUR) et BUSINESS (STARTER, BUSINESS, SCALE) affichés avec prix' },
  { mod: 'BILLING', code: 'BILL', feat: 'Catalogue', cas: 'Voir mon plan actuel', prereq: 'Être connecté', etapes: '1. Aller sur "Mon abonnement"', resultat: 'Plan actuel, date renouvellement, add-ons actifs affichés' },
  { mod: 'BILLING', code: 'BILL', feat: 'Checkout PayPal', cas: 'Souscrire un plan via PayPal', prereq: 'Compte PayPal', etapes: '1. Choisir un plan\n2. Cliquer "Payer avec PayPal"\n3. Compléter le paiement PayPal', resultat: 'Paiement capturé, plan activé, commande de paiement créée' },
  { mod: 'BILLING', code: 'BILL', feat: 'Checkout PayPal', cas: 'Souscrire avec code promo', prereq: 'Coupon valide', etapes: '1. Saisir code promo\n2. Vérifier la réduction\n3. Payer via PayPal', resultat: 'Prix réduit appliqué, metadata coupon persistée' },
  { mod: 'BILLING', code: 'BILL', feat: 'Coupons', cas: 'Preview coupon — valide', prereq: 'Coupon existant', etapes: '1. Saisir le code\n2. Cliquer "Vérifier"', resultat: 'Prix initial, % réduction, prix final et validité affichés' },
  { mod: 'BILLING', code: 'BILL', feat: 'Coupons', cas: 'Coupon invalide / expiré', prereq: '', etapes: '1. Saisir un code invalide ou expiré', resultat: 'Message d\'erreur clair (expiré, inéligible, max utilisations atteint)' },
  { mod: 'BILLING', code: 'BILL', feat: 'Apple IAP', cas: 'Achat via Apple In-App Purchase', prereq: 'iOS, Apple ID', etapes: '1. Sur iOS, sélectionner un plan\n2. Acheter via Apple IAP', resultat: 'Receipt vérifié, plan activé' },
  { mod: 'BILLING', code: 'BILL', feat: 'Add-ons', cas: 'Activer un add-on (IA_MERCHANT, BOOST, etc.)', prereq: 'Plan actif', etapes: '1. Aller sur la page add-ons\n2. Choisir un add-on\n3. Payer', resultat: 'Add-on activé, fonctionnalités débloquées' },
  { mod: 'BILLING', code: 'BILL', feat: 'Historique', cas: 'Mes commandes de paiement', prereq: 'Paiements effectués', etapes: '1. Aller sur historique paiements', resultat: 'Commandes listées avec statut (PAID, VALIDATED, etc.)' },

  // ── MOBILE MONEY ──
  { mod: 'MOBILE MONEY', code: 'MOMO', feat: 'Paiement', cas: 'Paiement Orange Money', prereq: 'Numéro Orange Money valide (243XXXXXXXXX)', etapes: '1. Choisir Orange Money comme moyen de paiement\n2. Saisir numéro\n3. Confirmer', resultat: 'Paiement initié, attente confirmation webhook Orange' },
  { mod: 'MOBILE MONEY', code: 'MOMO', feat: 'Paiement', cas: 'Paiement M-Pesa', prereq: 'Numéro M-Pesa valide', etapes: '1. Choisir M-Pesa\n2. Saisir numéro\n3. Confirmer', resultat: 'Paiement initié, attente confirmation webhook M-Pesa' },
  { mod: 'MOBILE MONEY', code: 'MOMO', feat: 'Suivi', cas: 'Vérifier statut paiement', prereq: 'Paiement initié', etapes: '1. Aller sur le suivi du paiement', resultat: 'Statut à jour (PENDING / PAID / FAILED)' },
  { mod: 'MOBILE MONEY', code: 'MOMO', feat: 'Historique', cas: 'Historique paiements Mobile Money', prereq: 'Paiements effectués', etapes: '1. Aller sur historique Mobile Money', resultat: 'Paiements listés avec statut et montant CDF' },

  // ── MESSAGERIE / CHAT ──
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Conversations', cas: 'Voir mes conversations', prereq: 'Être connecté', etapes: '1. Aller sur /messages', resultat: 'Conversations listées, ordonnées par date du dernier message' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Conversations', cas: 'Créer un DM (message direct)', prereq: 'Être connecté', etapes: '1. Depuis un profil utilisateur, cliquer "Envoyer un message"\n2. Saisir le message\n3. Envoyer', resultat: 'Conversation DM créée, message envoyé' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Conversations', cas: 'Créer une conversation de groupe', prereq: 'Être connecté', etapes: '1. Cliquer "Nouveau groupe"\n2. Ajouter des participants\n3. Nommer le groupe', resultat: 'Groupe créé avec les participants' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Messages', cas: 'Envoyer un message texte', prereq: 'Conversation ouverte', etapes: '1. Saisir un texte\n2. Envoyer', resultat: 'Message envoyé et reçu en temps réel (Socket.IO)' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Messages', cas: 'Envoyer un média (image/vidéo/audio/fichier)', prereq: 'Conversation ouverte', etapes: '1. Joindre un fichier\n2. Envoyer', resultat: 'Média envoyé et affiché correctement' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Messages', cas: 'Répondre à un message (reply)', prereq: 'Message existant', etapes: '1. Sélectionner un message\n2. Cliquer "Répondre"\n3. Saisir la réponse', resultat: 'Réponse envoyée avec référence visuelle au message original' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Messages', cas: 'Modifier un message envoyé', prereq: 'Message envoyé', etapes: '1. Sélectionner mon message\n2. Cliquer "Modifier"\n3. Modifier le texte', resultat: 'Message modifié, indicateur "modifié" visible' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Messages', cas: 'Supprimer un message', prereq: 'Message envoyé', etapes: '1. Sélectionner mon message\n2. Cliquer "Supprimer"', resultat: 'Message supprimé pour tous' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Lecture', cas: 'Marquer conversation comme lue', prereq: 'Conversation non lue', etapes: '1. Ouvrir la conversation', resultat: 'Conversation marquée comme lue, badge notification disparaît' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Temps réel', cas: 'Indicateur en ligne', prereq: 'Contact connecté', etapes: '1. Ouvrir une conversation avec un contact connecté', resultat: 'Statut "en ligne" affiché' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'MessageGuard IA', cas: 'Envoi numéro de téléphone bloqué', prereq: '', etapes: '1. Envoyer un message contenant un numéro de téléphone', resultat: 'Message BLOCKED ou WARNED par MessageGuard IA' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'MessageGuard IA', cas: 'Envoi email/lien externe bloqué', prereq: '', etapes: '1. Envoyer un message contenant un email ou lien externe', resultat: 'Message BLOCKED ou WARNED' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'MessageGuard IA', cas: 'Message normal autorisé', prereq: '', etapes: '1. Envoyer un message texte normal sans info sensible', resultat: 'Message ALLOWED, envoyé normalement' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Trust Guard', cas: 'Limite messages — compte faible confiance', prereq: 'Nouveau compte (trust score < 40)', etapes: '1. Tenter d\'envoyer beaucoup de messages rapidement', resultat: 'Restriction MESSAGE_LIMIT appliquée' },
  { mod: 'MESSAGERIE', code: 'MSG', feat: 'Appels', cas: 'Voir le journal des appels', prereq: 'Appels effectués', etapes: '1. Aller sur le journal des appels', resultat: 'Historique appels (audio/vidéo, statut MISSED/ANSWERED/REJECTED)' },

  // ── SO-KIN (Réseau Social) ──
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Feed', cas: 'Voir le fil d\'actualité', prereq: '', etapes: '1. Aller sur /sokin', resultat: 'Posts géolocalisés, paginés, filtrés affichés' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Créer un post SHOWCASE', prereq: 'Être connecté', etapes: '1. Cliquer "Publier"\n2. Type : SHOWCASE\n3. Ajouter texte et/ou médias (max 5, max 2 vidéos)\n4. Publier', resultat: 'Post créé après modération ContentGuard IA, affiché dans le feed' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Créer un post SELLING', prereq: 'Être connecté', etapes: '1. Type : SELLING\n2. Ajouter texte + photos/vidéos\n3. Publier', resultat: 'Post de vente publié avec lien vers annonce' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Créer un post avec background (texte seul)', prereq: '', etapes: '1. Publier un post texte seul\n2. Choisir un background personnalisé', resultat: 'Post affiché avec background coloré' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Limite médias dépassée', prereq: '', etapes: '1. Tenter d\'ajouter >5 médias ou >2 vidéos ou vidéo+audio', resultat: 'Erreur : limite de médias dépassée' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Supprimer un post', prereq: 'Mon post existant', etapes: '1. Sélectionner mon post\n2. Cliquer "Supprimer"', resultat: 'Post supprimé' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Modifier un post', prereq: 'Mon post existant', etapes: '1. Sélectionner post\n2. Modifier texte/médias\n3. Sauvegarder', resultat: 'Post modifié' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Publications', cas: 'Reposter un post', prereq: '', etapes: '1. Sur un post, cliquer "Reposter"', resultat: 'Repost créé dans mon profil' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Commentaires', cas: 'Laisser un commentaire', prereq: '', etapes: '1. Ouvrir un post\n2. Saisir un commentaire\n3. Envoyer', resultat: 'Commentaire affiché sous le post' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Commentaires', cas: 'Commentaire imbriqué (réponse)', prereq: 'Commentaire existant', etapes: '1. Répondre à un commentaire existant', resultat: 'Réponse imbriquée affichée sous le commentaire parent' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Réactions', cas: 'Réagir à un post (LIKE, LOVE, HAHA, etc.)', prereq: '', etapes: '1. Sur un post, cliquer/long-presser le bouton réaction\n2. Choisir une réaction', resultat: 'Réaction enregistrée, compteur mis à jour' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Bookmarks', cas: 'Sauvegarder un post en bookmark', prereq: 'Être connecté', etapes: '1. Cliquer "Bookmark" sur un post', resultat: 'Post ajouté à /sokin/bookmarks' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Signalement', cas: 'Signaler un post', prereq: '', etapes: '1. Cliquer "Signaler"\n2. Choisir raison (SPAM, HARASSMENT, SCAM, etc.)\n3. Valider', resultat: 'Signalement enregistré, admin notifié' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Tendances', cas: 'Voir les tendances locales', prereq: '', etapes: '1. Aller sur la section tendances', resultat: 'Hashtags populaires et topics en tendance affichés' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Analytics', cas: 'Voir les analytics d\'un post', prereq: 'Mon post avec interactions', etapes: '1. Sur mon post, cliquer "Statistiques"', resultat: 'Vues, réactions, commentaires, partages affichés' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Insights', cas: 'Voir mes insights auteur (7j/30j)', prereq: 'Avoir publié des posts', etapes: '1. Aller sur /sokin/dashboard', resultat: 'Insights 7 jours et 30 jours affichés' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Smart Feed', cas: 'Voir suggestions personnalisées', prereq: 'Être connecté', etapes: '1. Parcourir le smart feed', resultat: 'Blocs suggérés, hashtags chauds, idées de publication, opportunités boost' },
  { mod: 'SO-KIN', code: 'SOKIN', feat: 'Stories', cas: 'Publier une story (éphémère 24h)', prereq: 'Être connecté', etapes: '1. Publier une story (image, vidéo ou texte)', resultat: 'Story publiée, visible 24h puis expire automatiquement' },

  // ── EXPLORER ──
  { mod: 'EXPLORER', code: 'EXPL', feat: 'Découverte', cas: 'Page explorer — vue d\'ensemble', prereq: '', etapes: '1. Aller sur /explorer', resultat: 'Stats, publicités, boutiques en vedette et profils affichés' },
  { mod: 'EXPLORER', code: 'EXPL', feat: 'Recherche', cas: 'Recherche inline depuis explorer', prereq: '', etapes: '1. Saisir un terme dans la barre de recherche explorer', resultat: 'Résultats inline (annonces, boutiques, profils) affichés' },
  { mod: 'EXPLORER', code: 'EXPL', feat: 'Carte', cas: 'Vue carte des annonces/boutiques', prereq: '', etapes: '1. Basculer en vue carte', resultat: 'Annonces et boutiques géolocalisées affichées sur la carte' },

  // ── CONNEXIONS & CONTACTS ──
  { mod: 'CONNEXIONS', code: 'CONN', feat: 'Connexion So-Kin', cas: 'Envoyer une demande de connexion', prereq: 'Être connecté', etapes: '1. Sur un profil, cliquer "Se connecter"', resultat: 'Demande envoyée (PENDING)' },
  { mod: 'CONNEXIONS', code: 'CONN', feat: 'Connexion So-Kin', cas: 'Accepter une demande de connexion', prereq: 'Demande reçue', etapes: '1. Voir demandes reçues\n2. Accepter', resultat: 'Connexion ACCEPTED, visible dans les contacts' },
  { mod: 'CONNEXIONS', code: 'CONN', feat: 'Connexion So-Kin', cas: 'Bloquer un utilisateur', prereq: '', etapes: '1. Bloquer un utilisateur', resultat: 'Connexion BLOCKED, plus de messages ni interactions possibles' },
  { mod: 'CONNEXIONS', code: 'CONN', feat: 'Import contacts', cas: 'Importer contacts téléphone', prereq: 'Permission contacts autorisée', etapes: '1. Autoriser l\'accès aux contacts\n2. Importer', resultat: 'Contacts importés, suggestions de connexion générées' },
  { mod: 'CONNEXIONS', code: 'CONN', feat: 'Import contacts', cas: 'Importer amis Facebook', prereq: 'Compte Facebook connecté', etapes: '1. Connecter Facebook\n2. Importer amis', resultat: 'Amis FB trouvés sur la plateforme suggérés' },

  // ── PUBLICITÉS & IA ADS ──
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Bannières', cas: 'Affichage bannière publique', prereq: '', etapes: '1. Naviguer sur une page avec bannière pub', resultat: 'Bannière affichée selon géolocalisation, impression comptée' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Bannières', cas: 'Clic sur une publicité', prereq: 'Bannière visible', etapes: '1. Cliquer sur une bannière', resultat: 'Clic comptabilisé, redirection vers la cible' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Boost', cas: 'Booster un article', prereq: 'Add-on BOOST_VISIBILITY actif', etapes: '1. Sélectionner article\n2. Choisir scope (LOCAL, NATIONAL, CROSS_BORDER)\n3. Activer le boost', resultat: 'Article boosté, visibilité augmentée dans la recherche/feed' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Boost', cas: 'Limite 50 boosts actifs', prereq: '50 boosts déjà actifs', etapes: '1. Tenter de booster un 51e article', resultat: 'Refus avec message : limite de 50 boosts actifs atteinte' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Boost', cas: 'Boost sans add-on requis', prereq: 'Pas d\'add-on BOOST_VISIBILITY', etapes: '1. Tenter de booster un article', resultat: 'Action bloquée, upsell vers l\'add-on affiché' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Recommandations IA', cas: 'Voir les recommandations IA', prereq: 'Publication d\'article ou jalon atteint', etapes: '1. Attendre un trigger IA (publication, vente, etc.)', resultat: 'Recommandation affichée (BOOST_ARTICLE, UPGRADE_PLAN, PRICE_ADVICE, etc.)' },
  { mod: 'PUBLICITÉS & IA', code: 'ADS', feat: 'Essais IA', cas: 'Activer un essai gratuit IA', prereq: 'Proposition d\'essai reçue', etapes: '1. Voir la proposition d\'essai\n2. Cliquer "Activer"', resultat: 'Essai activé temporairement (ACTIVE), fonctionnalité accessible' },

  // ── ANALYTICS IA ──
  { mod: 'ANALYTICS IA', code: 'AIAI', feat: 'Insights', cas: 'Voir les insights de base (tous)', prereq: 'Être connecté', etapes: '1. Aller sur la page analytics', resultat: 'Insights niveau 1 affichés (métriques de base)' },
  { mod: 'ANALYTICS IA', code: 'AIAI', feat: 'Insights', cas: 'Insights profonds (plan premium)', prereq: 'Plan premium ou add-on IA_MERCHANT', etapes: '1. Accéder aux analytics avancés', resultat: 'Diagnostic complet, anomalies, tendances, mémoire IA' },
  { mod: 'ANALYTICS IA', code: 'AIAI', feat: 'Profil vendeur', cas: 'Profil vendeur IA', prereq: 'Add-on IA_MERCHANT actif', etapes: '1. Accéder au profil vendeur IA', resultat: 'Profil vendeur IA détaillé avec recommandations' },
  { mod: 'ANALYTICS IA', code: 'AIAI', feat: 'Nudges', cas: 'Nudges pricing vers forfaits', prereq: '', etapes: '1. Naviguer sur /forfaits', resultat: 'Nudges contextuels affichés selon le profil utilisateur' },

  // ── COUPONS / INCENTIVES ──
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Validation', cas: 'Valider un coupon valide', prereq: 'Coupon existant et valide', etapes: '1. Saisir le code coupon\n2. Valider', resultat: 'Coupon validé, réduction affichée' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Preview', cas: 'Prévisualiser un coupon', prereq: 'Code coupon', etapes: '1. Saisir le code\n2. Voir le preview', resultat: 'Prix initial, pourcentage réduction, prix final, date validité' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Validation', cas: 'Coupon expiré', prereq: 'Coupon expiré', etapes: '1. Saisir un code coupon expiré', resultat: 'Message : coupon expiré' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Quotas', cas: 'Quota mensuel (max 7 coupons/mois/user)', prereq: '7 coupons utilisés ce mois', etapes: '1. Tenter d\'utiliser un 8e coupon', resultat: 'Refusé : quota mensuel atteint' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Admin', cas: 'Admin — créer un coupon', prereq: 'Être SUPER_ADMIN', etapes: '1. Admin > Incentives\n2. Créer un coupon (type, %, cible, segment, max uses)\n3. Sauvegarder', resultat: 'Coupon créé avec tous les paramètres' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Admin', cas: 'Admin — voir les rédemptions', prereq: 'Être admin', etapes: '1. Admin > Incentives > Rédemptions', resultat: 'Historique des rédemptions avec filtres et pagination' },
  { mod: 'INCENTIVES', code: 'INCEN', feat: 'Admin', cas: 'Admin — dashboard quotas', prereq: 'Être admin', etapes: '1. Admin > Incentives > Quotas', resultat: 'Dashboard quotas par utilisateur affiché' },

  // ── AVIS / REVIEWS ──
  { mod: 'AVIS', code: 'REV', feat: 'Avis vérifié', cas: 'Laisser un avis lié à une commande', prereq: 'Commande livrée sans avis', etapes: '1. Après livraison, aller sur l\'avis\n2. Donner 1-5 étoiles + texte\n3. Soumettre', resultat: 'Avis créé avec badge "vérifié" (lié à la commande)' },
  { mod: 'AVIS', code: 'REV', feat: 'Avis libre', cas: 'Laisser un avis sans commande', prereq: '', etapes: '1. Sur un profil, cliquer "Laisser un avis"\n2. Donner 1-5 étoiles + texte', resultat: 'Avis créé sans badge vérifié' },
  { mod: 'AVIS', code: 'REV', feat: 'Commandes en attente', cas: 'Voir les commandes sans avis', prereq: 'Commandes livrées', etapes: '1. Aller sur "Avis en attente"', resultat: 'Liste des commandes en attente d\'avis' },
  { mod: 'AVIS', code: 'REV', feat: 'Double avis', cas: 'Tenter 2 avis pour la même commande', prereq: 'Avis déjà laissé sur cette commande', etapes: '1. Tenter de laisser un 2e avis sur la même commande', resultat: 'Refusé : un seul avis par commande autorisé' },

  // ── VÉRIFICATION / BADGES ──
  { mod: 'VÉRIFICATION', code: 'VERIF', feat: 'Demande', cas: 'Soumettre une demande de vérification USER', prereq: 'Être connecté, non vérifié', etapes: '1. Paramètres > Vérification\n2. Soumettre la demande (accountType: USER)', resultat: 'Demande PENDING créée' },
  { mod: 'VÉRIFICATION', code: 'VERIF', feat: 'Demande', cas: 'Soumettre une demande de vérification BUSINESS', prereq: 'Compte business actif', etapes: '1. Soumettre la demande (accountType: BUSINESS)', resultat: 'Demande créée' },
  { mod: 'VÉRIFICATION', code: 'VERIF', feat: 'Score', cas: 'Voir mon score de crédibilité IA', prereq: '', etapes: '1. Aller sur la page vérification', resultat: 'Score de crédibilité IA affiché avec détails' },
  { mod: 'VÉRIFICATION', code: 'VERIF', feat: 'Admin', cas: 'Admin — approuver/rejeter une demande', prereq: 'Être admin', etapes: '1. Admin > Vérification > Demandes en attente\n2. Sélectionner une demande\n3. Approuver ou rejeter', resultat: 'Statut mis à jour (VERIFIED/REJECTED), historique loggé' },

  // ── VITRINES (Portfolio) ──
  { mod: 'VITRINES', code: 'VITR', feat: 'CRUD', cas: 'Créer une vitrine (diplôme/certificat)', prereq: 'Être connecté', etapes: '1. Aller sur mes vitrines\n2. Ajouter un titre + fichier/image\n3. Sauvegarder', resultat: 'Vitrine créée et visible sur le profil' },
  { mod: 'VITRINES', code: 'VITR', feat: 'CRUD', cas: 'Modifier une vitrine', prereq: 'Vitrine existante', etapes: '1. Sélectionner la vitrine\n2. Modifier titre/document\n3. Sauvegarder', resultat: 'Vitrine mise à jour' },
  { mod: 'VITRINES', code: 'VITR', feat: 'Réordonnement', cas: 'Réordonner les vitrines', prereq: '≥2 vitrines', etapes: '1. Glisser-déposer pour réorganiser l\'ordre', resultat: 'Nouvel ordre sauvegardé' },

  // ── NOTIFICATIONS ──
  { mod: 'NOTIFICATIONS', code: 'NOTIF', feat: 'Push Web', cas: 'Recevoir une notification push web (VAPID)', prereq: 'Navigateur autorisé, abonnement push', etapes: '1. S\'abonner aux notifications\n2. Déclencher un événement (message, commande, etc.)', resultat: 'Notification push reçue dans le navigateur' },
  { mod: 'NOTIFICATIONS', code: 'NOTIF', feat: 'Push Mobile', cas: 'Recevoir une notification push FCM (Android)', prereq: 'Token FCM enregistré', etapes: '1. Enregistrer le token FCM\n2. Déclencher un événement', resultat: 'Notification push reçue sur le mobile' },
  { mod: 'NOTIFICATIONS', code: 'NOTIF', feat: 'Centre', cas: 'Voir toutes les notifications', prereq: '', etapes: '1. Cliquer sur l\'icône notifications', resultat: 'Centre de notifications affiché avec toutes les notifs par date' },

  // ── GÉOLOCALISATION ──
  { mod: 'GÉOLOCALISATION', code: 'GEO', feat: 'Autocomplete', cas: 'Recherche adresse avec autocomplete', prereq: '', etapes: '1. Saisir une adresse dans un champ localisation', resultat: 'Suggestions autocomplete affichées (OpenStreetMap)' },
  { mod: 'GÉOLOCALISATION', code: 'GEO', feat: 'Reverse geocoding', cas: 'Déterminer adresse depuis la position GPS', prereq: 'Géolocalisation autorisée', etapes: '1. Autoriser la géolocalisation du navigateur', resultat: 'Adresse déterminée et pré-remplie automatiquement' },

  // ── MARKET INTELLIGENCE ──
  { mod: 'MARKET', code: 'MKT', feat: 'Stats marché', cas: 'Voir les stats marché d\'une ville', prereq: '', etapes: '1. Sélectionner un pays et une ville\n2. Choisir une catégorie', resultat: 'Prix moyen, min, max, score demande/offre, tendance affichés' },
  { mod: 'MARKET', code: 'MKT', feat: 'Recommandation', cas: 'Obtenir une recommandation de prix', prereq: '', etapes: '1. Soumettre les détails d\'un produit', resultat: 'Prix recommandé affiché basé sur les données marché' },
  { mod: 'MARKET', code: 'MKT', feat: 'Taux de change', cas: 'Voir les taux de change', prereq: '', etapes: '1. Consulter les taux de change', resultat: 'Taux depuis USD vers toutes les devises affichés' },

  // ── SÉCURITÉ & TRUST ──
  { mod: 'SÉCURITÉ', code: 'SEC', feat: 'Rate limiting', cas: 'Vérifier le rate limiting', prereq: '', etapes: '1. Envoyer de nombreuses requêtes rapidement sur un même endpoint', resultat: 'Requêtes bloquées après le seuil avec code 429' },
  { mod: 'SÉCURITÉ', code: 'SEC', feat: 'Anti-scraping', cas: 'Scraping de profils bloqué', prereq: '', etapes: '1. Accéder de manière répétitive aux profils publics', resultat: 'Requêtes bloquées par scrapeGuard' },
  { mod: 'SÉCURITÉ', code: 'SEC', feat: 'Trust Score', cas: 'Sanctions automatiques — trust score', prereq: 'Comportement abusif signalé', etapes: '1. Utilisateur signalé plusieurs fois', resultat: 'Trust score diminué, restrictions appliquées selon le niveau' },
  { mod: 'SÉCURITÉ', code: 'SEC', feat: 'Admin', cas: 'Dashboard sécurité (admin)', prereq: 'Être admin', etapes: '1. Admin > Sécurité', resultat: 'Events sécurité, signaux de fraude, restrictions affichés' },
  { mod: 'SÉCURITÉ', code: 'SEC', feat: 'Admin', cas: 'Résoudre un signal de fraude', prereq: 'Être admin, signal existant', etapes: '1. Sélectionner un signal de fraude\n2. Résoudre', resultat: 'Signal marqué comme résolu' },

  // ── ADMIN DASHBOARD ──
  { mod: 'ADMIN', code: 'ADM', feat: 'Dashboard', cas: 'Vue d\'ensemble admin', prereq: 'Être admin', etapes: '1. Se connecter en tant qu\'admin\n2. Aller sur /admin', resultat: 'Dashboard avec statistiques générales affiché' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Utilisateurs', cas: 'Lister les utilisateurs', prereq: 'Être admin', etapes: '1. Admin > Utilisateurs\n2. Rechercher / filtrer (rôle, statut, pays)', resultat: 'Liste paginée avec recherche et filtres fonctionnels' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Utilisateurs', cas: 'Suspendre un utilisateur', prereq: 'Être admin', etapes: '1. Sélectionner un utilisateur\n2. Cliquer "Suspendre"\n3. Saisir durée + raison + mot de passe admin', resultat: 'Utilisateur suspendu, notifié, accès bloqué' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Utilisateurs', cas: 'Réactiver un compte suspendu', prereq: 'Utilisateur suspendu', etapes: '1. Sélectionner utilisateur suspendu\n2. Cliquer "Réactiver"', resultat: 'Compte réactivé, accès restauré' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Utilisateurs', cas: 'Changer le rôle d\'un utilisateur', prereq: 'Être admin', etapes: '1. Sélectionner un utilisateur\n2. Changer le rôle (USER/BUSINESS/ADMIN)', resultat: 'Rôle mis à jour' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Blog', cas: 'CRUD articles blog', prereq: 'Être admin', etapes: '1. Admin > Blog\n2. Créer/modifier/supprimer un article\n3. Publier', resultat: 'Article publié sur /blog, visible publiquement' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Blog', cas: 'Génération articles IA (Gemini)', prereq: 'Être SUPER_ADMIN', etapes: '1. Admin > Blog > Générer automatiquement', resultat: 'Articles générés par Gemini IA' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Transactions', cas: 'Voir les transactions', prereq: 'Être admin', etapes: '1. Admin > Transactions', resultat: 'Transactions listées avec montants et statuts' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Signalements', cas: 'Gérer les signalements', prereq: 'Être admin', etapes: '1. Admin > Signalements\n2. Voir un signalement\n3. Résoudre', resultat: 'Signalement résolu, action appliquée' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Publicités', cas: 'CRUD publicités / offres', prereq: 'Être admin', etapes: '1. Admin > Publicités\n2. Créer/modifier/supprimer une pub\n3. Changer statut', resultat: 'Publicité gérée, visible ou masquée selon statut' },
  { mod: 'ADMIN', code: 'ADM', feat: 'IA Management', cas: 'Gérer les agents IA', prereq: 'Être admin', etapes: '1. Admin > IA Control\n2. Voir agents, stats, logs\n3. Modifier config si SUPER_ADMIN', resultat: 'Configuration IA mise à jour' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Admin Management', cas: 'Créer un admin (SUPER_ADMIN)', prereq: 'Être SUPER_ADMIN', etapes: '1. Admin > Gestion admins\n2. Créer un nouvel admin\n3. Affecter un niveau (LEVEL_1 à LEVEL_5)', resultat: 'Admin créé avec les permissions du niveau affecté' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Audit', cas: 'Consulter les logs d\'audit', prereq: 'Être admin', etapes: '1. Admin > Audit Logs', resultat: 'Actions admin listées avec horodatage et détails' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Settings', cas: 'Modifier les paramètres du site', prereq: 'Être SUPER_ADMIN', etapes: '1. Admin > Settings\n2. Modifier un paramètre\n3. Sauvegarder', resultat: 'Paramètre mis à jour' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Feed modération', cas: 'Modérer les posts So-Kin', prereq: 'Être admin', etapes: '1. Admin > Feed\n2. Voir posts flaggés\n3. Modérer (HIDDEN/DELETED)', resultat: 'Post modéré, action loggée' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Appels', cas: 'Gérer les appels de suspension', prereq: 'Être admin', etapes: '1. Admin > Appels\n2. Voir les appels\n3. Accepter ou rejeter', resultat: 'Appel traité, utilisateur notifié' },
  { mod: 'ADMIN', code: 'ADM', feat: 'MessageGuard', cas: 'Dashboard MessageGuard', prereq: 'Être admin', etapes: '1. Admin > MessageGuard', resultat: 'Dashboard stats et logs MessageGuard affichés' },
  { mod: 'ADMIN', code: 'ADM', feat: 'MessageGuard', cas: 'Modifier config MessageGuard', prereq: 'Être SUPER_ADMIN', etapes: '1. Admin > MessageGuard > Config\n2. Modifier les seuils\n3. Sauvegarder', resultat: 'Configuration MessageGuard mise à jour' },
  { mod: 'ADMIN', code: 'ADM', feat: 'Permissions', cas: 'Vérifier les permissions par niveau admin', prereq: 'Admin LEVEL_1', etapes: '1. Admin LEVEL_1 tente une action réservée SUPER_ADMIN', resultat: 'Action refusée, message "accès non autorisé"' },

  // ── i18n / LANGUES / DEVISES ──
  { mod: 'i18n', code: 'I18N', feat: 'Langues', cas: 'Changer de langue (FR/EN/LN/AR)', prereq: '', etapes: '1. Cliquer sur le sélecteur de langue\n2. Choisir EN (anglais)', resultat: 'Interface intégralement traduite en anglais' },
  { mod: 'i18n', code: 'I18N', feat: 'Devises', cas: 'Changer de devise (CDF/USD/EUR)', prereq: '', etapes: '1. Cliquer sur le sélecteur de devise\n2. Choisir USD', resultat: 'Tous les prix convertis en USD en temps réel' },
  { mod: 'i18n', code: 'I18N', feat: 'RTL', cas: 'Interface RTL en arabe', prereq: '', etapes: '1. Choisir la langue AR (arabe)', resultat: 'Interface affichée en RTL (droite vers gauche), mise en page correcte' },

  // ── PAGES INFORMATIVES ──
  { mod: 'PAGES', code: 'PAGE', feat: 'À propos', cas: 'Page /about', prereq: '', etapes: '1. Aller sur /about', resultat: 'Contenu "À propos" affiché correctement' },
  { mod: 'PAGES', code: 'PAGE', feat: 'Conditions', cas: 'Page /terms', prereq: '', etapes: '1. Aller sur /terms', resultat: 'Conditions d\'utilisation affichées' },
  { mod: 'PAGES', code: 'PAGE', feat: 'FAQ', cas: 'Page /faq', prereq: '', etapes: '1. Aller sur /faq', resultat: 'FAQ interactive fonctionnelle (accordéons, recherche)' },
  { mod: 'PAGES', code: 'PAGE', feat: 'Contact', cas: 'Page /contact', prereq: '', etapes: '1. Aller sur /contact\n2. Remplir le formulaire\n3. Envoyer', resultat: 'Formulaire envoyé avec confirmation' },
  { mod: 'PAGES', code: 'PAGE', feat: 'Guide', cas: 'Page /how-it-works', prereq: '', etapes: '1. Aller sur /how-it-works', resultat: 'Guide pas-à-pas affiché' },
  { mod: 'PAGES', code: 'PAGE', feat: 'Confidentialité', cas: 'Page /privacy', prereq: '', etapes: '1. Aller sur /privacy', resultat: 'Politique de confidentialité affichée' },

  // ── MOBILE & PWA ──
  { mod: 'MOBILE & PWA', code: 'MOB', feat: 'PWA', cas: 'Installation PWA', prereq: 'Navigateur compatible', etapes: '1. Sur mobile, déclencher le prompt d\'installation PWA\n2. Installer', resultat: 'App installée, icône sur l\'écran d\'accueil' },
  { mod: 'MOBILE & PWA', code: 'MOB', feat: 'Onboarding', cas: 'Écran de bienvenue', prereq: 'Premier lancement', etapes: '1. Lancer l\'application pour la 1ère fois', resultat: 'Onboarding affiché (bienvenue, permissions, tutoriel)' },
  { mod: 'MOBILE & PWA', code: 'MOB', feat: 'Offline', cas: 'Mode hors ligne', prereq: '', etapes: '1. Couper la connexion internet\n2. Ouvrir l\'app', resultat: 'Page offline affichée avec message approprié' },
  { mod: 'MOBILE & PWA', code: 'MOB', feat: 'Splash', cas: 'Splash screen au démarrage', prereq: '', etapes: '1. Lancer l\'application', resultat: 'Splash screen affiché puis disparaît après chargement' },
  { mod: 'MOBILE & PWA', code: 'MOB', feat: 'Cookies', cas: 'Bandeau cookie consent', prereq: 'Première visite', etapes: '1. Première visite sur le site', resultat: 'Bandeau cookies affiché, choix utilisateur respecté' },

  // ── APP VERSION ──
  { mod: 'APP VERSION', code: 'APPV', feat: 'Force update', cas: 'Mise à jour obligatoire Android', prereq: 'Version app < version minimale requise', etapes: '1. Ouvrir l\'app avec une version obsolète', resultat: 'Popup force update affiché, impossible de continuer sans MAJ' },

  // ── BLOG PUBLIC ──
  { mod: 'BLOG', code: 'BLOG', feat: 'Liste', cas: 'Voir les articles de blog publiés', prereq: '', etapes: '1. Aller sur /blog', resultat: 'Articles publiés listés avec titre, extrait, date' },
  { mod: 'BLOG', code: 'BLOG', feat: 'Réaction', cas: 'Réagir à un article (like/dislike)', prereq: '', etapes: '1. Ouvrir un article\n2. Cliquer like ou dislike', resultat: 'Réaction comptabilisée' },

  // ── SEO ──
  { mod: 'SEO', code: 'SEO', feat: 'Meta tags', cas: 'Meta tags dynamiques par page', prereq: '', etapes: '1. Ouvrir une page\n2. Inspecter le <head>', resultat: 'Title, description, Open Graph tags corrects et dynamiques' },

  // ── PERFORMANCE & TRANSVERSAL ──
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Performance', cas: 'Temps de chargement page d\'accueil', prereq: '', etapes: '1. Mesurer le temps de chargement de la page d\'accueil', resultat: 'Chargement < 3 secondes' },
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Pagination', cas: 'Pagination fonctionnelle partout', prereq: 'Listes avec >20 éléments', etapes: '1. Parcourir les différentes listes (annonces, commandes, messages)\n2. Naviguer entre les pages', resultat: 'Pagination fonctionnelle, données chargées correctement' },
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Responsive', cas: 'Design responsive (mobile/tablette/desktop)', prereq: '', etapes: '1. Tester sur mobile (320px), tablette (768px) et desktop (1920px)', resultat: 'Interface adaptée à chaque taille d\'écran' },
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Thème', cas: 'Basculer Dark/Light mode', prereq: '', etapes: '1. Cliquer sur le switch dark/light mode', resultat: 'Thème appliqué correctement sur toutes les pages' },
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Erreurs', cas: 'Gestion erreurs réseau/serveur', prereq: '', etapes: '1. Simuler une erreur 500 ou coupure réseau', resultat: 'Page d\'erreur ou message clair affiché (ErrorBoundary)' },
  { mod: 'TRANSVERSAL', code: 'TRANS', feat: 'Socket', cas: 'Socket.IO temps réel', prereq: '', etapes: '1. Ouvrir 2 navigateurs\n2. Envoyer un message / passer commande', resultat: 'Événement reçu en temps réel (message, cart:updated, etc.)' },
];

// ─── Generate Excel ────────────────────────────────────────────────────────────
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Kin-Sell QA Team';
workbook.created = new Date();

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 1: TEST
// ══════════════════════════════════════════════════════════════════════════════
const ws = workbook.addWorksheet('TEST', {
  properties: { defaultRowHeight: 20, defaultColWidth: 12 },
  views: [{ state: 'frozen', ySplit: 6 }],
});

// Column widths (matching template)
ws.getColumn(1).width = 4;
ws.getColumn(2).width = 4;
ws.getColumn(3).width = 25;
ws.getColumn(4).width = 12;
ws.getColumn(5).width = 25;
ws.getColumn(6).width = 38;
ws.getColumn(7).width = 35;
ws.getColumn(8).width = 50;
ws.getColumn(9).width = 48;
ws.getColumn(10).width = 12;
ws.getColumn(11).width = 22;

const purple = 'FF7030A0';
const sideGrey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: purple } };
const headerFont = { size: 11, color: { argb: 'FFFFFFFF' }, name: 'Arial', family: 2, bold: true };
const dataFont = { size: 11, color: { argb: 'FF000000' }, name: 'Arial', family: 2 };
const dataAlign = { vertical: 'middle', wrapText: true };
const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
};

// Row 1-2: empty with grey side columns
for (let r = 1; r <= 2; r++) {
  const row = ws.getRow(r);
  row.getCell(1).fill = sideGrey;
  row.getCell(2).fill = sideGrey;
}

// Row 3: Title
const titleRow = ws.getRow(3);
titleRow.height = 50;
titleRow.getCell(1).fill = sideGrey;
titleRow.getCell(2).fill = sideGrey;
ws.mergeCells('C3:K3');
const titleCell = titleRow.getCell(3);
titleCell.value = 'CAHIER DE RECETTE KIN-SELL (MARKETPLACE PREMIUM)';
titleCell.font = { bold: true, size: 28, color: { argb: purple }, name: 'Arial', family: 2 };
titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F0FF' } };

// Row 4: subtitle
const subRow = ws.getRow(4);
subRow.getCell(1).fill = sideGrey;
subRow.getCell(2).fill = sideGrey;
ws.mergeCells('C4:K4');
const subCell = subRow.getCell(3);
subCell.value = `Date: ${new Date().toLocaleDateString('fr-FR')} — Version 2.0 — ${tests.length} cas de test`;
subCell.font = { size: 11, color: { argb: 'FF666666' }, name: 'Arial', family: 2, italic: true };
subCell.alignment = { vertical: 'middle' };

// Row 5: empty separator
ws.getRow(5).getCell(1).fill = sideGrey;
ws.getRow(5).getCell(2).fill = sideGrey;

// Row 6: Headers
const headers = ['', '', 'MODULE', 'N°', 'FONCTIONNALITÉ', 'CAS DE TEST', 'PRÉREQUIS', 'ÉTAPES DU TEST', 'RÉSULTATS ATTENDUS', 'STATUT', 'COMMENTAIRE'];
const headerRow = ws.getRow(6);
headerRow.height = 30;
headers.forEach((h, i) => {
  const cell = headerRow.getCell(i + 1);
  cell.value = h;
  if (i < 2) {
    cell.fill = sideGrey;
  } else {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder;
  }
});

// ─── Module colors (alternating bands) ──────────────────────────────────────
const moduleColors = {
  'AUTHENTIFICATION': 'FFF3E8FF',
  'PROFILS': 'FFE8F4FD',
  'BOUTIQUE': 'FFE8FDF3',
  'ANNONCES': 'FFFFF8E1',
  'PANIER & COMMANDES': 'FFFCE4EC',
  'NÉGOCIATIONS': 'FFE0F2F1',
  'BILLING': 'FFF3E5F5',
  'MOBILE MONEY': 'FFFFF3E0',
  'MESSAGERIE': 'FFE3F2FD',
  'SO-KIN': 'FFEDE7F6',
  'EXPLORER': 'FFE8F5E9',
  'CONNEXIONS': 'FFFCE4EC',
  'PUBLICITÉS & IA': 'FFFFF8E1',
  'ANALYTICS IA': 'FFE0F7FA',
  'INCENTIVES': 'FFF1F8E9',
  'AVIS': 'FFFFF3E0',
  'VÉRIFICATION': 'FFE8EAF6',
  'VITRINES': 'FFFBE9E7',
  'NOTIFICATIONS': 'FFE0F2F1',
  'GÉOLOCALISATION': 'FFE3F2FD',
  'MARKET': 'FFF9FBE7',
  'SÉCURITÉ': 'FFFFEBEE',
  'ADMIN': 'FFE8EAF6',
  'i18n': 'FFF3E5F5',
  'PAGES': 'FFECEFF1',
  'MOBILE & PWA': 'FFE0F2F1',
  'APP VERSION': 'FFFFF8E1',
  'BLOG': 'FFE3F2FD',
  'SEO': 'FFF1F8E9',
  'TRANSVERSAL': 'FFECEFF1',
};

// ─── Data rows ──────────────────────────────────────────────────────────────
let currentRow = 7;
let prevModule = '';
let moduleCounter = {};

// Section header style
const sectionHeaderFont = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Arial', family: 2 };
const sectionHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B2C8C' } };

tests.forEach((t) => {
  // Insert module header row when module changes
  if (t.mod !== prevModule) {
    if (prevModule !== '') {
      // Add empty separator row
      const sepRow = ws.getRow(currentRow);
      sepRow.height = 8;
      sepRow.getCell(1).fill = sideGrey;
      sepRow.getCell(2).fill = sideGrey;
      currentRow++;
    }
    // Module header row
    const modRow = ws.getRow(currentRow);
    modRow.height = 28;
    modRow.getCell(1).fill = sideGrey;
    modRow.getCell(2).fill = sideGrey;
    ws.mergeCells(`C${currentRow}:K${currentRow}`);
    const modCell = modRow.getCell(3);
    modCell.value = `📋 ${t.mod}`;
    modCell.font = sectionHeaderFont;
    modCell.fill = sectionHeaderFill;
    modCell.alignment = { vertical: 'middle' };
    modCell.border = thinBorder;
    currentRow++;
    prevModule = t.mod;
    moduleCounter[t.code] = 0;
  }

  moduleCounter[t.code] = (moduleCounter[t.code] || 0) + 1;
  const testNum = `${t.code}-${String(moduleCounter[t.code]).padStart(2, '0')}`;

  const bgColor = moduleColors[t.mod] || 'FFFFFFFF';
  const rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

  const row = ws.getRow(currentRow);
  row.height = 60;

  const vals = ['', '', t.mod, testNum, t.feat, t.cas, t.prereq, t.etapes, t.resultat, 'PENDING', ''];
  vals.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    if (i < 2) {
      cell.fill = sideGrey;
    } else {
      cell.fill = rowFill;
      cell.font = dataFont;
      cell.alignment = dataAlign;
      cell.border = thinBorder;
    }
  });

  currentRow++;
});

// ─── Conditional formatting for STATUT column (J) ──────────────────────────
// We add data validation dropdown for status
for (let r = 7; r < currentRow; r++) {
  const cell = ws.getRow(r).getCell(10);
  if (cell.value === 'PENDING' || cell.value === 'OK' || cell.value === 'KO') {
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"PENDING,OK,KO"'],
    };
    // Color for PENDING
    if (cell.value === 'PENDING') {
      cell.font = { ...dataFont, bold: true, color: { argb: 'FFFF8C00' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET 2: LIB (Légende)
// ══════════════════════════════════════════════════════════════════════════════
const libSheet = workbook.addWorksheet('LIB');
libSheet.getColumn(1).width = 16;
libSheet.getColumn(2).width = 50;
libSheet.getColumn(3).width = 5;
libSheet.getColumn(4).width = 5;
libSheet.getColumn(5).width = 12;
libSheet.getColumn(6).width = 25;

// Header
const libHeader = libSheet.getRow(2);
['NUMÉRO DE TEST', 'DESCRIPTION', '', '', 'STATUT', 'DESCRIPTION'].forEach((v, i) => {
  const cell = libHeader.getCell(i + 1);
  cell.value = v;
  cell.font = { bold: true, size: 11, name: 'Arial', family: 2 };
  cell.fill = headerFill;
  cell.font = headerFont;
});

// Legend entries
const legend = [
  { statut: 'PENDING', desc: 'Non testé', color: 'FFFFCC00' },
  { statut: 'OK', desc: 'Testé et OK', color: 'FF00B050' },
  { statut: 'KO', desc: 'Testé et KO', color: 'FFFF0000' },
];

// List all tests in LIB
let libRow = 3;
tests.forEach((t, idx) => {
  const code = t.code;
  if (!moduleCounter[`_lib_${code}`]) moduleCounter[`_lib_${code}`] = 0;
  moduleCounter[`_lib_${code}`]++;
  const testNum = `${code}-${String(moduleCounter[`_lib_${code}`]).padStart(2, '0')}`;

  const row = libSheet.getRow(libRow);
  row.getCell(1).value = testNum;
  row.getCell(1).font = dataFont;
  row.getCell(2).value = `${t.feat} — ${t.cas}`;
  row.getCell(2).font = dataFont;

  // Add legend only on first 3 rows
  if (idx < 3) {
    row.getCell(5).value = legend[idx].statut;
    row.getCell(5).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Arial', family: 2 };
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: legend[idx].color } };
    row.getCell(6).value = legend[idx].desc;
    row.getCell(6).font = dataFont;
  }

  libRow++;
});

// ─── Save ───────────────────────────────────────────────────────────────────
const outputPath = String.raw`d:\Kin-Sell\docs\Cahier-de-recette-KIN-SELL.xlsx`;
await workbook.xlsx.writeFile(outputPath);
console.log(`✅ Fichier généré : ${outputPath}`);
console.log(`📊 ${tests.length} cas de test dans ${Object.keys(moduleColors).length} modules`);
