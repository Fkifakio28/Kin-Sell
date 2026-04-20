#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SUDO_PW:-}" ]; then
  echo "SUDO_PW is required" >&2
  exit 2
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="/etc/nginx/sites-enabled/kin-sell.conf.bak-${TS}"
TARGET="/etc/nginx/sites-enabled/kin-sell.conf"
SOURCE="/home/kinsell/nginx.vps.kin-sell.conf"

echo "$SUDO_PW" | sudo -S cp "$TARGET" "$BACKUP"
echo "$SUDO_PW" | sudo -S cp "$SOURCE" "$TARGET"

if echo "$SUDO_PW" | sudo -S nginx -t; then
  echo "$SUDO_PW" | sudo -S systemctl reload nginx
  echo "DEPLOY_OK:${BACKUP}"
else
  echo "$SUDO_PW" | sudo -S cp "$BACKUP" "$TARGET"
  echo "$SUDO_PW" | sudo -S nginx -t
  echo "DEPLOY_ROLLBACK:${BACKUP}" >&2
  exit 1
fi
