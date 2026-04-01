#!/bin/bash
# ──────────────────────────────────────────────────────
# Kin-Sell — Guide de déploiement VPS
# Scalable 1000 → 2000 → 5000 → 10000+ utilisateurs
# ──────────────────────────────────────────────────────

echo "=== Kin-Sell — Déploiement Production ==="

# ── 1. Prérequis sur le VPS ──
# sudo apt update && sudo apt upgrade -y
# sudo apt install -y nginx certbot python3-certbot-nginx
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
# sudo apt install -y nodejs
# sudo npm install -g pm2 tsx

# ── 2. Cloner le projet ──
# cd /var/www
# git clone <repo-url> kin-sell
# cd kin-sell

# ── 3. Variables d'environnement ──
# cp .env.example .env
# nano .env  ← Modifier :
#   NODE_ENV=production
#   CORS_ORIGIN=https://votre-domaine.com
#   DATABASE_URL="postgresql://user:pass@localhost:5432/kinsell?schema=public&connection_limit=20&pool_timeout=30"
#   JWT_SECRET=<secret-fort-32-chars>
#   REFRESH_TOKEN_SECRET=<autre-secret-fort-32-chars>

# ── 4. Installer + Build ──
# npm ci
# npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
# npx prisma generate --schema=packages/db/prisma/schema.prisma
# cd apps/web && npm run build

# ── 5. Démarrer avec PM2 ──
# cd /var/www/kin-sell
# pm2 start ecosystem.config.cjs
# pm2 save
# pm2 startup  ← pour redémarrage auto au reboot

# ── 6. Nginx ──
# sudo cp deploy/nginx.conf /etc/nginx/sites-available/kin-sell
# sudo ln -s /etc/nginx/sites-available/kin-sell /etc/nginx/sites-enabled/
# sudo nginx -t && sudo systemctl reload nginx

# ── 7. SSL (Let's Encrypt) ──
# sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com

# ──────────────────────────────────────────────────────
# SCALING GUIDE (1000 → 2000 → 5000 → 10K)
# ──────────────────────────────────────────────────────
#
# ╔══════════════╦══════════════════════════════════════════╗
# ║  1000 users  ║  PM2: 2 instances, PG pool: 20          ║
# ║  2000 users  ║  pm2 scale kinsell-api 4, pool: 30      ║
# ║  5000 users  ║  pm2 scale kinsell-api 6, pool: 50      ║
# ║              ║  + ajout Redis pour cache + sessions     ║
# ║  10K+ users  ║  pm2 scale kinsell-api 8, pool: 80      ║
# ║              ║  + PgBouncer, Redis, CDN (Cloudflare)    ║
# ║  50K+ users  ║  Multi-VPS, Load Balancer, Redis cluster ║
# ║ 100K+ users  ║  Kubernetes / Docker Swarm               ║
# ╚══════════════╩══════════════════════════════════════════╝
#
# Commandes de scaling :
#   pm2 scale kinsell-api +2          ← ajouter 2 workers
#   pm2 scale kinsell-api 6           ← fixer à 6 workers
#
# DB connection pool (dans .env, modifier DATABASE_URL) :
#   &connection_limit=20  → début (1K users)
#   &connection_limit=50  → intermédiaire (5K users)
#   &connection_limit=80  → avancé (10K+ users)
#
# Monitoring :
#   pm2 monit                         ← CPU/RAM temps réel
#   pm2 logs                          ← logs en direct
#   pm2 status                        ← état des instances

echo "=== Déploiement terminé ==="
