#!/bin/bash
export PGPASSWORD='8765123490@28A28a28'
psql -h localhost -U kinsell -d kinsell_db <<'SQL'
SELECT id, email, role FROM "User" WHERE role IN ('SUPER_ADMIN','ADMIN') ORDER BY role;
SELECT 'Total users:' AS label, COUNT(*) AS count FROM "User";
SELECT 'Total listings:' AS label, COUNT(*) AS count FROM "Listing";
SELECT 'Total orders:' AS label, COUNT(*) AS count FROM "Order";
SQL
