# Audit IA ADS - Combinaisons Forfaits/Add-ons et Couplage Incentives
Date: 2026-04-17
Scope: comportement IA ADS selon forfait actif/inactif + couplage coupons CPC/CPI/CPA avec IA Messager.

## 1) Etat reel du code aujourd'hui
- IA ADS recommandations: present (`computeSellerProfile`, `generateSmartOffers`).
- IA Trigger (autonome): present (publication, vente, stagnation, check periodique) avec anti-spam.
- IA Messager promo: present (push/email promo), mais sans insertion native de coupon code.
- Incentive Engine: present (coupons, quotas, policies, CPC/CPI/CPA grants, admin CRUD, preview/validate/redeem).
- Billing PayPal + promoCode: present (preview et application coupon au checkout).

Conclusion: la base coupons/CPC/CPI/CPA existe deja, mais IA ADS <-> Incentive Engine <-> IA Messager ne sont pas encore branches de bout en bout.

## 2) Quand IA ADS reagit vraiment
Points d'entree observes:
- `onListingPublished` (anti-spam 24h).
- `onSaleCompleted` (anti-spam 7 jours selon triggerType).
- `checkStagnation` (anti-spam 7 jours).
- `runPeriodicSmartCheck` (anti-spam 7 jours).

Important:
- IA ADS retourne max 3 offres par cycle (tri par priorite).
- Les recommandations deviennent des `aiRecommendation`.

## 3) Arbre de decision IA ADS (simplifie)
Ordre de decision dans `generateSmartOffers`:
1. `TRIAL` ou `SUBSCRIPTION` si pas de plan, ou plan `FREE`/`STARTER`.
2. `UPGRADE` si plan actif et lifecycle != NEW et conditions de croissance.
3. `ADDON` selon seuils (nego, ventes, stagnation, budget).
4. `BOOST` seulement si add-on `BOOST_VISIBILITY` actif (sinon seulement proposition d'add-on).
5. `AD_CAMPAIGN` si lifecycle != NEW et budget != ZERO.
6. Tri priorite desc puis limite a 3 offres.

## 4) Matrice des combinaisons (cas X/Y/Z + variantes)
Hypothese: "reaction" = recommandations creees par IA ADS sur triggers standards.

### Cas X - Free, aucun forfait actif, aucun add-on, peu d'activite
- Etat:
  - `currentPlan = null` ou `FREE`
  - `activeAddons = []`
  - `budgetTier = ZERO`, `completedSales < 3`
- Reaction attendue:
  - Offre principale: `TRIAL` 15 jours (priorite haute).
  - Pas de `AD_CAMPAIGN`.
  - Pas de `BOOST` direct (pas d'add-on boost).
- Commentaire:
  - IA ADS pousse d'abord l'essai, pas le coupon.

### Cas X2 - Free, aucun add-on, plusieurs annonces stagnantes
- Etat:
  - `currentPlan = FREE`
  - `totalListings >= 3`, `hasStagnantListings = true`
- Reaction attendue:
  - `SUBSCRIPTION` ou `TRIAL` selon budget/lifecycle.
  - `ADDON` `BOOST_VISIBILITY`.
  - Event stagnation: pas de boost direct tant que l'add-on boost n'est pas actif.

### Cas Y - Forfait user 2eme palier (BOOST), sans add-ons, faible traction
- Etat:
  - `currentPlan = BOOST`
  - pas d'add-ons
  - lifecycle NEW ou GROWING faible
- Reaction attendue:
  - Souvent pas d'`UPGRADE` (si conditions non atteintes).
  - Peut proposer `IA_MERCHANT` (si nego >= 3 et conversion < 40%).
  - Peut proposer `BOOST_VISIBILITY` (si stagnation + >=3 listings).
  - En publication sans offre pertinente: fallback "Booster votre article ?".

### Cas Y2 - BOOST sans add-ons, bonne traction commerciale
- Etat:
  - `currentPlan = BOOST`
  - `completedSales >= 10` ou revenue fort
- Reaction attendue:
  - `UPGRADE` vers `AUTO`.
  - `ADDON` `IA_ORDER` (si ventes >= 5) et potentiellement `ADS_PACK`.
  - `AD_CAMPAIGN` possible si lifecycle != NEW et budget > ZERO.

### Cas Z - AUTO, sans add-ons
- Etat:
  - `currentPlan = AUTO`
  - `activeAddons = []`
- Reaction attendue:
  - `UPGRADE` vers `PRO_VENDOR` si criteria de croissance atteints.
  - `ADDON` selon signaux (merchant/order/boost visibility/ads pack).
  - `AD_CAMPAIGN` quasi systematique si lifecycle >= GROWING et budget non nul.

### Cas Z2 - PRO_VENDOR, sans BOOST_VISIBILITY
- Etat:
  - `currentPlan = PRO_VENDOR`
  - pas d'upgrade possible (max user)
- Reaction attendue:
  - Pas d'`UPGRADE`.
  - `ADDON` `BOOST_VISIBILITY` si stagnation.
  - `AD_CAMPAIGN` proposee selon budget/lifecycle.

### Cas Z3 - PRO_VENDOR + BOOST_VISIBILITY actif
- Etat:
  - `hasBoostAddon = true`
- Reaction attendue:
  - Event publication: `BOOST` direct de l'annonce.
  - Event stagnation: `BOOST` direct du lot d'annonces stagnantes.
  - Plus eventuellement `AD_CAMPAIGN`/`ADS_PACK` selon contexte.

### Cas B1 - Business sans forfait actif (ou forfait expire)
- Etat:
  - role BUSINESS
  - `currentPlan = null` (forfait inactif/expire)
- Reaction attendue:
  - `SUBSCRIPTION` vers `STARTER` (ou `BUSINESS` si lifecycle fort).
  - Add-ons selon signaux (pas en NEW+ZERO).

### Cas B2 - Business STARTER, croissance faible
- Etat:
  - `currentPlan = STARTER`
  - lifecycle NEW/GROWING
- Reaction actuelle observee:
  - peut reproposer `STARTER` (anomalie logique).
  - upgrade parfois absent si conditions non remplies.

### Cas B3 - Business STARTER, croissance forte
- Etat:
  - `currentPlan = STARTER`
  - lifecycle ESTABLISHED/POWER ou ventes/revenus forts
- Reaction attendue:
  - `UPGRADE` vers `BUSINESS`.
  - `AD_CAMPAIGN` et `ADS_PACK` possibles.

### Cas B4 - Business BUSINESS
- Etat:
  - `currentPlan = BUSINESS`
- Reaction attendue:
  - `UPGRADE` vers `SCALE` si conditions remplies.
  - Add-ons manquants selon seuils.
  - campagne pub proposee frequemment (budget plus eleve).

### Cas B5 - Business SCALE (palier max)
- Etat:
  - `currentPlan = SCALE`
- Reaction attendue:
  - pas d'upgrade.
  - seulement add-ons manquants + boost/ad campaign selon contexte.

### Cas "forfait non active" (global)
- Regle technique:
  - IA ADS ne lit que les subscriptions `ACTIVE` non expirees.
  - un forfait expire est traite comme "pas de forfait".
- Reaction:
  - repart dans la logique acquisition (`TRIAL`/`SUBSCRIPTION`).

## 5) Ce que IA ADS propose "en fonction des forfaits non actives"
Resume direct:
- Forfait inactif/expire -> IA ADS redevient acquisition (trial/subscription), pas upgrade.
- Forfait actif bas niveau -> IA ADS pousse upgrade + add-ons conditionnels.
- Forfait actif haut niveau -> IA ADS pousse surtout boost/campagnes/add-ons manquants.
- Sans `BOOST_VISIBILITY`, jamais de boost direct.

## 6) Ecarts et risques detectes (bêtises possibles)
1. STARTER repropose STARTER:
   - pour business NEW/GROWING, `buildSubscriptionOffer` peut suggérer le meme plan.
2. Duplicats d'offres possibles:
   - FREE/STARTER peut recevoir `SUBSCRIPTION` + `UPGRADE` proches selon contexte.
3. Couplage incentives absent dans IA ADS:
   - `selectIncentiveForUser` et `emitGrowthGrant` existent mais ne sont pas appeles par IA ADS triggers.
4. IA Messager envoie promos sans coupon natif:
   - messaging promo n'injecte pas automatiquement un coupon du moteur incentive.
5. CPC/CPI/CPA grants pas fully operes par IA ADS:
   - grant engine existe, mais pas pipeline complet branché sur events ads.

## 7) Couplage cible IA ADS <-> IA Messager <-> Incentives
Principe clair:
- IA ADS decide "quand proposer/declencher".
- Incentive Engine decide "quoi donner" (coupon/grant) selon policies/quotas/proba.
- IA Messager envoie le message (email/push/interne).
- Billing applique effectivement la reduction (source of truth serveur).

### Flow A - Coupon auto depuis IA ADS
1. Trigger ADS (publication/vente/stagnation/periodic).
2. IA ADS appelle `selectIncentiveForUser(userId, { segment })`.
3. Si coupon genere:
   - inclure `couponCode`, `discountPercent`, `expiresAt` dans recommendation.
   - IA Messager envoie un template coupon.
4. User applique code sur `/forfaits` -> preview -> checkout PayPal.

### Flow B - CPC/CPI/CPA depuis IA ADS
1. IA ADS detecte evenement eligible (click/install/action).
2. Appel `emitGrowthGrant(userId, "CPC"|"CPI"|"CPA", { segment, metadata })`.
3. IA Messager notifie le grant (etapes pour conversion).
4. A conversion, `recordGrowthEvent(grantId, userId, "conversion")`:
   - grant consomme.
   - coupon de recompense cree automatiquement.

### Super-admin (main mise)
Deja present:
- CRUD coupons, revoke, extend, assign, list redemptions, quotas, list/revoke grants, jobs expire/rebalance.
A renforcer:
- actions manuelles sur grants (create/force-consume/force-expire) dans UI admin.
- piste audit explicite "overrideBy".

## 8) Promptes precis pour Claude (resume)
Voir aussi le fichier:
- `docs/PROMPTS-CLAUDE-IA-ADS-IA-MESSAGER-COUPONS-CPC-CPI-CPA.md` (prompts 9 a 13 ajoutes).

