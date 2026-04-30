#!/bin/bash
set -e
cd ~/Kin-Sell
DB=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d'=' -f2- | sed -E 's/^"//;s/"$//')
echo "DB configured (first 30 chars): ${DB:0:30}..."
psql "$DB" -f /tmp/purge.sql
echo PURGE_OK
