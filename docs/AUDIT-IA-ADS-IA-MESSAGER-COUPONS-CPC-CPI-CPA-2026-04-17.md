# Audit IA Ads + IA Messager
Date: 2026-04-17
Scope: coupons uniques, reductions intelligentes, CPC/CPI/CPA, gouvernance super-admin.

## 1) Objectif
Preparer une implementation solide pour:
- generer des codes promo uniques
- appliquer des reductions sur forfaits et add-ons
- gerer des avantages CPC/CPI/CPA
- administrer tout cela depuis l'onglet IA Messager
- respecter des quotas, probabilites et limites mensuelles

## 2) Demande metier normalisee
Regles exprimees par le demandeur:
- IA Kin-Sell peut appliquer des reductions dans la plage 10/30/50/70/100%.
- Le 100% est limite a 1 ou 2 semaines.
- Des testeurs peuvent recevoir 20/50/80% et gain add-on gratuit.
- 1 personne sur 10 peut beneficier d'un avantage CPC/CPI/CPA.
- 1 personne sur 10 peut recevoir un coupon via IA Messager.
- 1 personne ne peut pas recevoir plus de 7 coupons/mois.
- Au moins 15% de chance qu'un coupon 100% soit distribue pendant le mois.
- Une personne peut avoir max 15 CPC/CPI/CPA par mois.
- Dans ces 15, max 3 a 80% et 1 gain add-on, le reste aleatoire.
- Le super-admin doit pouvoir creer/envoyer/supprimer/limiter/prolonger manuellement.

## 3) Audit de l'existant (codebase)

### 3.1 Paiement forfaits/add-ons
Constat:
- Le checkout prend uniquement `planCode` + `billingCycle`, pas de `promoCode`.
- Aucun endpoint de validation de coupon.
- Aucun modele persistant de coupon dans Prisma.

Preuves:
- `apps/api/src/modules/billing/billing.routes.ts:113` (`/checkout/paypal`)
- `apps/api/src/modules/billing/billing.routes.ts:108` (schema sans promo)
- `apps/web/src/features/pricing/PricingPage.tsx:390` (appel checkout sans coupon)
- `apps/web/src/lib/services/billing.service.ts:53` (payload sans coupon)
- `packages/db/prisma/schema.prisma:401` (`Subscription`)
- `packages/db/prisma/schema.prisma:447` (`PaymentOrder`)

### 3.2 IA Messager
Constat:
- IA Messager envoie deja des emails/push promo.
- Les stats se basent sur `AiAutonomyLog`, pas sur une entite "coupon".
- Admin peut envoyer des messages promo, mais pas gerer un cycle de vie coupon.

Preuves:
- `apps/api/src/modules/ads/ia-messenger-promo.service.ts:69` (`sendPromoEmail`)
- `apps/api/src/modules/ads/ia-messenger-promo.service.ts:107` (`sendPromoPush`)
- `apps/api/src/modules/ads/ia-messenger-promo.service.ts:259` (`getPromoCampaignStats`)
- `apps/api/src/modules/admin/admin.routes.ts:1723` (`/ia/messages/send`)
- `apps/api/src/modules/admin/admin.routes.ts:1748` (`/ia/messages/target-users`)
- `packages/db/prisma/schema.prisma:1680` (`AiAutonomyLog`)

### 3.3 IA Ads
Constat:
- IA Ads recommande des offres (plan/add-on/boost/trial), mais ne genere pas de coupon unique.
- IA Ads possede des campagnes/perf, mais pas de modele CPC/CPI/CPA user-level.

Preuves:
- `apps/api/src/modules/ads/ai-ads-engine.service.ts` (recommendations smart offers)
- `packages/db/prisma/schema.prisma:2256` (`AiAdCampaign`)
- `packages/db/prisma/schema.prisma:2182` (`AiTrial`)

### 3.4 Admin dashboard
Constat:
- Onglet IA Message affiche stats et formulaire d'envoi promo.
- Il manque: CRUD coupons, quotas, duree, prolongation, suppression, distribution rules.

Preuves:
- `apps/web/src/features/dashboards/AdminDashboard.tsx:3673` (state form IA Message)
- `apps/web/src/features/dashboards/AdminDashboard.tsx:4134` (reasons manuelles)
- `apps/web/src/lib/services/admin.service.ts:739` (API send)

## 4) Gaps critiques a combler
1. Pas de "source of truth" coupon (code unique, statut, expiration, usage).
2. Pas de regles probabilistes et quotas centralises (1/10, max/mois, 15% 100%).
3. Pas de mecanisme CPC/CPI/CPA per-user avec limites mensuelles.
4. Pas de liaison coupon <-> paiement order <-> activation abonnement.
5. Pas d'outils super-admin de pilotage fin (manual override, extension, revoke).

## 5) Architecture cible (V1)

### 5.1 Nouveaux concepts
- `IncentiveCoupon`: coupon unique distribue a un user.
- `IncentiveCouponRedemption`: tentative/application de coupon.
- `IncentivePolicy`: regles globales (probas, plafonds, reductions autorisees).
- `IncentiveQuotaCounter`: compteurs mensuels par user.
- `GrowthIncentiveGrant`: avantages CPC/CPI/CPA attribues.
- `GrowthIncentiveEvent`: event de conversion (click/install/action) qui consomme un grant.

### 5.2 Propositions Prisma (high-level)
- Table coupon:
  - `code` unique
  - `kind` (`PLAN_DISCOUNT`, `ADDON_DISCOUNT`, `ADDON_FREE_GAIN`, `CPC`, `CPI`, `CPA`)
  - `discountPercent` nullable
  - `targetScope` (`ALL_PLANS`, `USER_PLANS`, `BUSINESS_PLANS`, `ALL_ADDONS`, `SPECIFIC`)
  - `targetPlanCodes[]`, `targetAddonCodes[]`
  - `maxUses`, `usedCount`, `maxUsesPerUser`
  - `startsAt`, `expiresAt`
  - `status` (`DRAFT`, `ACTIVE`, `PAUSED`, `EXPIRED`, `REVOKED`)
  - `issuedBy`, `issuedByEngine`, `recipientUserId` nullable
  - `metadata` JSON
- Table redemption:
  - `couponId`, `userId`, `paymentOrderId` nullable, `subscriptionId` nullable
  - `originalAmountUsdCents`, `discountAmountUsdCents`, `finalAmountUsdCents`
  - `status` (`APPLIED`, `REJECTED`, `ROLLED_BACK`)
  - `reason`, `createdAt`
- Table monthly counters:
  - `userId`, `monthKey` (YYYY-MM), `couponCount`, `coupon100Count`, `cpcCount`, `cpiCount`, `cpaCount`, `discount80Count`, `addonGainCount`
  - unique `(userId, monthKey)`

### 5.3 Moteur de decision (policy engine)
Un service central:
- `selectIncentiveForUser(userId, context)`
- applique les regles globales + quotas user + random + fairness
- renvoie:
  - type d'avantage
  - pourcentage
  - duree
  - cible (plan/add-on)

Points obligatoires:
- 100% seulement avec TTL 1 ou 2 semaines
- max 7 coupons/mois/user
- max 15 CPC/CPI/CPA/mois/user
- max 3 reductions 80% sur CPC/CPI/CPA/mois/user
- max 1 gain add-on/mois/user
- gate probabiliste 1/10 (coupon IA Messager) et 1/10 (CPC/CPI/CPA)

## 6) Regles V1 proposees (operationalisables)

### 6.1 Harmonisation des pourcentages
Pour eviter les contradictions:
- Mode standard plan: `[10, 30, 50, 70, 100]`
- Mode testeur: `[20, 50, 80]` + `ADDON_FREE_GAIN`
- Le moteur choisit le mode selon `policy.segment` (`STANDARD` ou `TESTER`)

### 6.2 Distribution 100%
Proposition robuste:
- contrainte dure: `expiresAt - startsAt <= 14 jours` pour coupon 100%
- contrainte mensuelle plateforme:
  - `coupon100_distributions / total_coupon_distributions >= 0.15`
  - enforcee par un "rebalancing job" journalier

### 6.3 Eligibilite CPC/CPI/CPA
- Tirage Bernoulli 10% (configurable `0.10`)
- Si eligibilite true:
  - attribution d'un grant `CPC` ou `CPI` ou `CPA`
  - bornes mensuelles user appliquees avant attribution

### 6.4 Manual override super-admin
Le super-admin peut:
- creer coupon/grant
- envoyer a un user/groupe
- activer/pause/revoquer
- modifier expiration (shorten/extend)
- supprimer logique (soft delete recommande)
- ignorer temporairement des quotas (audit obligatoire)

## 7) Impacts techniques par couche

### 7.1 DB
- Ajouter nouvelles tables + indexes:
  - code unique
  - indexes `(recipientUserId, status, expiresAt)`
  - indexes `(userId, monthKey)` counters
  - indexes `(kind, status, createdAt)`

### 7.2 API Billing
- Ajouter endpoints:
  - `POST /billing/coupons/preview`
  - `POST /billing/checkout/paypal` avec `promoCode?`
  - `POST /billing/coupons/validate`
- Garantir:
  - recalcul serveur (jamais confiance front)
  - lock transactionnel au moment de la creation `PaymentOrder`

### 7.3 IA Ads + IA Messager
- IA Ads:
  - brancher `policy engine` pour choisir offre incentive
  - produire event de distribution
- IA Messager:
  - message personalise contenant coupon code
  - logs structures (plus que simple `AiAutonomyLog.reasoning`)

### 7.4 Admin (IA Message tab)
- Nouveau sous-module "Coupons & Incentives":
  - liste + filtres + recherche + statut
  - create/edit/delete/pause/extend
  - assignation manuelle user(s)
  - dashboard quotas mensuels
  - historique redemptions

### 7.5 Front `/forfaits`
- Champ "Code promo"
- bouton "Verifier"
- affichage:
  - prix original
  - reduction
  - prix final
  - message de validite/expiration

## 8) Plan d'implementation recommande

### Phase 1 - Data model + migration
- Prisma schema + migration SQL
- seed policy par defaut
- indexes et contraintes

### Phase 2 - Coupon engine backend
- validation
- selection intelligente
- quotas mensuels
- redemptions transactionnelles

### Phase 3 - Checkout integration
- preview coupon
- appliquer coupon au checkout PayPal
- persister discount dans order metadata

### Phase 4 - IA Messager + IA Ads integration
- distribution auto coupon
- distribution auto CPC/CPI/CPA
- jobs de rebalancing (objectif 15% coupons 100%)

### Phase 5 - Admin panel IA Messager
- CRUD complet coupons/incentives
- actions manuelles
- dashboards quotas + redemptions

### Phase 6 - QA & tests
- unit tests engine
- integration tests billing + coupon
- tests admin permissions
- tests anti-abuse/race conditions

## 9) Risques et mitigation
- Double redemption en concurrence:
  - mitigation: transaction + `SELECT ... FOR UPDATE`/optimistic lock.
- Sur-distribution 100%:
  - mitigation: guard policy + job reequilibrage.
- Fraude coupon sharing:
  - mitigation: coupons single-user + maxUsesPerUser=1 + expiration courte.
- Dette metier due aux regles contradictoires:
  - mitigation: policy versionnee + flags segment.

## 10) Acceptance criteria V1
- Un coupon unique peut etre cree et applique sur un forfait.
- Un coupon peut cibler tous les add-ons.
- 100% respecte TTL <= 14 jours.
- Les limites mensuelles sont enforcees serveur.
- Super-admin peut manuellement creer/envoyer/supprimer/prolonger/revoquer.
- Les logs permettent audit complet de chaque attribution et redemption.

## 11) Questions metier a valider avant dev complet
1. Le "15% de chance 100%" est-il global plateforme ou par utilisateur?
2. Les reductions 20/50/80 sont-elles reservees testeurs uniquement?
3. Un coupon peut-il s'appliquer sur Apple IAP, ou PayPal web seulement?
4. Le "gain add-on gratuit" concerne quels add-ons exacts et quelle duree?
5. Les 15 grants CPC/CPI/CPA/mois sont-ils cumules (tous types) ou par type?

## 12) Conclusion audit
Le socle actuel IA Ads / IA Messager est solide pour la diffusion de messages et recommendations.
Le manque principal est un moteur incentive unifie avec persistance coupon + quotas + administration.
La meilleure strategie est de construire un module unique "Incentive Engine" branche a Billing, IA Ads et IA Messager.
