# Kin-Sel V2 - Blueprint Officiel

## 1) Vision et contraintes
Kin-Sel V2 est reconstruit a partir de zero avec une architecture propre, modulaire et maintenable.

Contraintes obligatoires:
- Roles: visiteur, utilisateur, entreprise, admin, super-admin.
- Espace entreprise distinct de l espace utilisateur.
- Boutique publique entreprise obligatoire.
- Dashboard entreprise obligatoire.
- Messagerie protegee (pas de marchandage libre, pas d echange numero/email, coordonnees cachees).
- Priorite devise: CDF > USD > EUR.
- Aucune reprise des anciennes donnees utilisateurs.
- Super-admin cree uniquement via seed securise.
- Kin-Sel Analytics prevu pour les entreprises (acces selon abonnement).

Hors scope V2 initial:
- Distinction client/prestataire.
- Audio/video en messagerie.

## 2) Schema global backend
Architecture modulaire par domaine, avec couches explicites.

```text
apps/api/src/
  modules/
    auth/
      routes/
      controllers/
      services/
      repositories/
      validators/
      dto/
    users/
    businesses/
    shops/
    listings/
    conversations/
    contacts/
    orders/
    appointments/
    reviews/
    subscriptions/
    boosts/
    ads/
    analytics/
    business-intelligence/
    admin/
    super-admin/
  shared/
    db/
    config/
    errors/
    middleware/
    auth/
    currency/
    logger/
    utils/
  seeds/
    super-admin/
```

Principes:
- Les routes ne contiennent pas la logique metier.
- Les services portent les regles metier.
- Les repositories portent les acces base.
- Les validators portent les regles d entree/sortie API.
- Le seed super-admin est isole et securise.

## 3) Schema global frontend
Separation stricte des espaces public, utilisateur, entreprise et admin.

```text
apps/web/src/
  app/
    router/
    providers/
    layouts/
  pages/
    public/
      home/
      explore/
      search/
      listing/
      shop/
      legal/
      about/
      faq/
      contact/
    auth/
      login/
      register/
      forgot-password/
    user/
      dashboard/
      profile/
      listings/
      orders/
      messages/
      appointments/
      reviews/
      settings/
      verification/
    business/
      dashboard/
      shop/
      products/
      services/
      orders/
      messages/
      appointments/
      reviews/
      subscription/
      boosts/
      ads/
      analytics/
      settings/
      verification/
    admin/
      dashboard/
      users/
      businesses/
      listings/
      orders/
      reports/
      reviews/
      subscriptions/
      ads/
      analytics/
      logs/
  components/
    common/
    forms/
    cards/
    navigation/
    modals/
    charts/
    pricing/
  features/
    auth/
    users/
    businesses/
    shops/
    listings/
    orders/
    messages/
    appointments/
    reviews/
    subscriptions/
    boosts/
    ads/
    analytics/
    admin/
  services/
    api/
    query/
  hooks/
  utils/
  constants/
  styles/
```

## 4) Schema de base de donnees (metier)
Tables coeur:
- users
- user_profiles
- business_accounts
- business_shops
- listings
- listing_images
- listing_categories
- listing_tags
- listing_prices
- orders
- appointments
- reviews
- reports

Messagerie/confidentialite:
- conversations
- conversation_participants
- messages
- contact_suggestions

Monetisation:
- subscription_plans
- user_subscriptions
- business_subscriptions
- boost_plans
- listing_boosts

Publicite:
- ad_campaigns
- ad_targeting_rules
- ad_placements
- ad_performance

Analytics/B2B:
- analytics_events
- analytics_access
- market_reports
- price_trends
- category_trends
- company_dashboard_snapshots
- ai_insights_cache

Admin:
- admin_actions
- audit_logs

## 5) Pages officielles a couvrir
Public:
- /
- /explore
- /search
- /listing/:slug
- /shop/:slug
- /auth/login
- /auth/register
- /about
- /how-it-works
- /usage-tips
- /terms
- /privacy
- /legal
- /faq
- /contact

Espace utilisateur:
- /u/dashboard
- /u/profile
- /u/listings
- /u/listings/new
- /u/orders
- /u/messages
- /u/appointments
- /u/reviews
- /u/settings
- /u/verification

Espace entreprise:
- /b/dashboard
- /b/shop
- /b/products
- /b/services
- /b/orders
- /b/messages
- /b/appointments
- /b/reviews
- /b/subscription
- /b/boosts
- /b/ads
- /b/analytics
- /b/settings
- /b/verification

Espace admin:
- /admin/dashboard
- /admin/users
- /admin/businesses
- /admin/listings
- /admin/orders
- /admin/reports
- /admin/reviews
- /admin/subscriptions
- /admin/ads
- /admin/analytics
- /admin/logs

## 6) Routes API minimales
Auth:
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/forgot-password
- POST /auth/reset-password
- GET /auth/me

Users:
- GET /users/me
- PATCH /users/me
- GET /users/:id/public

Business:
- POST /business-accounts
- GET /business-accounts/me
- PATCH /business-accounts/me
- GET /shops/:slug

Listings:
- POST /listings
- GET /listings
- GET /listings/:slug
- PATCH /listings/:id
- DELETE /listings/:id

Conversations:
- POST /conversations
- GET /conversations
- GET /conversations/:id
- POST /conversations/:id/messages

Orders:
- POST /orders
- GET /orders
- GET /orders/:id
- PATCH /orders/:id/status

Appointments:
- POST /appointments
- GET /appointments
- PATCH /appointments/:id

Reviews:
- POST /reviews
- GET /reviews/:entityId

Subscriptions:
- GET /subscriptions/plans
- POST /subscriptions/checkout
- GET /subscriptions/me

Boosts:
- GET /boosts/plans
- POST /boosts

Ads:
- POST /ads/campaigns
- GET /ads/campaigns
- GET /ads/performance/:id

Analytics:
- GET /analytics/dashboard
- GET /analytics/market
- GET /analytics/price-trends

Admin:
- GET /admin/users
- GET /admin/businesses
- PATCH /admin/users/:id/status
- PATCH /admin/businesses/:id/status
- GET /admin/reports
- POST /admin/reports/:id/resolve

## 7) Ordre de construction valide
Phase 1:
- Auth
- Roles
- Seed super-admin securise
- Users
- Business accounts

Phase 2:
- Shops
- Listings
- Search
- Pages publiques

Phase 3:
- Conversations protegees
- Orders
- Appointments
- Reviews

Phase 4:
- Subscriptions
- Boosts
- Ads

Phase 5:
- Analytics
- Admin
- Super-admin avance
- Pages legales

## 8) Regles de securite metier (a appliquer partout)
- Pas d exposition email/telephone en reponses API publiques.
- Filtrage de contenu message (numero, email, liens sensibles).
- Traces d administration en audit_logs.
- Verification des permissions par role sur chaque route.
- Application de la priorite devise CDF > USD > EUR dans les services prix, reporting et UI.
