# Prompt Pack V2 pour Claude IA
Date: 2026-04-17
Mode: amelioration post-audit, execution par phases
Usage: copier 1 prompt a la fois dans Claude, attendre la fin, verifier les tests, puis passer au suivant.

## 0) Contexte reel (code-base actuelle a respecter)
- IA ADS decision engine: `apps/api/src/modules/ads/ai-ads-engine.service.ts`
- IA ADS triggers: `apps/api/src/modules/analytics/ai-trigger.service.ts`
- IA Messenger promo: `apps/api/src/modules/ads/ia-messenger-promo.service.ts`
- Incentive engine (coupons + grants): `apps/api/src/modules/incentives/incentive.service.ts`
- Incentive routes admin/public: `apps/api/src/modules/incentives/incentive.routes.ts`
- Billing coupon preview + checkout PayPal: `apps/api/src/modules/billing/billing.routes.ts`, `apps/api/src/modules/billing/billing.service.ts`
- Ads click tracking (CPC grant already partially emitted): `apps/api/src/modules/ads/ads.service.ts`
- Admin IA Message routes: `apps/api/src/modules/admin/admin.routes.ts`
- Front /forfaits promo input: `apps/web/src/features/pricing/PricingPage.tsx`
- Front admin IA Message panel: `apps/web/src/features/dashboards/AdminDashboard.tsx`

## 1) Regles metier verrouillees (non negociables)
1. Reductions standard: `10, 30, 50, 70, 100`.
2. Coupon `100%` valide max `14 jours` (1 a 2 semaines).
3. Segment testeur: reductions `20, 50, 80` + possibilite `add-on gratuit`.
4. Eligibilite coupon IA Messager: `1 user sur 10`.
5. Eligibilite CPC/CPI/CPA: `1 user sur 10`.
6. Max `7 coupons/mois/user`.
7. Au moins `15%` des coupons distribues du mois doivent etre a `100%` (policy configurable).
8. Max `15 grants CPC/CPI/CPA/mois/user`.
9. Dans ces grants: max `3` reductions a `80%` et max `1` gain add-on gratuit/mois.
10. Super-admin peut: creer, envoyer, supprimer, activer, pauser, prolonger, revoquer manuellement.
11. IA Messenger = canal d envoi; IA ADS = decideur contextuel; Incentive Engine = source of truth metier.
12. Validation finale des remises uniquement cote serveur (billing/incentive), jamais en front.
13. Backward compatibility obligatoire sur endpoints existants.

## 2) Bloc de discipline (a coller avant chaque prompt)
```text
Tu travailles dans un monorepo TypeScript/Prisma Kin-Sell.
Tu dois:
- Deriver les conclusions du code reel (pas de devinette).
- Preserver backward compatibility.
- Eviter la duplication de logique metier.
- Garder incentive.service comme source of truth des quotas/probabilites.
- Livrer des changements incrementaux + tests.
- Inclure references fichiers/lignes dans ton resume final.

Format de sortie obligatoire a la fin de chaque phase:
1) Resume en 8-12 lignes
2) Fichiers modifies
3) Migrations (si applicable)
4) Endpoints ajoutes/modifies
5) Tests ajoutes/lances + resultat
6) Risques restants
```

## Prompt 0 - Master Orchestration V2 (improvement program)
```text
Tu executes un programme d amelioration complet IA ADS + IA Messager + Incentives, base sur le code actuel.

Objectif:
- Rendre IA ADS autonome, coherent et tracable sur toutes combinaisons forfait/add-ons/activite.
- Coupler proprement IA ADS (decision) + Incentive Engine (quotas/probas) + IA Messager (distribution).
- Fiabiliser coupons CPC/CPI/CPA de bout en bout avec controle super-admin.

Contraintes:
- Pas de rupture des flux existants (billing PayPal, recommandations, admin).
- Ne pas casser les endpoints publics deja utilises.
- Garder max 3 offres IA ADS par cycle et anti-spam existant.

Plan d execution impose:
1) Audit executable par combinaisons (matrice exhaustive + anomalies)
2) Correctifs IA ADS (coherence decisionnelle)
3) Branchement IA ADS -> Incentive Engine
4) Couplage IA Messenger comme canal
5) Pipeline CPC/CPI/CPA end-to-end
6) Super-admin controls + diagnostic
7) Tests massifs + hardening securite
8) Rollout plan + checklist QA

Definition of done:
- Matrice de reaction IA ADS fiable et justifiee par le code.
- Incentives emis sans doublons, avec quotas/probas respectes.
- Messages IA envoyes de facon idempotente.
- Coupons/grants pilotables manuellement par super-admin.
- Telemetrie et endpoint diagnostic expliquant chaque decision.

Livre maintenant uniquement la phase 1 (audit executable), pas le reste.
```

## Prompt 1 - Audit executable IA ADS par combinaisons (ultra detaille)
```text
Mission: faire un audit technique executable de IA ADS selon combinaisons forfait/add-ons/activite.

Sources obligatoires:
- apps/api/src/modules/ads/ai-ads-engine.service.ts
- apps/api/src/modules/analytics/ai-trigger.service.ts
- apps/api/src/modules/ads/ads.service.ts
- apps/api/src/modules/ads/ia-messenger-promo.service.ts

Tu dois couvrir au minimum ces axes:
1) scope: USER / BUSINESS
2) statut forfait: aucun, actif, expire/inactif
3) plan:
   - USER: FREE, BOOST, AUTO, PRO_VENDOR
   - BUSINESS: STARTER, BUSINESS, SCALE
4) add-ons: aucun / partiel / complet
   - IA_MERCHANT, IA_ORDER, BOOST_VISIBILITY, ADS_PACK
5) activite:
   - faible (0 listing, 0 vente, 0 nego)
   - moyenne (5 listings, 3 ventes, conversion nego faible)
   - forte (20 listings, 20 ventes, conversion elevee)
6) stagnation: oui/non
7) triggers reels:
   - LISTING_PUBLISHED
   - SALE_COMPLETED
   - STAGNATION_CHECK
   - PERIODIC

Livrable strict:
A) Matrice scenario (minimum 48 scenarios) avec colonnes:
- ScenarioId (X1..X48+)
- Scope
- PlanState (none/active/expired)
- PlanCode
- AddonsActifs
- ActivityTier
- Trigger
- OffresProposees (ordre exact)
- Pourquoi (regles + conditions)
- ReferencesCode (fichier:ligne)

B) Tableau anti-spam/frequences:
- triggerType
- fenetre blocage (heures)
- fonction qui applique la garde

C) Tableau priorites:
- type d offre
- priorite type
- regles de tri
- effet limite max 3

D) Liste anomalies P0/P1/P2:
- symptome
- impact business
- cause racine code
- proposition de correction

E) Verdict final:
- IA ADS est-il coherent aujourd hui?
- ou sont les risques de "betises"?
- top 5 corrections a faire en premier.

Important:
- Ne pas inventer.
- Si une info manque, ecris "non trouve dans le code".
```

## Prompt 2 - Creer un audit harness testable (simulation combinaisons)
```text
Mission: transformer l audit en tests automatiques reproductibles.

Objectif:
- Simuler les profils IA ADS sans dependre d une base reelle.
- Verifier, scenario par scenario, ce que generateSmartOffers retourne.
- Capturer les regressions futures.

A implementer:
1) Creer un jeu de fixtures de SellerProfile representant les scenarios X/Y/Z.
2) Ajouter un test matrix qui couvre:
   - USER et BUSINESS
   - plan none/active/expired (expired mappe en "none" pour la logique)
   - add-ons combos critiques
   - activite faible/moyenne/forte
   - stagnation oui/non
3) Pour chaque trigger, verifier:
   - type d offres retournees
   - ordre de priorite
   - max 3 offres
   - coherences (pas de suggestion impossible)
4) Exporter un rapport machine-readable (json) dans un dossier test-output.

Fichiers cibles (adapter au repo):
- apps/api/src/__tests__/...
- apps/api/src/modules/ads/ai-ads-engine.service.ts (si extraction helper utile)

Acceptance criteria:
- Le test matrix echoue si une offre incoherente apparait.
- Le rapport contient au moins 48 lignes de scenarios.
- Les assertions couvrent explicitement FREE/STARTER/BOOST/AUTO/PRO_VENDOR/BUSINESS/SCALE.
```

## Prompt 3 - Correctifs IA ADS (coherence decisionnelle)
```text
Mission: corriger les anomalies de decision IA ADS detectees a la phase audit.

Problemes a traiter en priorite:
1) Eviter recommendation "meme plan" (ex: STARTER -> STARTER).
2) Eviter doublons d offres proches dans un meme cycle.
3) Eviter suggestions contradictoires (SUBSCRIPTION + UPGRADE incoherent simultane).
4) Harmoniser actionTarget/actionData pour etre exploitable par UI.
5) Garder limite max 3 et tri priorite stable.

Contraintes:
- Ne pas casser l architecture actuelle de generateSmartOffers.
- Ne pas degrader les fallbacks dans ai-trigger.
- Ne pas changer le comportement si aucune anomalie n est presente.

Tests a ajouter:
- unit test par anomalie corrigee
- regression test sur tri + dedupe + max 3
- scenario BUSINESS STARTER et USER FREE obligatoires

Livrable:
- diff code
- liste des regles avant/apres
- preuve par tests.
```

## Prompt 4 - Branchement IA ADS -> Incentive Engine (decision vers incentive)
```text
Mission: brancher IA ADS aux incentives de facon propre et idempotente.

Points de branchement obligatoires:
- apps/api/src/modules/analytics/ai-trigger.service.ts
  - onListingPublished
  - onSaleCompleted
  - checkStagnation
  - runPeriodicSmartCheck
- apps/api/src/modules/ads/ads.service.ts (recordClick deja CPC partiel)

Regles:
1) Pour coupons:
   - appeler selectIncentiveForUser(userId, { segment }) dans les triggers IA ADS.
2) Pour grants:
   - appeler emitGrowthGrant(userId, kind, { segment, metadata }) sur events adaptes.
3) Enrichir aiRecommendation.actionData avec:
   - incentive: { couponCode, discountPercent, expiresAt, grantId, grantKind, sourceEventKey }
4) Ajouter dedup event-level:
   - un meme evenement metier ne doit pas emettre deux fois le meme incentive.
5) Quotas/probas restent uniquement dans incentive.service.

Mapping recommande:
- LISTING_PUBLISHED: coupon candidate
- SALE_COMPLETED: coupon candidate + CPA grant candidate
- STAGNATION_CHECK: coupon candidate
- PERIODIC: coupon candidate + grant candidate contextuel
- ad click (ads.service): CPC grant candidate (deja partiel, a fiabiliser)

Important:
- Ne pas dupliquer la gate 1/10 dans plusieurs couches.
- Si selection incentive = null, continuer flow sans erreur.

Tests:
- idempotence par evenement
- quota respecte
- recommendation creee avec/sans incentive
- non regression triggers existants.
```

## Prompt 5 - Coupler IA Messager comme canal unique de distribution
```text
Mission: IA ADS decide, IA Messager distribue, Incentive Engine arbitre.

Fichiers centraux:
- apps/api/src/modules/ads/ia-messenger-promo.service.ts
- apps/api/src/modules/analytics/ai-trigger.service.ts
- apps/api/src/modules/incentives/incentive.service.ts

A faire:
1) Ajouter fonctions explicites:
   - sendCouponIncentiveMessage(...)
   - sendGrowthGrantMessage(...)
   - sendGrantConvertedToCouponMessage(...)
2) Message templates dedies:
   - coupon (code, pourcentage, expiration, cible)
   - grant CPC/CPI/CPA (etapes de conversion)
   - conversion grant -> coupon
3) Idempotence message:
   - pas de double envoi pour meme coupon/grant/event.
4) Fallback canaux:
   - push -> email -> log internal fallback.
5) Tracing:
   - aiAutonomyLog avec metadata structuree (eventKey, couponCode, grantId).

Correction critique attendue:
- Supprimer toute double probabilite parasite.
- La probabilite d attribution doit etre appliquee UNE seule fois dans incentive.service.

Tests:
- message unique pour coupon unique
- fallback si push/email indisponible
- preserve promoteListingBoost/promoteHighlight existants.
```

## Prompt 6 - Pipeline CPC/CPI/CPA de bout en bout (tracking -> conversion -> coupon)
```text
Mission: rendre les grants CPC/CPI/CPA operationnels de bout en bout.

Etat actuel:
- emitGrowthGrant existe
- recordGrowthEvent existe
- il manque un pipeline securise et une exposition API complete

A implementer:
1) Endpoints securises pour events grants:
   - POST /incentives/grants/:id/events
   - body: { eventType: click|install|action|conversion, idempotencyKey, metadata }
2) Validation:
   - ownership grant/user
   - grant status ACTIVE
   - eventType valide
3) Dedup replay:
   - idempotencyKey obligatoire pour conversion
   - rejet si meme key deja vue
4) Conversion:
   - consume grant
   - create coupon associe
   - notifier via IA Messager
5) Anti-abus:
   - rate limit par user et par grant
   - logs de securite

Mapping business:
- click -> CPC
- install -> CPI
- action -> CPA

Tests obligatoires:
- emission grant
- event tracking simple
- conversion unique
- double conversion rejetee
- coupon cree correctement + message envoye.
```

## Prompt 7 - Super-admin controls (main mise totale)
```text
Mission: renforcer le pilotage super-admin sur incentives dans l onglet IA Message.

Backend:
1) Etendre endpoints admin incentives:
   - update policy (probas/quotas/target ratio 100%)
   - global pause incentives
   - override quota user
   - force emit coupon/grant
   - force consume/revoke grant
2) Ajouter audit log obligatoire:
   - qui, quand, quoi, pourquoi, ancienne valeur, nouvelle valeur

Frontend admin (AdminDashboard, section IA Message):
1) Bloc policies:
   - couponProbability, growthProbability
   - maxCouponsPerMonth, maxGrowthGrantsPerMonth
   - maxDiscount80PerMonth, maxAddonGainPerMonth
   - target100Ratio
2) Bloc override user:
   - visualiser compteur mois en cours
   - override temporaire
3) Bloc actions rapides:
   - force create coupon/grant
   - pause/resume global
   - run expire job
   - run rebalance 100 job

Securite:
- SUPER_ADMIN only pour destructive/override.
- ADMIN peut lire mais pas override critique (a confirmer selon permission model existant).
```

## Prompt 8 - Diagnostic explainability (pour savoir si IA fait des betises)
```text
Mission: fournir un endpoint diagnostic qui explique pourquoi un user a recu (ou non) une offre/incentive.

A ajouter:
1) Endpoint read-only super-admin:
   - GET /incentives/admin/diagnostic/:userId
2) Sortie detaillee:
   - dernier profil vendeur calcule (sans donnees sensibles)
   - dernieres recommandations IA ADS (avec trigger + priorite)
   - evaluation gate coupon/grant (passed/failed + raison)
   - etat quotas mensuels
   - dernieres emissions coupons/grants/messages
   - anti-spam hits (quand recommendation bloquee)
3) "Decision trace" structure:
   - step, input, rule, output, reason

Objectif:
- super-admin comprend en 1 ecran si IA ADS agit bien ou non.

Tests:
- user eligible
- user non eligible (quota atteint)
- user bloque par anti-spam
- user sans plan/avec plan.
```

## Prompt 9 - Front integration /forfaits + recommendations
```text
Mission: finaliser la coherence front entre recommendations IA ADS, coupons, et checkout.

Zones:
- apps/web/src/features/pricing/PricingPage.tsx
- composants qui affichent aiRecommendation (UserDashboard, BusinessDashboard, AiSmartPopup)

A faire:
1) Si actionData contient incentive coupon:
   - afficher code/discount/expiry dans UI recommendation
   - deep-link vers /forfaits avec pre-remplissage code
2) Dans /forfaits:
   - conserver preview coupon existante
   - afficher clairement:
     - prix initial
     - reduction
     - prix final
     - expiration coupon
3) Au checkout:
   - reutiliser seulement code valide
   - si invalide/expire, message clair et fallback achat normal
4) UX:
   - ne pas casser flux sans coupon
   - ne pas casser capture PayPal retour

Tests front:
- recommendation sans incentive
- recommendation avec coupon
- checkout avec coupon valide
- checkout avec coupon invalide/expire.
```

## Prompt 10 - Hardening securite et anti-fraude
```text
Mission: durcir le systeme incentive contre abus/fraude.

Checklist a implementer:
1) Coupon brute-force protection:
   - rate limit validation/preview/redeem
   - lockout progressif temporaire
2) Event replay protection grants:
   - idempotency key et contrainte unicite
3) Ownership strict:
   - aucun grant/coupon ne peut etre consomme par un autre user
4) Admin abuse protection:
   - audit log immuable des overrides
   - motifs obligatoires pour force actions
5) Data consistency:
   - transactions sur operations critiques
   - rollback propre en cas d echec paiement

Deliverables:
- corrections code
- tests securite
- mini threat model (risque -> mitigation -> test).
```

## Prompt 11 - Observability et KPI autonomie
```text
Mission: ajouter observabilite business + technique pour piloter autonomie IA ADS.

A tracer:
1) Funnels:
   - recommendation shown -> clicked -> accepted -> checkout -> paid
2) Incentive KPIs:
   - coupons emitted/redeemed/expired/revoked
   - grants emitted/converted/expired/revoked
   - ratio coupons 100% mensuel vs target
3) Guard KPIs:
   - anti-spam blocked count
   - quota blocked count
   - probability gate pass/fail stats
4) Messaging KPIs:
   - sent/delivered/opened par canal
   - duplicate prevented count

Sorties:
- endpoint(s) stats admin
- logs structures
- definitions KPI documentees
- requetes SQL/Prisma performantes avec index.
```

## Prompt 12 - Test strategy complete (unit + integration + regression)
```text
Mission: fournir une couverture de tests robuste sur tout le pipeline.

Suite minimale:
1) Unit:
   - generateSmartOffers decision rules
   - selectIncentiveForUser quotas/proba
   - emitGrowthGrant constraints
   - recordGrowthEvent conversion logic
2) Integration:
   - ai-trigger emits recommendations with incentive data
   - ia-messenger sends once per event/coupon/grant
   - billing checkout with/without promo code
3) Regression matrix:
   - scenarios X/Y/Z + business
   - plan active/inactive/expired
   - add-ons active/inactive
   - activity tiers
4) Concurrency:
   - anti double redemption
   - anti double conversion

Output obligatoire:
- liste tests ajoutes
- commande d execution
- resultat (pass/fail)
- coverage sur modules modifies.
```

## Prompt 13 - Rollout production en 3 etapes + rollback
```text
Mission: preparer un plan prod safe pour ce systeme.

Livrables:
1) Etape 1 (shadow mode):
   - IA ADS calcule incentives mais sans envoi user
   - log only + compare expected/actual
2) Etape 2 (limited rollout):
   - activation sur petit pourcentage users
   - super-admin monitor KPI/risques
3) Etape 3 (full rollout):
   - generalisation + monitoring continu

Inclure:
- feature flags necessaires
- seuils d alerte (error rate, duplicate rate, quota violations)
- plan rollback instantane
- post-rollout checklist (J+1, J+7, J+30).
```

## Prompt 14 - Final review technique et patch final
```text
Mission: faire la revue technique finale orientee risques puis appliquer les derniers correctifs.

Axes de revue:
1) Integrite transactionnelle
2) Securite/fraude
3) Performance SQL/index
4) Compatibilite backward
5) Observabilite
6) Experience admin
7) Experience utilisateur (/forfaits + recommendations)

Ensuite:
- appliquer les derniers patchs necessaires
- relancer les tests critiques
- produire un changelog final ultra clair

Format final obligatoire:
1) Changelog technique (par module)
2) Endpoints ajoutes/modifies
3) Migrations
4) Tests ajoutes/lances
5) Risques restants + plan mitigation
6) Check QA pre-prod (checklist executable)
```

## Prompt 15 - Prompt de debug rapide (si un test casse apres integration)
```text
Contexte: un ou plusieurs tests cassent apres integration IA ADS <-> Incentives <-> IA Messager.

Ta mission:
1) Reproduire localement
2) Isoler cause racine precise
3) Corriger sans casser backward compatibility
4) Ajouter test de non regression
5) Expliquer pourquoi le patch est sur

Exigences:
- minimiser le diff
- pas de refactor large non necessaire
- garder la logique metier dans incentive.service (source of truth)

Rendu:
- cause racine en 3-5 lignes
- fichiers modifies
- tests avant/apres
- risques residuels.
```

## Ordre conseille d execution
1. Prompt 0
2. Prompt 1
3. Prompt 2
4. Prompt 3
5. Prompt 4
6. Prompt 5
7. Prompt 6
8. Prompt 7
9. Prompt 8
10. Prompt 9
11. Prompt 10
12. Prompt 11
13. Prompt 12
14. Prompt 13
15. Prompt 14
16. Prompt 15 (seulement si echec)
