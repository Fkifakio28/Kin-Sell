# Rapport de nettoyage architecture - 06/04/2026

## Objectif

Stabiliser l'architecture Kin-Sell en supprimant les couches pseudo-intelligentes et redondantes qui dupliquaient des responsabilites deja couvertes par l'infrastructure, le backend ou les mecanismes standards navigateur.

## Perimetre traite

### 1) Suppression des couches redondantes frontend

- Suppression du cache memoire applicatif GET dans le client API.
- Suppression de la file de sync/retry offline applicative cote client.
- Suppression de la queue Background Sync IndexedDB dans le service worker.
- Suppression du runtime caching Workbox custom (retour a une configuration simplifiee).

### 2) Suppression IA Ads generative (hard removal)

- Suppression des services backend IA Ads generative:
  - ai-ad-creative.service.ts
  - ai-ad-placement.service.ts
  - ai-ad-publishing.service.ts
- Suppression des routes API IA Ads generative cote ads.
- Suppression des routes admin IA Studio / IA Ads.
- Suppression des methodes et types frontend admin relies a IA Ads/Studio.
- Suppression de la section IA Ads dans le dashboard admin.
- Suppression complete du composant SmartAdSlot et de tous ses usages.

### 3) Suppression de composants pseudo-IA UI

- Suppression de l'injection globale du popup IA dans le layout.
- Nettoyage de certains etats UI locaux trompeurs (favoris/local placeholders) sur pages publiques.

## Fichiers majeurs modifies

### Backend

- apps/api/src/modules/ads/ads.routes.ts
- apps/api/src/modules/admin/admin.routes.ts
- apps/api/src/index.ts

### Frontend

- apps/web/src/lib/api-core.ts
- apps/web/public/sw-push.js
- apps/web/vite.config.ts
- apps/web/src/components/PageLayout.tsx
- apps/web/src/lib/services/admin.service.ts
- apps/web/src/features/dashboards/AdminDashboard.tsx
- apps/web/src/features/dashboards/UserDashboard.tsx
- apps/web/src/features/dashboards/BusinessDashboard.tsx
- apps/web/src/features/home/HomePage.tsx
- apps/web/src/features/explorer/ExplorerPage.tsx
- apps/web/src/features/pricing/PricingPage.tsx
- apps/web/src/features/sokin/SoKinPage.tsx
- apps/web/src/features/public-pages/BusinessShopPage.tsx
- apps/web/src/features/public-pages/PublicProfilePage.tsx

### Supprimes

- apps/web/src/components/SmartAdSlot.tsx
- apps/api/src/modules/ads/ai-ad-creative.service.ts
- apps/api/src/modules/ads/ai-ad-placement.service.ts
- apps/api/src/modules/ads/ai-ad-publishing.service.ts

## Validation technique

Validation executee apres nettoyage:

- Build API: OK
- Build Web: OK
- Verification TypeScript fichiers modifies: OK
- Re-scan source (smartadslot, ia-studio, ia-ads, ai-ad-): plus d'occurrence dans apps/*/src

## Corrections techniques effectuees pendant validation

Pendant la validation finale, trois corrections de typage non bloquantes pour l'objectif metier ont ete appliquees pour restaurer un build web vert:

- Ajustement d'options SocketProvider pour compatibilite typing socket.io-client.
- Declaration module html5-qrcode dans le typing frontend.
- Correction de typing countryCode (MarketCountryCode) dans UserDashboard.

## Impact attendu

### Positif

- Reduction de complexite architecturale.
- Diminution du risque de comportement divergent entre client et serveur.
- Moins de surface de maintenance IA Ads generative.
- Pipeline build plus lisible pour la suite des modules V2.

### Risques residuels

- Certaines mentions marketing "IA Ads" peuvent rester dans des textes UI (non fonctionnel).
- Warnings Vite sur chunks volumineux et fichiers compresses emits en double a traiter dans une phase d'optimisation build.

## Decision

Nettoyage valide au 06/04/2026.
La brique IA Ads generative est retiree du runtime applicatif (backend + frontend source) et ne fait plus partie des flux actifs.
