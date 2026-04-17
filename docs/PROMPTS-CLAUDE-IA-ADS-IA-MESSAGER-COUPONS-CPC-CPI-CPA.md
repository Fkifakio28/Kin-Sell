# Prompt Pack pour Claude
Date: 2026-04-17
Usage: copier un prompt a la fois dans Claude et executer par phase.

## Prompt 0 - Orchestration complete (master)
```text
Tu travailles sur un monorepo TypeScript/Prisma Kin-Sell.
Objectif: implementer un systeme complet de coupons uniques + incentives CPC/CPI/CPA relies a IA Ads, IA Messager, Billing et Admin.

Contexte actuel a respecter:
- Billing checkout PayPal existe deja.
- IA Messager envoie des promos (email/push) mais sans coupons persistants.
- IA Ads fait des recommandations mais sans coupon unique.
- Admin a un onglet IA Message avec envoi manuel.

Regles metier obligatoires:
1) Reductions standard possibles: 10, 30, 50, 70, 100%.
2) 100% valide max 1 a 2 semaines.
3) Segment testeur: reductions 20, 50, 80 et gain add-on gratuit.
4) 1 utilisateur sur 10 eligibles CPC/CPI/CPA.
5) 1 utilisateur sur 10 eligibles coupon IA Messager.
6) Max 7 coupons/mois/utilisateur.
7) Au moins 15% de coupons 100% distribues sur le mois (policy globale configurable).
8) Max 15 grants CPC/CPI/CPA/mois/utilisateur.
9) Dans ces grants: max 3 a 80% et max 1 gain add-on/mois; le reste aleatoire.
10) Super-admin peut creer/envoyer/supprimer/activer/pauser/prolonger/revoquer manuellement.

Instructions d'implementation:
- Creer une migration Prisma pour les nouvelles entites coupons/incentives/counters/redemptions.
- Integrer la validation coupon dans checkout PayPal (serveur source of truth).
- Ajouter API admin complete pour pilotage manuel.
- Etendre IA Messager pour distribution coupon code.
- Ajouter policy engine central avec quotas mensuels et random controlle.
- Ajouter tests unitaires + integration.
- Ne pas casser les endpoints existants.

Definition of done:
- Coupons uniques persistants avec statuts.
- Redemptions transactionnelles et auditables.
- Quotas mensuels enforcees serveur.
- UI admin IA Message etendue pour gestion coupons/incentives.
- Champ code promo dans /forfaits avec preview prix final.
- Tests verts sur modules modifies.

Livre les changements en commits logiques (ou bloc de changements), puis resume:
1) fichiers modifies
2) migration
3) endpoints ajoutes
4) tests ajoutes/executes
5) risques restants.
```

## Prompt 1 - Prisma + migration (phase DB)
```text
Tache: implemente uniquement la couche base de donnees pour coupons/incentives.

A faire:
- Modifier schema Prisma pour ajouter:
  - IncentiveCoupon
  - IncentiveCouponRedemption
  - IncentivePolicy
  - IncentiveQuotaCounter
  - GrowthIncentiveGrant
  - GrowthIncentiveEvent
- Ajouter enums necessaires (coupon kind, status, grant type, redemption status, target scope, segment).
- Ajouter indexes de performance et contraintes d'unicite utiles.
- Generer migration SQL.
- Ajouter seed policy de base.

Contraintes:
- Compatibilite backward.
- Pas de rupture sur tables existantes.
- Nommage coherent avec le style du repo.

Livrables:
- diff schema prisma
- migration SQL
- seed update
- breve justification de chaque index/contrainte.
```

## Prompt 2 - Coupon engine backend (phase domaine)
```text
Tache: construire le service backend central "incentive engine".

A faire:
- Creer service:
  - validateCoupon(code, userId, target)
  - previewCoupon(code, userId, targetAmount)
  - applyCouponToOrderTx(tx, orderDraft, code, userId)
  - selectIncentiveForUser(userId, context)
- Implementer quotas mensuels:
  - max 7 coupons/user/mois
  - max 15 CPC/CPI/CPA/user/mois
  - max 3 reductions 80% sur grants
  - max 1 add-on free gain
- Implementer regles:
  - standard pool [10,30,50,70,100]
  - tester pool [20,50,80] + add-on free gain
  - 100% TTL <= 14 jours
  - gate probabiliste 1/10 pour coupons et 1/10 pour CPC/CPI/CPA
- Ajouter audit/log metadata robustes.

Tests:
- unit tests sur chaque regle
- tests anti-double-redemption (race conditions)
- tests de limites mensuelles.
```

## Prompt 3 - Billing integration (phase checkout)
```text
Tache: brancher les coupons dans Billing sans casser le flux PayPal actuel.

A faire:
- Ajouter endpoint `POST /billing/coupons/preview`.
- Etendre `POST /billing/checkout/paypal` pour accepter `promoCode` optionnel.
- Validation cote serveur uniquement.
- Recalculer `amountUsdCents` final en transaction.
- Persister dans metadata order:
  - couponCode
  - discountPercent
  - discountAmountUsdCents
  - finalAmountUsdCents
- Gerer erreurs metier claires (coupon expire, ineligible, quota, deja utilise).

Tests integration:
- checkout sans coupon (comportement identique actuel)
- checkout coupon valide
- checkout coupon invalide/expire
- checkout coupon 100% (TTL conforme).
```

## Prompt 4 - IA Messager + IA Ads (phase distribution)
```text
Tache: connecter IA Messager et IA Ads au moteur d'incentives.

A faire:
- IA Messager:
  - generation et envoi de coupon unique dans les messages promo.
  - templates message incluant code, expiration, cible.
  - stats enrichies par type de coupon et taux redemption.
- IA Ads:
  - utiliser `selectIncentiveForUser` lors des recommandations/trigger events.
  - emettre grants CPC/CPI/CPA.
- Job mensuel/journalier:
  - reequilibrage pour garantir objectif >= 15% de distributions 100%.

Qualite:
- pas de logique metier dupliquee (tout passe par incentive engine)
- idempotence sur jobs planifies.
```

## Prompt 5 - Admin IA Message (phase pilotage manuel)
```text
Tache: etendre l'onglet admin IA Message pour gerer coupons/incentives.

A faire backend:
- endpoints admin:
  - create coupon
  - update coupon (status, expiration, cible)
  - delete/revoke coupon
  - assign/send coupon a users
  - list coupons + filtres + pagination
  - list redemptions + filtres
  - force-extend / force-revoke

A faire frontend:
- dans AdminDashboard section IA Message:
  - sous-vue "Coupons & Incentives"
  - formulaire creation
  - table coupons (status, usage, expiration, cible, segment)
  - actions rapides pause/activate/revoke/extend/delete
  - table redemptions
  - bloc quotas mensuels par user

Securite:
- super-admin only pour actions destructives/override.
```

## Prompt 6 - Pricing UI (phase front /forfaits)
```text
Tache: ajouter UX code promo sur /forfaits.

A faire:
- input "Code promo" + bouton "Verifier".
- appel API preview coupon.
- afficher:
  - prix initial
  - montant reduction
  - prix final
  - validite (date expiration, cible du coupon)
- reutiliser le code valide au moment du checkout PayPal.
- etats d'erreur lisibles.

Ne pas degrader:
- flux actuel sans coupon
- capture PayPal retour URL.
```

## Prompt 7 - Review + hardening final
```text
Fais une revue technique finale orientee risques:
- integrite transactionnelle
- securite (fraude, bruteforce code, abuse admin)
- performance SQL/indexes
- compatibilite backward
- observabilite (logs/metrics)

Puis applique les corrections necessaires.
Ensuite, fournis:
1) changelog technique
2) liste complete des endpoints ajoutes/modifies
3) plan de rollout prod en 3 etapes
4) checklist QA pre-prod.
```

## Prompt 8 - Prompt de debug en cas d'echec tests
```text
Des tests echouent apres integration coupons/incentives.
Ta mission:
- reproduire localement
- isoler cause racine
- corriger sans casser backward compatibility
- ajouter test de non-regression
- expliquer pourquoi la correction est sure.
Donne un resume clair avec fichiers modifies.
```
