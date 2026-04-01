# 🚀 Plan de Déploiement VPS — Kin-Sell

> Document de référence pour la mise en production de Kin-Sell sur un VPS.
> Chaque étape est détaillée, dans l'ordre exact d'exécution.

---

## Prérequis

| Élément | Minimum recommandé |
|---------|-------------------|
| **VPS** | Ubuntu 22.04/24.04 LTS, 2 vCPU, 4 Go RAM, 40 Go SSD |
| **Nom de domaine** | Ex: `kin-sell.com` (acheté chez Namecheap, OVH, Cloudflare, etc.) |
| **Accès SSH** | Clé SSH configurée (pas de mot de passe root) |
| **Fournisseur VPS** | Hetzner, Contabo, DigitalOcean, OVH, ou similaire |

---

## ÉTAPE 1 — Sécuriser le VPS

```bash
# 1.1 — Se connecter en SSH
ssh root@IP_DU_VPS

# 1.2 — Mettre à jour le système
apt update && apt upgrade -y

# 1.3 — Créer un utilisateur non-root
adduser kinsell
usermod -aG sudo kinsell

# 1.4 — Copier la clé SSH pour le nouvel utilisateur
mkdir -p /home/kinsell/.ssh
cp ~/.ssh/authorized_keys /home/kinsell/.ssh/
chown -R kinsell:kinsell /home/kinsell/.ssh
chmod 700 /home/kinsell/.ssh
chmod 600 /home/kinsell/.ssh/authorized_keys

# 1.5 — Désactiver la connexion root et mot de passe SSH
nano /etc/ssh/sshd_config
# → PermitRootLogin no
# → PasswordAuthentication no
systemctl restart sshd

# 1.6 — Configurer le pare-feu (UFW)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## ÉTAPE 2 — Installer les dépendances système

```bash
# Se reconnecter en tant que kinsell
ssh kinsell@IP_DU_VPS

# 2.1 — Installer Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier
node -v   # v20.x
npm -v    # 10.x

# 2.2 — Installer pnpm (gestionnaire utilisé dans le monorepo)
sudo npm install -g pnpm

# 2.3 — Installer PM2 (process manager pour Node.js)
sudo npm install -g pm2

# 2.4 — Installer Nginx
sudo apt install -y nginx

# 2.5 — Installer PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16

# 2.6 — Installer Git
sudo apt install -y git

# 2.7 — Installer Certbot pour SSL
sudo apt install -y certbot python3-certbot-nginx
```

---

## ÉTAPE 3 — Configurer PostgreSQL

```bash
# 3.1 — Se connecter à PostgreSQL
sudo -u postgres psql

# 3.2 — Créer la base de données et l'utilisateur
CREATE USER kinsell_user WITH PASSWORD 'MOT_DE_PASSE_FORT_ICI';
CREATE DATABASE kinsell_db OWNER kinsell_user;
GRANT ALL PRIVILEGES ON DATABASE kinsell_db TO kinsell_user;
\q

# 3.3 — Tester la connexion
psql -U kinsell_user -d kinsell_db -h localhost
# Entrer le mot de passe → si ça fonctionne, la DB est prête
\q
```

> **Note** : Le `DATABASE_URL` sera :
> `postgresql://kinsell_user:MOT_DE_PASSE_FORT_ICI@localhost:5432/kinsell_db`

---

## ÉTAPE 4 — Cloner et installer le projet

```bash
# 4.1 — Créer le dossier de l'application
sudo mkdir -p /var/www/kin-sell
sudo chown kinsell:kinsell /var/www/kin-sell

# 4.2 — Cloner le repo (depuis GitHub, GitLab, etc.)
cd /var/www/kin-sell
git clone https://github.com/VOTRE_COMPTE/kin-sell.git .

# OU transférer le code depuis votre machine locale :
# scp -r D:\Kin-Sell\* kinsell@IP_DU_VPS:/var/www/kin-sell/

# 4.3 — Installer les dépendances
pnpm install

# 4.4 — Générer le client Prisma
cd packages/db
pnpm run generate
cd ../..
```

---

## ÉTAPE 5 — Configurer les variables d'environnement

```bash
# 5.1 — Créer le fichier .env à la racine du projet
nano /var/www/kin-sell/.env
```

**Contenu du fichier `.env` :**

```env
# ═══════════════════════════════════════════════
# PRODUCTION — Kin-Sell
# ═══════════════════════════════════════════════

NODE_ENV=production

# ── Base de données ──
DATABASE_URL="postgresql://kinsell_user:MOT_DE_PASSE_FORT_ICI@localhost:5432/kinsell_db?sslmode=prefer"

# ── API ──
API_PORT=4000
CORS_ORIGIN="https://kin-sell.com"

# ── JWT / Auth (GÉNÉRER DES CLÉS FORTES) ──
JWT_SECRET="GÉNÉRER_AVEC: openssl rand -hex 32"
JWT_EXPIRES_IN="7d"
REFRESH_TOKEN_SECRET="GÉNÉRER_AVEC: openssl rand -hex 32"
REFRESH_TOKEN_EXPIRES_IN="30d"

# ── OTP ──
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60

# ── Super Admin ──
SUPER_ADMIN_EMAIL="votre-email@domain.com"
SUPER_ADMIN_PASSWORD="MotDePasseSuperAdmin2024!"
SUPER_ADMIN_DISPLAY_NAME="Admin Kin-Sell"

# ── Push Notifications (VAPID) ──
# Générer avec: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:contact@kin-sell.com"

# ── PayPal (REST API v2 — Mode Live) ──
PAYPAL_CLIENT_ID="VOTRE_CLIENT_ID_LIVE"
PAYPAL_CLIENT_SECRET="VOTRE_SECRET_LIVE"
PAYPAL_MERCHANT_EMAIL="filikifakio@gmail.com"
PAYPAL_MODE="live"
PAYPAL_RETURN_URL="https://kin-sell.com/forfaits?paid=1"
PAYPAL_CANCEL_URL="https://kin-sell.com/forfaits?cancelled=1"

# ── Orange Money (à configurer quand dispo) ──
# ORANGE_MONEY_CLIENT_ID=""
# ORANGE_MONEY_CLIENT_SECRET=""
# ORANGE_MONEY_MERCHANT_KEY=""
# ORANGE_MONEY_BASE_URL="https://api.orange.com/orange-money-webpay/PROD/v1"
# ORANGE_MONEY_RETURN_URL="https://kin-sell.com/payment/callback"
# ORANGE_MONEY_CANCEL_URL="https://kin-sell.com/payment/cancel"
# ORANGE_MONEY_NOTIF_URL="https://api.kin-sell.com/mobile-money/webhook/orange"

# ── M-Pesa (à configurer quand dispo) ──
# MPESA_API_KEY=""
# MPESA_PUBLIC_KEY=""
# MPESA_SERVICE_PROVIDER_CODE=""
# MPESA_BASE_URL="https://openapi.m-pesa.com/production/ipg/v2/vodacomDRC"
# MPESA_CALLBACK_URL="https://api.kin-sell.com/mobile-money/webhook/mpesa"

# ── Google Maps ──
GOOGLE_MAPS_API_KEY=""

# ── Frontend (sera injecté au build Vite) ──
VITE_API_URL="https://api.kin-sell.com"
```

```bash
# 5.2 — Générer les secrets JWT
openssl rand -hex 32
# Copier le résultat → remplacer JWT_SECRET dans .env

openssl rand -hex 32
# Copier le résultat → remplacer REFRESH_TOKEN_SECRET dans .env

# 5.3 — Générer les clés VAPID
npx web-push generate-vapid-keys
# Copier Public Key → VAPID_PUBLIC_KEY
# Copier Private Key → VAPID_PRIVATE_KEY
```

---

## ÉTAPE 6 — Migrer la base de données et seed

```bash
cd /var/www/kin-sell

# 6.1 — Exécuter toutes les migrations Prisma
npx prisma migrate deploy

# 6.2 — (Optionnel) Seed les données initiales
npx prisma db seed

# 6.3 — Vérifier la DB
npx prisma studio
# → Ouvrir dans un tunnel SSH si besoin pour vérifier les tables
```

---

## ÉTAPE 7 — Build de l'application

```bash
cd /var/www/kin-sell

# 7.1 — Build le frontend (React + Vite)
cd apps/web
VITE_API_URL="https://api.kin-sell.com" pnpm run build
# → Génère le dossier apps/web/dist/ avec les fichiers statiques

# 7.2 — Notifier les moteurs sur le sitemap index
SITE_URL="https://kin-sell.com" pnpm run notify:sitemaps
# → Utilise IndexNow si INDEXNOW_KEY est défini
# → Google: soumettre https://kin-sell.com/sitemap.xml dans Search Console
cd ../..

# 7.2 — Build le backend (TypeScript → JavaScript)
cd apps/api
pnpm run build
# → Génère apps/api/dist/
cd ../..
```

> **Important** : `VITE_API_URL` doit être défini AU MOMENT DU BUILD car Vite
> remplace `import.meta.env.VITE_API_URL` statiquement dans le bundle.

---

## ÉTAPE 8 — Configurer PM2 (Process Manager)

```bash
# 8.1 — Créer le fichier de configuration PM2
nano /var/www/kin-sell/ecosystem.config.js
```

**Contenu de `ecosystem.config.js` :**

```javascript
module.exports = {
  apps: [
    {
      name: "kin-sell-api",
      script: "./apps/api/dist/index.js",
      cwd: "/var/www/kin-sell",
      instances: "max",           // Utiliser tous les CPU
      exec_mode: "cluster",       // Mode cluster pour performance
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/www/kin-sell/logs/api-error.log",
      out_file: "/var/www/kin-sell/logs/api-out.log",
      merge_logs: true,
    },
  ],
};
```

```bash
# 8.2 — Créer le dossier de logs
mkdir -p /var/www/kin-sell/logs

# 8.3 — Créer le dossier pour les uploads
mkdir -p /var/www/kin-sell/uploads

# 8.4 — Démarrer l'API avec PM2
cd /var/www/kin-sell
pm2 start ecosystem.config.js

# 8.5 — Vérifier que l'API tourne
pm2 status
pm2 logs kin-sell-api --lines 20

# 8.6 — Tester l'API localement
curl http://localhost:4000/health

# 8.7 — Sauvegarder la config PM2 pour le redémarrage auto
pm2 save
pm2 startup
# → Suivre les instructions affichées (sudo env PATH=...)
```

> **⚠️ Note WebSocket** : Si vous utilisez le mode cluster (`instances: "max"`),
> Socket.IO nécessite un adaptateur Redis pour la synchronisation entre workers.
> Pour un premier déploiement, vous pouvez utiliser `instances: 1` pour éviter ce problème.
> Passez à cluster + Redis quand le trafic augmente.

---

## ÉTAPE 9 — Configurer Nginx (Reverse Proxy + Fichiers statiques)

### 9.1 — Configuration DNS

Chez votre registrar DNS (Cloudflare, Namecheap, etc.) :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | `@` (kin-sell.com) | IP_DU_VPS | 3600 |
| A | `api` (api.kin-sell.com) | IP_DU_VPS | 3600 |
| A | `www` | IP_DU_VPS | 3600 |
| CNAME | `www` | `kin-sell.com` | 3600 |

### 9.2 — Créer la config Nginx pour le frontend

```bash
sudo nano /etc/nginx/sites-available/kin-sell.com
```

```nginx
# ═══════════════════════════════════════════
# Frontend — kin-sell.com
# ═══════════════════════════════════════════
server {
    listen 80;
    server_name kin-sell.com www.kin-sell.com;

    root /var/www/kin-sell/apps/web/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # Cache statique (fichiers Vite hashés)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service Worker — pas de cache
    location /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Fichiers uploadés
    location /uploads/ {
        alias /var/www/kin-sell/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Proxy API (pour les appels /api/*)
    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:4000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    # SPA — Toutes les routes non-fichiers → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Limiter la taille des uploads
    client_max_body_size 60M;
}
```

### 9.3 — (Optionnel) Config séparée pour api.kin-sell.com

```bash
sudo nano /etc/nginx/sites-available/api.kin-sell.com
```

```nginx
# ═══════════════════════════════════════════
# API — api.kin-sell.com
# ═══════════════════════════════════════════
server {
    listen 80;
    server_name api.kin-sell.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Uploads
    location /uploads/ {
        alias /var/www/kin-sell/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    client_max_body_size 60M;
}
```

### 9.4 — Activer les sites et tester

```bash
# Activer les configs
sudo ln -s /etc/nginx/sites-available/kin-sell.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.kin-sell.com /etc/nginx/sites-enabled/

# Supprimer le site par défaut
sudo rm /etc/nginx/sites-enabled/default

# Tester la config
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## ÉTAPE 10 — SSL/HTTPS avec Let's Encrypt

```bash
# 10.1 — Obtenir les certificats SSL
sudo certbot --nginx -d kin-sell.com -d www.kin-sell.com -d api.kin-sell.com

# → Suivre les instructions (email, accepter les conditions)
# → Certbot modifie automatiquement la config Nginx pour HTTPS

# 10.2 — Vérifier le renouvellement auto
sudo certbot renew --dry-run

# 10.3 — Vérifier HTTPS
curl -I https://kin-sell.com
curl -I https://api.kin-sell.com/health
```

> Certbot ajoute automatiquement :
> - Redirection HTTP → HTTPS
> - Certificats SSL dans /etc/letsencrypt/
> - Renouvellement automatique via un timer systemd

---

## ÉTAPE 11 — Corrections critiques avant ouverture

### 11.1 — Corriger les fallbacks localhost dans le frontend

Les fichiers suivants ont un fallback `http://localhost:4000` :

| Fichier | Correction |
|---------|-----------|
| `apps/web/src/hooks/useSocket.ts` | Remplacer fallback par `""` ou utiliser `VITE_API_URL` |
| `apps/web/src/app/providers/GlobalNotificationProvider.tsx` | Même correction |

**Ils seront automatiquement corrects si `VITE_API_URL` est défini au build** (étape 7).
Mais par sécurité, les fallbacks devraient être `""` en production.

### 11.2 — Vérifier que le fichier .env contient tous les secrets

```bash
# Checklist de vérification
grep JWT_SECRET /var/www/kin-sell/.env
grep REFRESH_TOKEN_SECRET /var/www/kin-sell/.env
grep CORS_ORIGIN /var/www/kin-sell/.env
grep PAYPAL_RETURN_URL /var/www/kin-sell/.env
```

### 11.3 — Protéger le fichier .env

```bash
chmod 600 /var/www/kin-sell/.env
```

---

## ÉTAPE 12 — Test complet de production

```bash
# 12.1 — Vérifier l'API
curl https://api.kin-sell.com/health
# Doit retourner: {"status":"ok"}

# 12.2 — Vérifier le frontend
# Ouvrir https://kin-sell.com dans un navigateur
# → Vérifier que la page charge
# → Vérifier que le glassmorphism s'affiche
# → Tester l'inscription / connexion

# 12.3 — Vérifier les WebSockets
# → Se connecter avec 2 comptes
# → Envoyer un message → doit arriver en temps réel

# 12.4 — Vérifier PayPal
# → Aller sur /forfaits
# → Sélectionner un plan → PayPal
# → PayPal redirige vers kin-sell.com/forfaits?paid=1
# → Vérifier la capture du paiement

# 12.5 — Vérifier les uploads
# → Uploader une photo de profil
# → Vérifier qu'elle s'affiche

# 12.6 — Tester sur mobile
# → Ouvrir kin-sell.com sur téléphone
# → Vérifier le responsive + la navigation
# → Tester la rotation sur un live
```

---

## ÉTAPE 13 — Monitoring et maintenance

```bash
# 13.1 — Surveiller les processus
pm2 monit
# ou
pm2 status

# 13.2 — Voir les logs en temps réel
pm2 logs kin-sell-api

# 13.3 — Redémarrer l'API après un changement
pm2 restart kin-sell-api

# 13.4 — Mettre à jour le code (procédure de déploiement)
cd /var/www/kin-sell
git pull origin main
pnpm install
cd packages/db && pnpm run generate && cd ../..
npx prisma migrate deploy
cd apps/web && VITE_API_URL="https://api.kin-sell.com" pnpm run build && cd ../..
cd apps/api && pnpm run build && cd ../..
pm2 restart kin-sell-api

# 13.5 — Sauvegardes automatiques de la base de données
# Créer un script de backup
sudo nano /var/www/kin-sell/scripts/backup-db.sh
```

**Script de backup :**

```bash
#!/bin/bash
BACKUP_DIR="/var/www/kin-sell/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U kinsell_user -h localhost kinsell_db | gzip > "$BACKUP_DIR/kinsell_db_$TIMESTAMP.sql.gz"

# Garder seulement les 7 derniers
ls -t $BACKUP_DIR/kinsell_db_*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null

echo "Backup créé: kinsell_db_$TIMESTAMP.sql.gz"
```

```bash
# Rendre exécutable
chmod +x /var/www/kin-sell/scripts/backup-db.sh

# Ajouter au cron (backup quotidien à 3h du matin)
crontab -e
# Ajouter la ligne :
# 0 3 * * * /var/www/kin-sell/scripts/backup-db.sh >> /var/www/kin-sell/logs/backup.log 2>&1
```

---

## ÉTAPE 14 — Configuration PayPal pour la production

1. Aller sur [developer.paypal.com](https://developer.paypal.com)
2. **My Apps & Credentials** → App Live
3. Mettre à jour les **Return URLs** :
   - Return URL : `https://kin-sell.com/forfaits?paid=1`
   - Cancel URL : `https://kin-sell.com/forfaits?cancelled=1`
4. Vérifier que le Client ID et Secret dans `.env` sont ceux du **mode LIVE** (pas sandbox)

---

## ÉTAPE 15 — Fonctionnalités à implémenter post-lancement

> Ces éléments ne sont **pas bloquants** pour un lancement initial mais **recommandés** :

| Priorité | Fonctionnalité | Détail |
|----------|---------------|--------|
| 🔴 Haute | **CAPTCHA** | Ajouter Cloudflare Turnstile ou reCAPTCHA v3 sur /auth/register et /auth/login |
| 🔴 Haute | **Email transactionnel** | SendGrid ou AWS SES pour OTP, confirmations, notifications |
| 🟠 Moyenne | **OAuth (Google/Facebook/Apple)** | Connexion sociale — nécessite les clés API des providers |
| 🟠 Moyenne | **CDN / S3 pour uploads** | Migrer uploads vers Cloudflare R2, AWS S3, ou similaire |
| 🟡 Basse | **Redis** | Pour sessions, cache, et adaptateur Socket.IO en cluster |
| 🟡 Basse | **CI/CD** | GitHub Actions pour build/test/deploy automatique |

---

## Résumé — Checklist de déploiement

- [ ] VPS Ubuntu provisionné et sécurisé
- [ ] Node.js 20 + pnpm + PM2 installés
- [ ] PostgreSQL 16 installé et base créée
- [ ] Nginx installé
- [ ] Code transféré sur le VPS
- [ ] Dépendances installées (`pnpm install`)
- [ ] Fichier `.env` configuré avec TOUS les secrets
- [ ] Migrations Prisma exécutées
- [ ] Frontend build avec `VITE_API_URL`
- [ ] Backend build
- [ ] PM2 démarré et configuré au boot
- [ ] Nginx configuré (reverse proxy + static files)
- [ ] DNS configuré (A records → IP VPS)
- [ ] SSL/HTTPS via Certbot
- [ ] PayPal Return URLs mises à jour
- [ ] Tests complets effectués
- [ ] Backup DB automatique configuré
- [ ] Monitoring PM2 en place
