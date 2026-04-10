#!/bin/bash
cd /home/kinsell/Kin-Sell
source apps/api/.env
export JWT_SECRET
echo "SECRET_LEN=${#JWT_SECRET}"
echo "SECRET_PREFIX=${JWT_SECRET:0:8}"
node scripts/gen-test-token.mjs filikifakio@gmail.com --test
