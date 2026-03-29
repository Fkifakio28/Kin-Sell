# Kin-Sell V2

Plateforme de marchandage, commande et echange reconstruite sur une base neuve.

## Stack technique
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Base de donnees: PostgreSQL + Prisma

## Roles officiels
- visiteur: navigation publique sans connexion
- utilisateur: achat/vente et operations standard
- entreprise: espace business dedie (boutique + dashboard)
- admin: moderation et supervision
- super-admin: administration critique globale

Regles metier critiques:
- admin et super-admin ne peuvent pas acheter/vendre
- messagerie protegee sans partage numero/email
- devise prioritaire: CDF > USD > EUR
- aucune reprise des anciennes donnees utilisateurs
- super-admin cree via seed securise
- lancement prioritaire Kinshasa avec recherche/publication geolocalisee

## Documents de reference
- docs/kin-sel-v2-blueprint.md
- docs/kin-sel-v2-module-1-spec.md

## Dossiers
- apps/web: frontend
- apps/api: backend
- packages/db: schema Prisma

## Demarrage (une fois Node.js installe)
1. npm install
2. npm run dev

## Variables d environnement
Copier .env.example vers .env puis completer les valeurs.

## API Listings geolocalises
- `GET /listings/search`: recherche par texte/type/ville et, si `latitude` + `longitude` sont fournis, filtrage par rayon (`radiusKm`, 25 km par defaut) avec tri par distance.
- `POST /listings`: publication d'un produit ou service avec coordonnees (`latitude`, `longitude`) pour l'indexation locale.

Exemple recherche locale Kinshasa:
- `/listings/search?type=PRODUIT&latitude=-4.325&longitude=15.322&radiusKm=20`
