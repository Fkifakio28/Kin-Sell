# 🔒 AUDIT COMPLET — Gating Abonnement & IA

> Date : Audit exhaustif code-par-code, 9 couches vérifiées  
> Résultat global : **⛔ 6 FAILLES CRITIQUES + 4 FAILLES MOYENNES**

---

## 📊 MATRICE DE SÉCURITÉ — Vue d'ensemble

### ✅ ÉLÉMENTS CORRECTEMENT PROTÉGÉS

| Élément | Couche | Source de vérité | Arrêt auto | Détails |
|---------|--------|------------------|------------|---------|
| `subscription-guard.ts` `_resolveAccess()` | 2 — Helpers | Subscription (userId OU businessId) + endsAt + addons endsAt | ✅ OUI | Vérifie ACTIVE + endsAt non dépassé + scope user/business |
| `runBatchAutoNegotiation()` | 5 — Batch | clearSubscriptionCache + userHasIaAccess(IA_MERCHANT) | ✅ OUI | Filtre chaque user avant exécution |
| `runBatchCartRecovery()` | 5 — Batch | clearSubscriptionCache + userHasIaAccess(IA_ORDER) | ✅ OUI | Filtre chaque user avant exécution |
| `runBatchOrderAutoValidation()` | 5 — Batch | clearSubscriptionCache + userHasIaAccess(IA_ORDER) | ✅ OUI | Filtre chaque user avant exécution |
| `runBatchPostOrderTracking()` | 5 — Batch | clearSubscriptionCache + userHasIaAccess(IA_ORDER) | ✅ OUI | Filtre chaque user avant exécution |
| `POST /ads/boost` | 3 — Routes | BOOST_VISIBILITY addon + subscription ACTIVE + endsAt | ✅ OUI | Vérifie addon + abonnement |
| `POST /ads/highlight` | 3 — Routes | BOOST_VISIBILITY addon + subscription ACTIVE + endsAt | ✅ OUI | Vérifie addon + abonnement |
| `GET /analytics/ai/diagnostic` | 3 — Routes | requirePremium() middleware | ✅ OUI* | *Bug scope BUSINESS — voir faille #2 |
| `GET /analytics/ai/memory` | 3 — Routes | requirePremium() middleware | ✅ OUI* | *Bug scope BUSINESS |
| `GET /analytics/ai/anomalies` | 3 — Routes | requirePremium() middleware | ✅ OUI* | *Bug scope BUSINESS |
| `GET /analytics/ai/trends` | 3 — Routes | requirePremium() middleware | ✅ OUI* | *Bug scope BUSINESS |
| `GET /analytics/ai/enriched` | 3 — Routes | requirePremium() middleware | ✅ OUI* | *Bug scope BUSINESS |
| `runSubscriptionExpiryCheck()` | 5 — Batch | Expire Subscription ACTIVE→EXPIRED si endsAt≤now | ✅ PARTIEL | Ne gère pas autoRenew=true (faille #5) |
| AiAgent.enabled global kill switch | 9 — Failsafe | AiAgent model, admin toggle | ✅ OUI | Arrête tout le scheduler si désactivé |

### ⛔ ÉLÉMENTS NON PROTÉGÉS — FAILLES

---

## 🚨 FAILLE #1 — CRITIQUE : `findActiveSubscription()` ne vérifie pas `endsAt`

**Fichier** : `apps/api/src/modules/billing/billing.service.ts` ~ligne 116  
**Couche** : 1 — Source de vérité  
**Impact** : Un abonnement expiré (endsAt dépassé) est retourné comme ACTIF au frontend

```typescript
// ❌ ACTUEL — pas de vérification endsAt
async function findActiveSubscription(userId, scope, businessId) {
  return prisma.subscription.findFirst({
    where: {
      scope, status: SubscriptionStatus.ACTIVE,
      userId: scope === "USER" ? userId : null,
      businessId: scope === "BUSINESS" ? businessId : null
    }, // ← MANQUE: endsAt check!
  });
}
```

**Conséquence** : `getMyPlan()` utilise cette fonction → le frontend voit un plan actif même après expiration → `useFeatureGate` active les features IA → l'utilisateur accède à l'UI des fonctions premium gratuitement.

**Correction** : Ajouter `OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]`

---

## 🚨 FAILLE #2 — CRITIQUE : `requirePremium()` ignore le scope BUSINESS

**Fichier** : `apps/api/src/modules/analytics/analytics.routes.ts` lignes 27-39  
**Couche** : 2 — Helpers de gating  
**Impact** : Les comptes BUSINESS avec forfait BUSINESS/SCALE reçoivent 403

```typescript
// ❌ ACTUEL — recherche uniquement par userId
async function requirePremium(req, _res, next) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", endsAt: { gt: new Date() } },
    // ← MANQUE: recherche par businessId pour les comptes BUSINESS
  });
}
```

**Conséquence** : Un commerçant avec forfait BUSINESS ou SCALE (qui paie pour les analytics premium) ne peut pas y accéder. Faux négatif de sécurité.

**Correction** : Réutiliser la logique de `subscription-guard.ts` (`_resolveAccess`) ou résoudre le scope user/business dans `requirePremium()`.

---

## 🚨 FAILLE #3 — CRITIQUE : 15 routes IA sans aucune vérification d'abonnement

**Couche** : 3 — Routes backend

| Route | Module | Feature IA | Risque |
|-------|--------|-----------|--------|
| `GET /negotiations/ai/hint/:listingId` | Négociations | IA_MERCHANT | Accès gratuit aux hints IA |
| `GET /negotiations/:id/ai-advice/seller` | Négociations | IA_MERCHANT | Conseils vendeur gratuits |
| `POST /negotiations/:id/ai-auto-respond` | Négociations | IA_MERCHANT | Auto-négociation gratuite |
| `GET /orders/ai/checkout-advice/:cartId` | Commandes | IA_ORDER | Conseils checkout gratuits |
| `GET /orders/ai/abandonment-risk` | Commandes | IA_ORDER | Détection abandon gratuite |
| `GET /orders/:id/ai/auto-validation` | Commandes | IA_ORDER | Auto-validation gratuite |
| `GET /orders/:id/ai/anomalies` | Commandes | IA_ORDER | Détection anomalies gratuite |
| `GET /analytics/ai/deep` | Analytics | PREMIUM | Deep insights sans vérifcation Premium |
| `GET /analytics/ai/seller-profile` | Analytics | IA_MERCHANT | Profil vendeur IA gratuit |
| `GET /analytics/ai/recommendations` | Analytics | IA_MERCHANT | Recommandations IA gratuites |
| `GET /analytics/ai/pricing-nudges` | Analytics | COMMERCIAL | Nudges pricing gratuits |
| `GET /analytics/ai/commercial-advice` | Analytics | COMMERCIAL | Conseils commerciaux gratuits |
| `GET /analytics/ai/post-publish-advice` | Analytics | IA_MERCHANT | Conseils post-publication gratuits |
| `GET /analytics/ai/post-sale-advice` | Analytics | IA_ORDER | Conseils post-vente gratuits |
| `GET /analytics/ai/analytics-cta` | Analytics | COMMERCIAL | CTAs analytics gratuits |

**Correction** : Ajouter un middleware `checkIaAccess()` avec le feature approprié sur chaque route.

---

## 🚨 FAILLE #4 — CRITIQUE : 3 batch jobs sans vérification d'abonnement

**Couche** : 5 — Schedulers/batch

| Batch Job | Fichier | Problème |
|-----------|---------|----------|
| `runBatchPricingNudges()` | pricing-nudge.service.ts:525 | Traite TOUS les vendeurs récents (top 100) sans vérifier l'abonnement |
| `runBatchCommercialAdvice()` | commercial-advisor.service.ts:822 | Idem — crée des recommandations pour tous |
| `runBatchSmartRecommendations()` | ai-autonomy.service.ts:103 | Idem — exécute `runPeriodicSmartCheck` pour tous |

**Correction** : Ajouter `clearSubscriptionCache()` + `filterUsersWithIaAccess()` comme les 4 batch jobs déjà protégés.

---

## 🚨 FAILLE #5 — MOYENNE : `runSubscriptionExpiryCheck()` ne gère pas `autoRenew=true`

**Fichier** : `apps/api/src/shared/billing/subscription-guard.ts` ~ligne 190  
**Couche** : 5 — Batch  
**Impact** : Les abonnements mensuels (`autoRenew: true`) restent ACTIVE indéfiniment après `endsAt`

```typescript
// ❌ ACTUEL — skip les autoRenew=true
where: {
  status: SubscriptionStatus.ACTIVE,
  endsAt: { lte: now },
  autoRenew: false, // ← Les mensuels passent entre les mailles!
}
```

**Conséquence** : Pas de mécanisme de renouvellement — l'abonnement reste actif pour toujours.

**Correction** : Aussi expirer `autoRenew: true` quand `endsAt` est dépassé (pas de système de paiement récurrent implémenté).

---

## 🚨 FAILLE #6 — MOYENNE : `BusinessAccount.subscriptionStatus` pas mis à jour à l'expiration

**Fichier** : `apps/api/src/shared/billing/subscription-guard.ts`  
**Couche** : 7 — DB états persistés  
**Impact** : Le champ dénormalisé reste sur l'ancien plan après expiration

`runSubscriptionExpiryCheck()` expire `Subscription.status` → EXPIRED mais ne met PAS à jour `BusinessAccount.subscriptionStatus` → le frontend peut afficher le mauvais statut.

**Correction** : Après expiration, mettre à jour `BusinessAccount.subscriptionStatus = "FREE"`.

---

## 🚨 FAILLE #7 — MOYENNE : `runAutoAdOptimization()` optimise les pubs sans vérifier l'abonnement

**Fichier** : `apps/api/src/modules/ads/ad-advisor.service.ts:358`  
**Couche** : 5 — Batch  
**Impact** : Optimise/pause/boost les pubs de TOUS les annonceurs, y compris ceux sans abonnement IA ads

**Correction** : Vérifier que le propriétaire de la pub a un addon ADS_PACK ou ADS_PREMIUM actif.

---

## 🚨 FAILLE #8 — MOYENNE : `hasPremiumAccess()` dans analytics-ai.service.ts ignore le scope BUSINESS

**Fichier** : `apps/api/src/modules/analytics/analytics-ai.service.ts:28-38`  
**Couche** : 4 — Services  
**Impact** : Même bug que `requirePremium()` — `getDeepInsights()` rejette les comptes BUSINESS même avec forfait BUSINESS/SCALE

---

## RÉSUMÉ DES CORRECTIONS APPLIQUÉES

| # | Faille | Fichier | Correction | Priorité |
|---|--------|---------|------------|----------|
| 1 | findActiveSubscription sans endsAt | billing.service.ts | Ajout `OR: [endsAt null, endsAt > now]` | P0 |
| 2 | requirePremium userId-only | analytics.routes.ts | Résolution scope user/business | P0 |
| 3 | 15 routes IA exposées | negotiations/orders/analytics routes | Ajout middleware `checkIaAccess()` | P0 |
| 4 | 3 batch jobs sans sub check | pricing-nudge/commercial-advisor/ai-autonomy | Ajout filterUsersWithIaAccess | P0 |
| 5 | autoRenew=true jamais expiré | subscription-guard.ts | Retirer condition `autoRenew: false` | P1 |
| 6 | BusinessAccount.subscriptionStatus stale | subscription-guard.ts | Update à "FREE" après expiration | P1 |
| 7 | Ad optimization sans sub check | ad-advisor.service.ts | Filtrer users avec addon ADS actif | P1 |
| 8 | hasPremiumAccess userId-only | analytics-ai.service.ts | Résolution scope comme subscription-guard | P1 |
