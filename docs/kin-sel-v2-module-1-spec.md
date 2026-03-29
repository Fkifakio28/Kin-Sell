# Kin-Sel V2 - Module 1 Executable Spec

Ce document fige la premiere livraison technique:
- Auth
- Roles
- Seed super-admin securise
- Users
- Business accounts

## 1) Definition des roles
- visiteur: non authentifie
- utilisateur: compte standard
- entreprise: compte business
- admin: moderation
- super-admin: administration critique

Regle commerciale:
- utilisateur et entreprise peuvent acheter/vendre
- admin et super-admin ne peuvent pas acheter/vendre

## 2) Endpoints Module 1
Auth:
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me

Users:
- GET /users/me
- PATCH /users/me
- GET /users/:id/public

Business accounts:
- POST /business-accounts
- GET /business-accounts/me
- PATCH /business-accounts/me

## 3) Modele BD minimum Module 1
- users
- user_profiles
- business_accounts
- business_shops
- audit_logs

## 4) Conditions d acceptation
- Register/login fonctionnels avec mot de passe hash.
- Un super-admin est cree par seed securise (variables env, jamais hardcode).
- Les endpoints /me sont proteges par auth.
- Les endpoints publics ne retournent jamais email/telephone brut.
- Les roles admin/super-admin ne passent jamais par les flows achat/vente.

## 5) Seed super-admin securise
Variables attendues:
- SUPER_ADMIN_EMAIL
- SUPER_ADMIN_PASSWORD
- SUPER_ADMIN_DISPLAY_NAME

Comportement:
- cree le compte si absent
- met a jour role SUPER_ADMIN si compte existant
- journalise l action dans audit_logs
