#!/bin/bash
# Remote VPS deploy script: inject Firebase env + git pull + build + restart
set -e
cd ~/Kin-Sell

ENV_FILE=".env"
# Remove any existing FIREBASE_* lines (idempotent)
sed -i '/^FIREBASE_PROJECT_ID=/d' "$ENV_FILE" 2>/dev/null || true
sed -i '/^FIREBASE_CLIENT_EMAIL=/d' "$ENV_FILE" 2>/dev/null || true
sed -i '/^FIREBASE_PRIVATE_KEY=/d' "$ENV_FILE" 2>/dev/null || true

# Append the new values (passed via env vars to this script)
{
  echo "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
  echo "FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL}"
  echo "FIREBASE_PRIVATE_KEY=\"${FIREBASE_PRIVATE_KEY}\""
} >> "$ENV_FILE"

echo "[env] FIREBASE_* injected"
grep -c "^FIREBASE_" "$ENV_FILE"

# Git pull
echo "[git] pulling latest..."
git pull origin sokin/text-video-improvements-20260411-1929

# Install / build
echo "[build] API..."
cd apps/api && npm run build
cd ../..

echo "[build] Web..."
cd apps/web && npm run build
cd ../..

# Restart
echo "[pm2] restarting kinsell-api..."
pm2 restart kinsell-api --update-env

pm2 status
echo "[done] deploy complete"
