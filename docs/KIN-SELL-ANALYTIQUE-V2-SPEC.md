# Kin-Sell Analytique 2.0 — Spécification Chantier C

> **Date :** 22 avril 2026
> **Chantier :** C — Analytique dual (VENTE + EMPLOI) + couplage Knowledge IA
> **Statut :** Phase 1 / 7 — Spec validée → Phase 2 Schema Prisma

---

## 1. Objectifs métier

1. **Analyser / cibler / répondre** aux clients (vente ET emploi) avec précision
2. **Enrichir analytique emploi** (RDC + international, comme pour la vente)
3. **Coupler Kin-Sell Analytique ↔ Knowledge IA** en bi-directionnel
4. **Réponses "droit au but"** : 1 douleur → 1 action → 1 CTA (fini les listes fourre-tout)
5. **Frustration freemium 2.0** : pousser l'abonnement par preview calibré + urgence contextuelle

---

## 2. Contrats d'API emploi (nouveaux endpoints)

Base path : `/analytics/jobs/*` — guardé par `requireAuth`, tier freemium appliqué par middleware.

### 2.1 `GET /analytics/jobs/demand-map`
Carte de la demande emploi par (pays, ville, secteur).

**Query** : `?category=<string>&countries=CD,GA&limit=50`

**Response** :
```json
{
  "updatedAt": "2026-04-22T10:00:00Z",
  "scope": "NATIONAL | CROSS_BORDER",
  "zones": [
    {
      "country": "CD", "city": "Kinshasa",
      "category": "IT",
      "openJobs": 142,
      "applicants": 387,
      "saturationIndex": 2.72,   // applicants / openJobs
      "trend7d": "+12%",
      "avgSalaryUsd": 450,
      "topSkills": ["React", "Node.js", "SQL"]
    }
  ]
}
```

**Tier** : MEDIUM = 3 zones preview, PREMIUM = illimité + top skills + salaries.

### 2.2 `GET /analytics/jobs/alignment-score`
Score d'alignement entre un utilisateur et une offre.

**Query** : `?jobId=<id>` (ou `&candidateUserId=<id>` pour recruteur)

**Response** :
```json
{
  "scoreGlobal": 0.74,     // 0-1
  "breakdown": {
    "qualifications": 0.85,   // match diplômes/certs
    "experience":     0.70,   // années + domaine
    "geo":            1.00,   // même ville
    "salary":         0.60,   // fourchette alignée
    "skills":         0.55    // skills demandés vs maîtrisés
  },
  "strengths": ["Même ville", "Certification AWS alignée"],
  "gaps":      ["Manque 2 ans d'expérience backend"],
  "verdict":   "Candidature fortement recommandée",
  "cta":       { "label": "Postuler maintenant", "action": "APPLY_JOB", "jobId": "..." }
}
```

**Tier** : FREE = verdict + 1 strength + CTA. MEDIUM = breakdown partiel. PREMIUM = complet + gap analysis.

### 2.3 `GET /analytics/jobs/market-snapshot`
Vue d'ensemble marché emploi pour le viewer (selon son intent Knowledge IA).

**Response** :
```json
{
  "asCandidate": {
    "openJobsForMe": 23,
    "avgAlignmentScore": 0.62,
    "hotCategories": [
      { "category": "Santé", "jobs": 47, "alignment": 0.81 }
    ],
    "recommendations": [ /* voir §4 réponses droit au but */ ]
  },
  "asRecruiter": {
    "activeJobs": 3,
    "candidatePool": 156,
    "avgApplicationsPerJob": 12,
    "poolSaturation": "LOW | MEDIUM | HIGH",
    "recommendations": [ ... ]
  }
}
```

### 2.4 `GET /analytics/jobs/my-applications-insights`
Insights sur les candidatures envoyées par le user (candidate-side).

**Response** :
```json
{
  "totalApplications": 12,
  "byStatus":     { "PENDING": 4, "SEEN": 6, "REJECTED": 1, "ACCEPTED": 1 },
  "responseRate": 0.58,
  "avgResponseDelayHours": 72,
  "bestAlignmentCategory": "IT",
  "frustrationSignal":     "LOW_RESPONSE_RATE",   // trigger upsell
  "coaching": { "headline": "...", "action": "...", "cta": { ... } }
}
```

### 2.5 `GET /analytics/jobs/posting-insights`
Insights pour un **recruteur** sur ses offres publiées.

**Response** : `impressions`, `views`, `applicationRate`, `qualityScore` (distribution des scores de candidatures reçues), `recommendations[]`.

---

## 3. Matrice freemium unifiée

| # | Feature | FREE | MEDIUM | PREMIUM |
|---|---|---|---|---|
| **Vente — existant** | | | | |
| 1 | Vues/contacts de mes annonces | ✅ compte | ✅ détail | ✅ + prédictions |
| 2 | Tendances So-Kin locales | 🔒 preview 3 | ✅ 10 | ✅ illimité |
| 3 | BasicInsights (activité) | 🔒 | ✅ | ✅ |
| 4 | DeepInsights (funnel, prédictions) | 🔒 | 🔒 | ✅ |
| 5 | Post-publish advisor (annonce) | ✅ 1/type | ✅ tous | ✅ + A/B |
| 6 | Demand map vente | 🔒 preview flou | ✅ 5 zones | ✅ illimité |
| 7 | Cross-border demand | 🔒 | 🔒 | ✅ |
| **Emploi — nouveau** | | | | |
| 8 | Mes candidatures (stats base) | ✅ compteurs | ✅ + taux | ✅ + insights détail |
| 9 | Alignment score sur une offre | ✅ verdict + CTA | ✅ breakdown partiel | ✅ complet + gap |
| 10 | Demand map emploi (par secteur) | 🔒 preview 3 | ✅ 10 | ✅ illimité |
| 11 | Candidate pool (recruteur) | 🔒 | ✅ pool size | ✅ + qualité distrib. |
| 12 | Top skills demandés/région | 🔒 | ✅ 5 | ✅ + tendances |
| 13 | Cross-border jobs | 🔒 | 🔒 | ✅ |
| 14 | Post-candidature advisor | ✅ 1 | ✅ tous | ✅ + coaching |
| 15 | Salaires moyens/région | 🔒 | ✅ range | ✅ + médianes |
| **Knowledge IA** | | | | |
| 16 | Configurer mon intent | ✅ | ✅ | ✅ |
| 17 | Recommandations ciblées | 🔒 preview 1 | ✅ 3 | ✅ 10 + alerts |
| 18 | Cross-border intent | 🔒 | 🔒 | ✅ |

**Plans correspondants** :
- `FREE`, `STARTER` → FREE tier
- `BOOST`, `AUTO`, `PRO_VENDOR`, `BUSINESS` → MEDIUM tier
- `SCALE` → PREMIUM tier

---

## 4. Moteur "Réponses droit au but"

### 4.1 Principe
Une réponse analytique = **1 douleur + 1 action + 1 CTA**. Structure universelle :

```ts
interface DirectAnswer {
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  pain:     string;        // "Votre taux de réponse est 28% sous la moyenne"
  action:   string;        // "Relancez les 3 employeurs après 72h"
  cta:      {
    label: string;         // "Voir mes candidatures en attente"
    action: string;        // "OPEN_APPLICATIONS" | "UPGRADE_PLAN" | "EDIT_PROFILE"
    meta?: Record<string, unknown>;
  };
  source:   'SELL' | 'JOB' | 'HYBRID';
  priority: number;        // 0-100, ordre d'affichage
}
```

### 4.2 Pipeline de priorisation
1. **Collecter** signaux (analytics SELL + JOB + Knowledge IA intent)
2. **Scorer** chaque signal : `severity × urgency × userValue`
3. **Dédupliquer** par `pain` (2 signaux = 1 réponse fusionnée)
4. **Limiter** : top N selon tier (FREE=1, MEDIUM=3, PREMIUM=10)
5. **Contextualiser** : intent Knowledge IA pondère (viewer HIRE → priorise réponses recruteur)

### 4.3 Exemples

**VENTE (cas vendeur bas engagement)** :
```
🔴 CRITICAL — source: SELL
Pain:   "Vos 4 annonces n'ont reçu aucun contact en 7 jours"
Action: "Boostez votre meilleure annonce (5$, +143% de visibilité estimée)"
CTA:    [Lancer un boost] → /listings/l_42?boost=1
```

**EMPLOI (cas candidat taux de réponse faible)** :
```
🟠 WARN — source: JOB
Pain:   "58% de vos candidatures restent sans réponse après 7j"
Action: "Mettez à jour 2 certifications manquantes (+0.21 alignment)"
CTA:    [Compléter mon profil] → /account?section=verification
```

**HYBRID (vendeur qui cherche aussi emploi)** :
```
🟢 INFO — source: HYBRID
Pain:   "Votre secteur IT à Kinshasa : +47 offres cette semaine"
Action: "Votre score d'alignement moyen = 0.74 (top 15%)"
CTA:    [Voir les offres matchées] → /jobs?match=high
```

---

## 5. Frustration freemium 2.0

### 5.1 Trois patterns de teasing calibré

**Pattern A — Preview partiel + chiffre masqué**
```
┌──────────────────────────────────────────┐
│ 📊 Demande dans votre secteur           │
│ Kinshasa · IT · 7 derniers jours         │
│                                          │
│ +████% de croissance  🔒                 │
│ ███ offres ouvertes   🔒                 │
│                                          │
│ [🔓 Débloquer avec PRO_VENDOR — 5$/mois] │
└──────────────────────────────────────────┘
```
Principe : on montre le **contexte** (secteur, zone, tendance positive) mais on floute **le chiffre qui donne la valeur**. Plus frustrant qu'un simple lock.

**Pattern B — Contextualisation sociale**
```
┌──────────────────────────────────────────┐
│ 73% des vendeurs PREMIUM de votre zone  │
│ ont converti 2,3× plus ce mois.          │
│                                          │
│ Votre score actuel : 0.42 (médian)       │
│ Score PREMIUM moyen : 0.81               │
│                                          │
│ [📈 Passer PREMIUM et doubler mes ventes]│
└──────────────────────────────────────────┘
```

**Pattern C — Urgence basée sur l'intent**
Pour un user avec intent `WORK` Knowledge IA :
```
┌──────────────────────────────────────────┐
│ ⏰ 23 nouvelles offres IT à Kinshasa     │
│ correspondent à votre profil cette semaine│
│                                          │
│ Vous en voyez 3 sur 23 (FREE)            │
│                                          │
│ [Voir les 20 autres + alertes temps réel]│
└──────────────────────────────────────────┘
```

### 5.2 Règles
- **Jamais de blur total** sur un insight — toujours un **hook visible** (contexte, comparaison, tendance)
- **Le chiffre-clé est masqué**, pas l'ensemble
- **CTA contextuel** : prix explicite + bénéfice concret ("doubler vos ventes", "voir les 20 autres")
- **Urgence calibrée** basée sur intent Knowledge IA (pas de fake scarcity)
- **1 frustration / écran max** : sinon saturation et rejet

### 5.3 Metrics à tracker (Phase 7)
- `cta_impression` — vue d'un teasing
- `cta_click` — clic sur upgrade
- `cta_conversion` — abonnement réalisé dans les 48h
- Taux cible : `cta_click / cta_impression` > 8%, conversion > 2%

---

## 6. Couplage Knowledge IA ↔ Analytics (bi-directionnel)

### 6.1 Flux descendant (Knowledge → Analytics)
`UserKnowledgeIntent` enrichit les requêtes analytics :
- `goals.includes('WORK')` → `/analytics/jobs/market-snapshot` renvoie `asCandidate` prioritaire
- `countriesInterest=['CD','GA']` → `demand-map` filtre automatiquement
- `categories=['IT']` → `alignment-score` biaise les recommendations

### 6.2 Flux ascendant (Analytics → Knowledge)
Les insights analytiques **alimentent** les recommendations Knowledge IA :
- Si `my-applications-insights.responseRate < 0.3` → Knowledge génère une recommandation "Améliorer votre profil"
- Si `posting-insights.applicationRate < 0.1` → Knowledge propose "Reformuler votre offre"
- Si `demand-map` détecte un spike → Knowledge déclenche une alerte intent-based

### 6.3 API service partagé
Nouveau fichier `apps/api/src/modules/analytics/analytics-knowledge-bridge.ts` :
```ts
export async function enrichInsightsWithIntent(userId, rawInsights): Promise<DirectAnswer[]>;
export async function enrichKnowledgeWithAnalytics(userId, recommendations): Promise<Recommendation[]>;
```

---

## 7. Scoring alignement candidat ↔ offre (formule)

```
alignment = qualifications * 0.35
          + experience     * 0.25
          + skills         * 0.20
          + geo            * 0.10
          + salary         * 0.10

qualifications = |intersection(candQuals, reqQuals)| / |reqQuals|
experience     = min(1, candYears / max(1, reqYears))  *  domainMatch
skills         = |intersection(candSkills, reqSkills)| / |reqSkills|
geo            = sameCity ? 1 : sameCountry ? 0.6 : 0.2
salary         = 1 - |candExpected - offered| / offered  (clip 0-1)
```

**Verdict** (calculé à partir du score global) :
- `>= 0.75` → "Candidature fortement recommandée"
- `0.50–0.74` → "Candidature envisageable"
- `0.30–0.49` → "Profil partiel — compléter avant de postuler"
- `< 0.30` → "Incompatible — voir ces alternatives"

---

## 8. Livrables par phase suivante

| Phase | Fichiers créés | Tests |
|---|---|---|
| **2** | `packages/db/prisma/schema.prisma` (+ 5 modèles) + migration | Prisma validate |
| **3** | `job-analytics.service.ts`, `job-advisor.service.ts`, `job-analytics.routes.ts` | `boost-job-analytics.test.ts` |
| **4** | `analytics-knowledge-bridge.ts` + refactor `knowledge-ai.service.ts` | `knowledge-bridge.test.ts` |
| **5** | `direct-answer.engine.ts` (scorer + dédup + prio) | `direct-answer.test.ts` |
| **6** | Refonte `AnalyticsCTAPanel.tsx`, `SmartUpsell.tsx`, nouveaux CSS teasing calibré | Tests snapshot UI |
| **7** | `DashboardJobAnalytics.tsx`, intégration UserDashboard + BusinessDashboard, deploy VPS | QA checklist |

---

## 9. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Migration Prisma casse prod | Phase 2 fait migration additive (pas de DROP), tests stagging avant deploy |
| Knowledge IA bi-directionnel → boucle infinie | Bridge service force un seul round-trip, cache court Redis (60s) |
| Frustration freemium perçue comme "dark pattern" | Pattern A/B/C respectent toujours un hook visible + prix clair |
| Scoring alignement trop naïf | Phase 3 implémente v1, Phase 7 ouvre collecte feedback pour calibration v2 |

---

**Fin Phase 1.** Prêt pour Phase 2 (Schema Prisma emploi).
