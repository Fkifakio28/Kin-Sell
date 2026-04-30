# Kin-Sell Analytique+Marché — Spécification du module

**Date** : 22 avril 2026
**Branche** : `sokin/text-video-improvements-20260411-1929`
**Statut** : E1 — Cadrage (à valider avant E2)

---

## 0. Objectifs du module

Transformer Kin-Sell Analytique en une vraie **intelligence économique multi-pays** pour les abonnés payants :

1. Base de **prix d'articles** × 22 catégories × 8 pays (min. 50 articles / cat. / pays, prix local + EUR)
2. Base de **salaires / tarifs de services** × 26 métiers × 8 pays (min. 50 métiers / pays)
3. **Top 50 articles en vogue** / pays (rafraîchi toutes les 24 h)
4. **Top 50 métiers demandés** / pays (rafraîchi toutes les 24 h)
5. **Tendances actuelles et saisonnières** (fenêtres glissantes 12 semaines / 12 mois)
6. **Moteur d'arbitrage cross-pays** (pénurie A ↔ surplus B avec scoring)
7. **Ingestion** : minimum 50 sources par type (presse, petites annonces, marketplaces, stats officielles) par pays ; **Gemini = dernier recours uniquement**

---

## 1. Pays déployés (verrouillés)

Source : `apps/api/src/config/platform.ts` + `packages/db/prisma/seed-countries.ts`.

| Code | Pays | Région | Devise | Taux USD (défaut) | Hub |
|------|------|--------|--------|-------------------|-----|
| **CD** | RDC (Kinshasa) | Afrique Centrale | CDF | 2 850 | Kinshasa |
| **GA** | Gabon | Afrique Centrale | XAF | 605 | Libreville |
| **CG** | Congo-Brazzaville | Afrique Centrale | XAF | 605 | Brazzaville |
| **AO** | Angola | Afrique Australe | AOA | 905 | Luanda |
| **CI** | Côte d'Ivoire | Afrique de l'Ouest | XOF | 605 | Abidjan |
| **GN** | Guinée Conakry | Afrique de l'Ouest | GNF | 8 600 | Conakry |
| **SN** | Sénégal | Afrique de l'Ouest | XOF | 605 | Dakar |
| **MA** | Maroc | Afrique du Nord | MAD | 9.9 | Casablanca |

> Total : **8 pays**. Ajouter de nouveaux pays = ajouter une entrée dans `PLATFORM_COUNTRIES` (pas de changement de schéma).

---

## 2. Taxonomie produits & services (verrouillée)

Source unique : `apps/web/src/shared/constants/category-registry.ts`.

### 2.1 — 22 catégories produits
`food, phone, it, games, pharmacy, clothes, pets, furniture, appliances, electronics, beauty, baby, sports, books, diy, gifts, office, auto, health, carental, realestate, misc`

### 2.2 — 26 catégories services
`driver, daycare, teacher, nurse, cleaner, cook, security, maid, developer, designer, photographer, plumber, electrician, mason, repair, consultant, marketing, coach, svc-beauty, tailor, events, accounting, admin, delivery, gardening, decoration`

### 2.3 — Objectifs de volume

| Dimension | Cible par pays | Cible totale (8 pays) |
|---|---|---|
| Articles produits | 22 cat. × 50 art. = **1 100** | **8 800** articles |
| Métiers services | **50** (superset des 26) | **400** entrées salaires |
| Top articles tendance | **50** | **400** |
| Top métiers demandés | **50** | **400** |

Le superset "50 métiers / pays" inclut les 26 existants + 24 sous-spécialisations (ex. `electrician` → `electrician-industrial`, `electrician-solar`, etc.). La liste détaillée sera produite en E3.

---

## 3. Devises & taux de change

- Source principale : table Prisma `CurrencyRate` déjà en place (`packages/db/prisma/seed.ts:260-306`).
- Source de rafraîchissement : **[Frankfurter API](https://www.frankfurter.app)** (ECB, gratuit, pas de clé) — 1 appel/jour.
- Fallback : taux par défaut (déjà définis dans `currency.service.ts:14-30`).
- Conversion EUR : stockée systématiquement dans la table `MarketPrice` (colonne `priceEurCents`), recalculable sur changement de taux.

---

## 4. Sources de données (cible E3)

Priorité de consultation (du moins cher au plus cher) :

| Priorité | Type | Exemples |
|---|---|---|
| 1 | **Marketplaces locales** (HTML public) | Jumia, Coin Afrique, Avito (MA), Expat-Dakar (SN), Kinshasa Immobilier, Afrimalin, etc. |
| 2 | **Annonces classées** | Maroc-Annonces, Vivastreet local, LinkedIn (public listings), Emploi.sn, Jobzy, Emploi.cd |
| 3 | **Presse économique** | Jeune Afrique, Africa Intelligence, Financial Afrik, Les Echos Afrique, L'Usine Nouvelle Afrique |
| 4 | **Statistiques officielles** | INS-CI, ANSD-SN, HCP-MA, INS-RDC, INE-AO, BCEAO, BEAC, Banque Mondiale, FMI, UN Comtrade |
| 5 | **Agrégateurs API** | Adzuna, Jooble (déjà intégrés), RemoteOK, Indeed (RSS public) |
| 6 | **Gemini + Google Search grounding** | **Dernier recours uniquement** si `<50` entrées après sources 1-5 |

**Cible E3** : 50 sources/type/pays = **50 × 5 types × 8 pays = 2 000 sources cataloguées** (fichiers JSON versionnés dans le repo).

---

## 5. Schéma de données (préparation E2)

Nouveaux modèles Prisma (tables `market_intel_*`) :

```prisma
model MarketProduct {
  id            String   @id @default(cuid())
  slug          String   @unique             // ex: "scooter-haojin-125cc"
  displayName   String
  categoryId    String                         // "auto", "phone", etc.
  canonicalBrand String?
  attributes    Json?                          // { capacity: "125cc", color: "black" }
  createdAt     DateTime @default(now())
  prices        MarketPrice[]
  @@index([categoryId])
}

model MarketPrice {
  id            String   @id @default(cuid())
  productId     String
  countryCode   String                         // "CI", "MA", etc.
  city          String?
  priceMinLocal Int                            // centimes
  priceMaxLocal Int
  priceMedianLocal Int
  localCurrency String                         // "XOF", "MAD", etc.
  priceMedianEurCents Int                      // centimes EUR pour comparaison
  sampleSize    Int                            // nombre de sources agrégées
  sourceIds     String[]                       // IDs vers MarketSource
  collectedAt   DateTime @default(now())
  confidence    Float                          // 0..1 (selon cohérence inter-sources)
  product       MarketProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([countryCode, productId])
  @@index([collectedAt])
}

model MarketJob {
  id             String   @id @default(cuid())
  slug           String   @unique             // "electrician-solar"
  displayName    String
  parentCategoryId String                      // "electrician"
  seniorityLevel String                        // "junior" | "mid" | "senior"
  salaries       MarketSalary[]
}

model MarketSalary {
  id                  String   @id @default(cuid())
  jobId               String
  countryCode         String
  city                String?
  salaryMinLocal      Int                      // centimes/mois
  salaryMaxLocal      Int
  salaryMedianLocal   Int
  localCurrency       String
  salaryMedianEurCents Int
  unit                String                   // "month" | "day" | "hour" | "project"
  sampleSize          Int
  sourceIds           String[]
  collectedAt         DateTime @default(now())
  confidence          Float
  job                 MarketJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@index([countryCode, jobId])
}

model MarketSource {
  id          String   @id @default(cuid())
  name        String                            // "Jumia CI"
  baseUrl     String
  type        String                            // "marketplace" | "classifieds" | "press" | "stats" | "api"
  countryCode String
  parser      String                            // identifiant du fetcher : "jumia-generic", "avito-ma", etc.
  language    String                            // "fr" | "pt" | "ar" | "en"
  trusted     Boolean  @default(false)          // sources officielles
  lastCrawledAt DateTime?
  lastStatus  String?                           // "ok" | "fail" | "blocked"
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  @@index([countryCode, type])
}

model MarketTrend {
  id            String   @id @default(cuid())
  scope         String                          // "product" | "job"
  entityId      String                          // productId ou jobId
  countryCode   String
  period        String                          // "current" | "weekly" | "monthly" | "seasonal"
  rank          Int                             // 1..50 (top)
  score         Float                           // index de vogue 0..100
  deltaPct      Float?                          // variation % sur période précédente
  season        String?                         // "dry-season" | "rainy-season" | "ramadan" | "back-to-school"
  computedAt    DateTime @default(now())
  @@index([countryCode, scope, period])
  @@index([computedAt])
}

model ArbitrageOpportunity {
  id               String   @id @default(cuid())
  scope            String                          // "product" | "job"
  entityId         String
  shortageCountry  String                          // pays en pénurie
  surplusCountry   String                          // pays en surplus
  score            Float                           // 0..100
  demandIndex      Float                           // indice de demande dans shortageCountry
  supplyIndex      Float                           // indice d'offre dans surplusCountry
  priceDeltaEurCents Int?                          // écart de prix médian
  distanceKm       Int?
  rationale        String                          // explication auto-générée
  computedAt       DateTime @default(now())
  @@index([shortageCountry, score])
  @@index([surplusCountry, score])
}
```

---

## 6. Accès & gating

Toutes les nouvelles routes `/analytics/market/*`, `/analytics/jobs-intel/*`, `/analytics/trends/*`, `/analytics/arbitrage/*` sont gated selon :

| Feature | Plans USER | Plans BUSINESS |
|---|---|---|
| `MARKET_INTEL_BASIC` (top 10 articles, 10 métiers, EUR compare) | PRO_VENDOR | BUSINESS |
| `MARKET_INTEL_PREMIUM` (top 50, tendances saisonnières, export CSV) | PRO_VENDOR | SCALE |
| `ARBITRAGE_ENGINE` (opportunités cross-pays, alertes) | — | SCALE |

Nouvelles entrées dans `billing.catalog.ts` (`UserPlanFeature` et `BusinessPlanFeature`). Pas de nouveau plan, on enrichit les plans existants.

---

## 7. Orchestration & coûts

- **Queues** : pas de BullMQ (Kin-Sell n'en a pas). On réutilise le pattern existant `setInterval` + **Redis mutex** (`ks:market:lock:*`) pour éviter les crawls concurrents.
- **Crawl schedule** :
  - Petites annonces / marketplaces → quotidien (02h UTC)
  - Presse / stats officielles → hebdo (dimanche 04h UTC)
  - Gemini fallback → mensuel (et à la demande si gap détecté)
- **Rate-limit crawler** : 1 requête/source toutes les 2 s, user-agent `KinSellBot/1.0 (+https://kin-sell.com/bot)`, respect `robots.txt`.
- **Cache** :
  - Résultats agrégés → Redis 24 h (`ks:market:prices:{country}:{category}`)
  - Top/tendances → Redis 6 h
  - Arbitrage → Redis 12 h

**Budget Gemini estimé** : ~50 appels/jour (fallback + refresh), ~$5/mois avec cache 6h (infrastructure déjà en place dans `regional-market-context.service.ts`).

---

## 8. Plan d'étapes

| # | Étape | Livrable | Validation utilisateur |
|---|---|---|---|
| **E1** ✅ | Cadrage (ce doc) | `docs/KIN-SELL-ANALYTIQUE-PLUS-SPEC.md` | **En attente** |
| E2 | Schéma Prisma + migration | Nouvelles tables `MarketProduct`, `MarketPrice`, `MarketJob`, `MarketSalary`, `MarketSource`, `MarketTrend`, `ArbitrageOpportunity` + seed taxonomie | |
| E3 | Registre sources (JSON) | `apps/api/src/modules/market-intel/sources/{cc}.json` — 50 sources/type/pays | |
| E4 | Fetchers + conversion FX | Fetchers HTTP+Cheerio par source, pipeline normalisation prix, Frankfurter daily | |
| E5 | Scheduler Redis-mutex | `apps/api/src/modules/market-intel/scheduler.ts` | |
| E6 | Fallback Gemini structured | `apps/api/src/modules/market-intel/gemini-fallback.ts` (prompt JSON strict, quota) | |
| E7 | Agrégateurs top/tendances | `aggregator.ts` (top 50, saisonnalité, scoring vogue) | |
| E8 | Moteur arbitrage | `arbitrage.ts` (pénurie↔surplus, règles, scoring) | |
| E9 | API REST | `routes.ts` + gating billing | |
| E10 | UI Analytique Premium | Onglets "Marché", "Métiers", "Tendances", "Arbitrage" dans dashboards | |
| **FINAL** | Build + AAB + commit + push + VPS | Règle 28 — tout à la fin | |

**Règle 28** strictement respectée : aucun build/commit/push intermédiaire, tout en fin de module.

---

## 9. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Sites bloquent le crawler | User-agent identifiable, respect robots.txt, backoff exponentiel, rotation IP VPS en dernier recours |
| Données Gemini inexactes | Systématiquement croiser ≥3 sources réelles avant Gemini ; marquer `confidence < 0.5` si 100% Gemini |
| Explosion coûts Gemini | Cache 6h obligatoire, quota 50 appels/jour, fallback UNIQUEMENT si crawl < 50 entrées |
| Disk usage Redis | TTL systématique (24h max), pas de persistance longue en Redis (Postgres pour l'historique) |
| Charge VPS (CPU/RAM) | Crawl 02h UTC (hors pic utilisateurs), parallélisme max 5 workers |
| Droits d'auteur / scraping | Ne stocker que données factuelles (prix, titre, lieu), jamais de copie intégrale de contenu ; attribution source sur UI |
| Conformité RGPD / DSP2 | Aucune donnée personnelle collectée par crawler (prix et listings publics uniquement) |

---

## 10. Questions encore ouvertes (à confirmer avant E2)

1. Les features `MARKET_INTEL_BASIC/PREMIUM` et `ARBITRAGE_ENGINE` doivent-elles être **incluses** dans PRO_VENDOR/SCALE, ou facturées en **add-on** distinct ($X/mois) ?
2. Langue d'affichage : FR par défaut pour tous les pays, ou auto selon pays (PT pour AO, AR pour MA) ?
3. Le crawler doit-il respecter un **budget mensuel en $** (pour Gemini) visible admin ? Je propose un kill-switch `ENABLE_MARKET_INTEL` + cap `MAX_GEMINI_MARKET_CALLS_PER_DAY=50`.
4. Confirmes-tu qu'on peut stocker jusqu'à **~10 000 lignes de MarketPrice** + ~3 000 de MarketSalary (OK Postgres actuel) ?
