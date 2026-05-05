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

### SMTP (e-mail transactionnel)
La fonctionnalite "Mot de passe oublie" (et plus generalement les OTP par e-mail)
depend d un serveur SMTP valide. Si SMTP n est pas configure, l API renvoie
`503 Service email temporairement indisponible` sur
`POST /account/password-reset/request` et le frontend affiche le message tel quel
(aucune fausse promesse "email envoye").

Variables requises (voir `.env.example`) :

| Variable    | Role                                                             |
| ----------- | ---------------------------------------------------------------- |
| `SMTP_HOST` | Hote SMTP du fournisseur (ex : `smtp.example.com`)               |
| `SMTP_PORT` | `465` (SSL) ou `587` (STARTTLS)                                  |
| `SMTP_USER` | Boite authentifiable cote fournisseur (souvent le compte principal du domaine, pas un alias) |
| `SMTP_PASS` | Mot de passe de la boite SMTP                                    |
| `SMTP_FROM` | En-tete From affiche au destinataire (ex : `Kin-Sell <noreply@example.com>`) |

`SMTP_USER` et l adresse visible dans `SMTP_FROM` peuvent differer : la plupart
des fournisseurs (Hostinger, OVH, Gandi, etc.) refusent l auth SMTP sur un alias
et exigent l usage du compte principal pour l authentification, tout en autorisant
un From distinct (alias type `noreply@`).

## API Listings geolocalises
- `GET /listings/search`: recherche par texte/type/ville et, si `latitude` + `longitude` sont fournis, filtrage par rayon (`radiusKm`, 25 km par defaut) avec tri par distance.
- `POST /listings`: publication d'un produit ou service avec coordonnees (`latitude`, `longitude`) pour l'indexation locale.

Exemple recherche locale Kinshasa:
- `/listings/search?type=PRODUIT&latitude=-4.325&longitude=15.322&radiusKm=20`
