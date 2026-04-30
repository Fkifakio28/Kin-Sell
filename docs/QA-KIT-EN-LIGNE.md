# Kit QA en ligne — Kin-Sell
> Date: 18 avril 2026  
> Environnement: **PRODUCTION**  
> Front: `https://kin-sell.com`  
> API: `https://api.kin-sell.com`  
> PayPal: **MODE LIVE** ⚠️ — Aucun paiement réel autorisé en QA

---

## 1. Comptes QA à créer

| Rôle | Email (temporaire) | Mot de passe | accountType | Objectif |
|------|-------------------|--------------|-------------|----------|
| Buyer | `qa-buyer-2026@yopmail.com` | `QaBuyer!2026#Ks` | `USER` | Tester achat, panier, coupons |
| Business | `qa-business-2026@yopmail.com` | `QaBiz!2026#Ks` | `BUSINESS` | Tester boutique, listings, commandes vendeur |
| Admin (existant) | — | — | — | Utiliser le super-admin existant pour tests admin |

### Création via API

**Buyer :**
```bash
curl -X POST https://api.kin-sell.com/account/entry \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "qa-buyer-2026@yopmail.com",
    "password": "QaBuyer!2026#Ks",
    "displayName": "QA Buyer",
    "accountType": "USER"
  }'
```

**Business :**
```bash
curl -X POST https://api.kin-sell.com/account/entry \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "qa-business-2026@yopmail.com",
    "password": "QaBiz!2026#Ks",
    "displayName": "QA Business",
    "accountType": "BUSINESS"
  }'
```

> Stocker les tokens retournés :  
> `ACCESS_TOKEN` = réponse `.accessToken`  
> `REFRESH_TOKEN` = réponse `.refreshToken`

### Compléter le profil (obligatoire pour certaines actions)

```bash
curl -X PATCH https://api.kin-sell.com/account/profile/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "username": "qa-buyer-test",
    "country": "CD",
    "city": "Kinshasa"
  }'
```

---

## 2. Données Shop à créer (compte Business)

### 2.1 Créer le Business Account

```bash
curl -X POST https://api.kin-sell.com/business-accounts/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{
    "legalName": "QA Test SARL",
    "publicName": "QA Shop Test",
    "description": "Boutique de test QA — à supprimer après campagne",
    "city": "Kinshasa",
    "country": "CD",
    "countryCode": "CD"
  }'
```

### 2.2 Créer un Listing test (produit)

```bash
curl -X POST https://api.kin-sell.com/listings/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{
    "type": "PRODUIT",
    "title": "Produit QA Test",
    "description": "Produit de test qualité — ne pas acheter",
    "category": "Électronique",
    "city": "Kinshasa",
    "country": "CD",
    "latitude": -4.3250,
    "longitude": 15.3222,
    "priceUsdCents": 500,
    "stockQuantity": 10
  }'
```

> Stocker `LISTING_ID` = réponse `.id`

### 2.3 Créer un Listing test (service)

```bash
curl -X POST https://api.kin-sell.com/listings/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{
    "type": "SERVICE",
    "title": "Service QA Test",
    "description": "Service de test — ne pas commander",
    "category": "Services",
    "city": "Kinshasa",
    "country": "CD",
    "latitude": -4.3250,
    "longitude": 15.3222,
    "priceUsdCents": 1000,
    "serviceDurationMin": 60
  }'
```

---

## 3. URLs à vérifier manuellement

| Page | URL | Résultat attendu |
|------|-----|-------------------|
| Accueil | `https://kin-sell.com/` | Page d'accueil chargée, menu visible |
| Explorer | `https://kin-sell.com/explorer` | Carte + listings visibles |
| Shop public | `https://kin-sell.com/shop/qa-shop-test` | Page boutique avec listing(s) |
| Forfaits | `https://kin-sell.com/forfaits` | Plans USER + BUSINESS affichés |
| Login | `https://kin-sell.com/login` | Formulaire de connexion |
| Register | `https://kin-sell.com/register` | Formulaire d'inscription |
| SoKin | `https://kin-sell.com/sokin` | Feed social |
| Blog | `https://kin-sell.com/blog` | Articles de blog |
| FAQ | `https://kin-sell.com/faq` | Page FAQ |

---

## 4. Scénarios de test pas-à-pas

### Scénario A — Accès Shop + Navigation

| # | Précondition | Action | Résultat attendu |
|---|-------------|--------|-------------------|
| A1 | — | Ouvrir `https://kin-sell.com/explorer` | Page chargée, carte affichée, listings visibles |
| A2 | — | Rechercher "QA" dans la barre de recherche | Listing "Produit QA Test" apparaît |
| A3 | — | Cliquer sur le listing | Page détail chargée avec titre, prix ($5.00), description |
| A4 | — | Ouvrir `https://kin-sell.com/shop/qa-shop-test` | Page boutique avec logo, nom "QA Shop Test", listing(s) |
| A5 | — | Cliquer "Voir tout" sur la boutique | Liste complète des produits |

### Scénario B — Achat Marketplace (panier → checkout → statut)

| # | Précondition | Action | Résultat attendu |
|---|-------------|--------|-------------------|
| B1 | Connecté comme `qa-buyer` | Ajouter "Produit QA Test" au panier | Toast "Ajouté au panier", badge panier +1 |
| B2 | Panier non vide | Ouvrir le panier | Listing affiché avec prix $5.00, quantité 1 |
| B3 | Panier non vide | Cliquer "Commander" | Formulaire checkout (adresse livraison) |
| B4 | Formulaire rempli | Valider le checkout | Commande créée, statut PENDING |
| B5 | Commande créée | Vérifier dans "Mes commandes" | Commande visible avec statut PENDING |
| B6 | Connecté comme `qa-business` | Vérifier dans "Commandes vendeur" | Commande reçue visible |
| B7 | Vendeur | Changer statut → CONFIRMED | Statut mis à jour côté buyer aussi |
| B8 | Vendeur | Changer statut → SHIPPED | Buyer notifié |
| B9 | Buyer | Confirmer réception avec code de validation | Commande DELIVERED |

**Via API (B1-B5) :**

```bash
# B1 — Ajouter au panier
curl -X POST https://api.kin-sell.com/orders/buyer/cart/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"listingId": "'$LISTING_ID'"}'

# B2 — Voir le panier
curl https://api.kin-sell.com/orders/buyer/cart \
  -H "Authorization: Bearer $BUYER_TOKEN"

# B4 — Checkout
curl -X POST https://api.kin-sell.com/orders/buyer/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{
    "deliveryAddress": "123 Av. QA Test",
    "deliveryCity": "Kinshasa",
    "deliveryCountry": "CD"
  }'

# B5 — Mes commandes
curl https://api.kin-sell.com/orders/buyer/orders \
  -H "Authorization: Bearer $BUYER_TOKEN"
```

### Scénario C — Forfait PayPal (⚠️ MODE LIVE — pas de paiement réel)

> **ATTENTION** : PayPal est en mode LIVE. On ne teste QUE les étapes avant paiement.

| # | Précondition | Action | Résultat attendu |
|---|-------------|--------|-------------------|
| C1 | Connecté | Ouvrir `https://kin-sell.com/forfaits` | Plans affichés : FREE, BOOST ($6), AUTO ($12), PRO VENDEUR ($20) |
| C2 | Connecté | Cliquer "Souscrire" sur plan BOOST | Scroll vers section paiement |
| C3 | Section paiement | Voir le récapitulatif | Plan BOOST, prix $6/mois affiché |
| C4 | — | Vérifier plan actuel via API | `planCode: "FREE"` (ou `"NONE"`) |
| C5 | — | **NE PAS** cliquer sur le bouton PayPal | — |

**Via API (C4) :**

```bash
# Vérifier plan actuel
curl https://api.kin-sell.com/billing/my-plan \
  -H "Authorization: Bearer $BUYER_TOKEN"

# Catalogue complet
curl https://api.kin-sell.com/billing/catalog
```

### Scénario D — Coupon Preview + Apply

| # | Précondition | Action | Résultat attendu |
|---|-------------|--------|-------------------|
| D1 | Connecté | Ouvrir `/forfaits` | Input "Code promo" visible |
| D2 | — | Saisir un code invalide "FAKE123" → Vérifier | Message erreur : "Coupon invalide" ou "Code non trouvé" |
| D3 | Super-admin | Créer un coupon QA via admin API (voir ci-dessous) | Coupon créé, code retourné |
| D4 | Buyer + code QA | Saisir le code QA dans `/forfaits` → Vérifier | Prix réduit affiché : prix original - discount |
| D5 | Buyer + code QA | Preview via API | `{ valid: true, discountPercent, finalAmountUsdCents }` |

**Création coupon QA (super-admin) :**

```bash
curl -X POST https://api.kin-sell.com/incentives/admin/coupons \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "kind": "PLAN_DISCOUNT",
    "discountPercent": 50,
    "targetScope": "PLAN",
    "targetPlanCodes": ["BOOST", "AUTO"],
    "maxUses": 5,
    "maxUsesPerUser": 1,
    "expiresAt": "2026-04-25T23:59:59.000Z",
    "segment": "STANDARD",
    "metadata": {"qaTest": true, "campaign": "QA-2026-04-18"}
  }'
```
> Stocker `COUPON_CODE` = réponse `.code`

**Preview coupon :**

```bash
curl -X POST https://api.kin-sell.com/incentives/coupons/preview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{
    "code": "'$COUPON_CODE'",
    "originalAmountUsdCents": 600,
    "planCode": "BOOST"
  }'
```

**Validate coupon :**

```bash
curl -X POST https://api.kin-sell.com/incentives/coupons/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{
    "code": "'$COUPON_CODE'",
    "planCode": "BOOST"
  }'
```

### Scénario E — Tests d'erreurs coupons

| # | Action | Résultat attendu |
|---|--------|-------------------|
| E1 | Preview avec code inexistant `"NOPE"` | `400` ou `404` — "Coupon not found" |
| E2 | Preview avec coupon expiré (créer un coupon expiré au passé) | `400` — "Coupon expired" |
| E3 | Utiliser 2× le même coupon (maxUsesPerUser=1) | 2ᵉ tentative rejetée — "Already used" |
| E4 | Coupon ciblé BOOST utilisé sur plan SCALE | `400` — "Coupon not valid for this plan" |
| E5 | Révoquer un coupon (admin) puis preview | `400` — "Coupon revoked/inactive" |

---

## 5. Checklist de validation finale

| # | Test | Pass | Fail | Notes |
|---|------|------|------|-------|
| 1 | Page d'accueil charge < 3s | ☐ | ☐ | |
| 2 | Explorer affiche carte + listings | ☐ | ☐ | |
| 3 | Recherche retourne résultats pertinents | ☐ | ☐ | |
| 4 | Inscription buyer fonctionne | ☐ | ☐ | |
| 5 | Inscription business fonctionne | ☐ | ☐ | |
| 6 | Login email fonctionne | ☐ | ☐ | |
| 7 | Profil complet après inscription | ☐ | ☐ | |
| 8 | Création business account | ☐ | ☐ | |
| 9 | Page boutique publique accessible | ☐ | ☐ | |
| 10 | Création listing produit | ☐ | ☐ | |
| 11 | Création listing service | ☐ | ☐ | |
| 12 | Ajout au panier | ☐ | ☐ | |
| 13 | Checkout commande | ☐ | ☐ | |
| 14 | Commande visible buyer | ☐ | ☐ | |
| 15 | Commande visible vendeur | ☐ | ☐ | |
| 16 | Changement statut commande | ☐ | ☐ | |
| 17 | Page forfaits affiche plans corrects | ☐ | ☐ | |
| 18 | Scroll vers paiement au clic "Souscrire" | ☐ | ☐ | |
| 19 | Input code promo visible sur /forfaits | ☐ | ☐ | |
| 20 | Preview coupon valide → prix réduit affiché | ☐ | ☐ | |
| 21 | Coupon invalide → message erreur clair | ☐ | ☐ | |
| 22 | Coupon expiré → rejet | ☐ | ☐ | |
| 23 | Double utilisation coupon → rejet | ☐ | ☐ | |
| 24 | Admin : création coupon | ☐ | ☐ | |
| 25 | Admin : révocation coupon | ☐ | ☐ | |
| 26 | Admin : liste coupons + pagination | ☐ | ☐ | |
| 27 | Admin : liste redemptions | ☐ | ☐ | |
| 28 | Mobile : pages responsive | ☐ | ☐ | |
| 29 | Dark mode par défaut | ☐ | ☐ | |
| 30 | SMTP fonctionne (email reçu) | ☐ | ☐ | |

---

## 6. Plan de nettoyage post-campagne

### 6.1 Révoquer les coupons QA

```bash
# Lister les coupons QA
curl "https://api.kin-sell.com/incentives/admin/coupons?status=ACTIVE&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Révoquer chaque coupon QA
curl -X POST https://api.kin-sell.com/incentives/admin/coupons/$COUPON_ID/revoke \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 6.2 Désactiver/archiver les listings QA

```bash
curl -X PATCH https://api.kin-sell.com/listings/$LISTING_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{"status": "DELETED"}'
```

### 6.3 Supprimer les comptes QA

```bash
# Depuis chaque compte QA :
curl -X POST https://api.kin-sell.com/account/deletion-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reason": "Compte QA test — nettoyage post-campagne"}'
```

### 6.4 Checklist nettoyage

| Élément | Action | Fait |
|---------|--------|------|
| Coupons QA | Révoqués via admin API | ☐ |
| Listings QA | Status → DELETED | ☐ |
| Commandes QA | Annulées (status → CANCELED) | ☐ |
| Compte buyer QA | Demande de suppression | ☐ |
| Compte business QA | Demande de suppression | ☐ |
| Business account QA | Supprimé avec le compte | ☐ |
| Grants QA | Expiration naturelle (pas d'action) | ☐ |

---

## 7. Collection cURL complète

### Variables à configurer

```bash
export BASE_URL="https://api.kin-sell.com"
export BUYER_EMAIL="qa-buyer-2026@yopmail.com"
export BUYER_PASS="QaBuyer!2026#Ks"
export BIZ_EMAIL="qa-business-2026@yopmail.com"
export BIZ_PASS="QaBiz!2026#Ks"
```

### 7.1 Login

```bash
# Login Buyer
curl -s -X POST $BASE_URL/account/entry \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "'$BUYER_EMAIL'",
    "password": "'$BUYER_PASS'"
  }' | jq '.accessToken'
# → export BUYER_TOKEN="..."

# Login Business
curl -s -X POST $BASE_URL/account/entry \
  -H "Content-Type: application/json" \
  -d '{
    "method": "email",
    "email": "'$BIZ_EMAIL'",
    "password": "'$BIZ_PASS'"
  }' | jq '.accessToken'
# → export BIZ_TOKEN="..."
```

### 7.2 Créer Business Account + Shop

```bash
curl -s -X POST $BASE_URL/business-accounts/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{
    "legalName": "QA Test SARL",
    "publicName": "QA Shop Test",
    "description": "Boutique QA test",
    "city": "Kinshasa",
    "country": "CD",
    "countryCode": "CD"
  }' | jq '.slug'
# → export SHOP_SLUG="..."
```

### 7.3 Créer Listing

```bash
curl -s -X POST $BASE_URL/listings/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{
    "type": "PRODUIT",
    "title": "Produit QA Test",
    "description": "Produit test — à supprimer",
    "category": "Électronique",
    "city": "Kinshasa",
    "country": "CD",
    "latitude": -4.3250,
    "longitude": 15.3222,
    "priceUsdCents": 500,
    "stockQuantity": 10
  }' | jq '.id'
# → export LISTING_ID="..."
```

### 7.4 Panier + Checkout

```bash
# Ajouter au panier
curl -s -X POST $BASE_URL/orders/buyer/cart/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"listingId": "'$LISTING_ID'"}'

# Voir panier
curl -s $BASE_URL/orders/buyer/cart \
  -H "Authorization: Bearer $BUYER_TOKEN" | jq .

# Checkout
curl -s -X POST $BASE_URL/orders/buyer/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{
    "deliveryAddress": "123 Av. QA",
    "deliveryCity": "Kinshasa",
    "deliveryCountry": "CD"
  }' | jq '.id'
# → export ORDER_ID="..."
```

### 7.5 Preview Coupon + Forfait

```bash
# Vérifier plan actuel
curl -s $BASE_URL/billing/my-plan \
  -H "Authorization: Bearer $BUYER_TOKEN" | jq .

# Catalogue plans
curl -s $BASE_URL/billing/catalog | jq .

# Preview coupon (si code disponible)
curl -s -X POST $BASE_URL/incentives/coupons/preview \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{
    "code": "'$COUPON_CODE'",
    "originalAmountUsdCents": 600,
    "planCode": "BOOST"
  }' | jq .

# Valider coupon
curl -s -X POST $BASE_URL/incentives/coupons/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"code": "'$COUPON_CODE'", "planCode": "BOOST"}' | jq .
```

### 7.6 Vérifications

```bash
# Mes commandes (buyer)
curl -s "$BASE_URL/orders/buyer/orders?page=1&limit=10" \
  -H "Authorization: Bearer $BUYER_TOKEN" | jq '.data[] | {id, status, totalUsdCents}'

# Commandes vendeur (business)
curl -s "$BASE_URL/orders/seller/orders?page=1&limit=10" \
  -H "Authorization: Bearer $BIZ_TOKEN" | jq '.data[] | {id, status}'

# Payment orders
curl -s $BASE_URL/billing/payment-orders \
  -H "Authorization: Bearer $BUYER_TOKEN" | jq .

# Mon profil
curl -s $BASE_URL/account/me \
  -H "Authorization: Bearer $BUYER_TOKEN" | jq '{id, email, role, username}'

# Explorer stats
curl -s $BASE_URL/explorer/stats | jq .

# Shops publics
curl -s "$BASE_URL/explorer/shops?city=Kinshasa&limit=5" | jq .
```

### 7.7 Cleanup

```bash
# Supprimer listing
curl -s -X PATCH $BASE_URL/listings/$LISTING_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{"status": "DELETED"}'

# Annuler commande
curl -s -X PATCH $BASE_URL/orders/$ORDER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"status": "CANCELED"}'

# Révoquer coupons QA (admin)
# curl -X POST $BASE_URL/incentives/admin/coupons/$COUPON_ID/revoke \
#   -H "Authorization: Bearer $ADMIN_TOKEN"

# Demande suppression comptes
curl -s -X POST $BASE_URL/account/deletion-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -d '{"reason": "Compte QA — nettoyage"}'

curl -s -X POST $BASE_URL/account/deletion-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BIZ_TOKEN" \
  -d '{"reason": "Compte QA — nettoyage"}'
```

---

## 8. Template Audit Go/No-Go

### Verdict global
> **[ GO / NO-GO ]** — Date: ________

### Bugs classés

| # | Sévérité | Description | Scénario | Endpoint | Statut |
|---|----------|-------------|----------|----------|--------|
| 1 | P0 | | | | |
| 2 | P1 | | | | |
| 3 | P2 | | | | |

### Risques business

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| Paiement réel accidentel (PayPal LIVE) | Moyenne | Critique | NE JAMAIS cliquer bouton PayPal en QA |
| Fraude coupon (code bruteforce) | Faible | Moyen | Rate limit + codes aléatoires longs |
| Régression checkout | Faible | Critique | Tests B1-B9 couvrent le parcours complet |
| Données QA résiduelles en prod | Moyenne | Faible | Plan de nettoyage section 6 |

### Correctifs prioritaires

| # | Fix | Priorité | Assigné | ETA |
|---|-----|----------|---------|-----|
| 1 | | P0 | | |

### Plan de retest
1. Corriger bugs P0
2. Redéployer
3. Re-exécuter scénarios A-E
4. Valider checklist section 5
5. Nettoyage section 6

### Checklist nettoyage post-audit

- [ ] Coupons QA révoqués
- [ ] Listings QA supprimés (DELETED)
- [ ] Commandes QA annulées (CANCELED)
- [ ] Comptes QA demande suppression
- [ ] Grants QA (expiration naturelle)
- [ ] Vérification : aucune trace QA dans explorer/recherche
