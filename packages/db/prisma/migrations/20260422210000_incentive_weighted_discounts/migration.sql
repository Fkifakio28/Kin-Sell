-- Chantier D Phase D2 — Distribution pondérée des discounts incentive
-- Ajoute le champ discountWeights (JSON) et étend allowedDiscounts avec 5%
-- Additif, safe pour données existantes.

-- 1. Nouveau champ discountWeights (JSON optionnel)
ALTER TABLE "IncentivePolicy" ADD COLUMN IF NOT EXISTS "discountWeights" JSONB;

-- 2. Étendre allowedDiscounts : ajouter 5% pour segment STANDARD + élargir granularité
UPDATE "IncentivePolicy"
SET "allowedDiscounts" = ARRAY[5, 10, 20, 30, 40, 50, 60, 70, 80, 100]
WHERE "segment" = 'STANDARD';

UPDATE "IncentivePolicy"
SET "allowedDiscounts" = ARRAY[5, 20, 50, 80]
WHERE "segment" = 'TESTER';

-- 3. Seed pondération par défaut
-- Distribution cible : {100:1, 80:2, 70:5, 60:5.5, 50:8, 40:12, 30:20, 20:25, 10:30, 5:40} (total 148.5)
-- Probabilités approchées : 5%:26.9% · 10%:20.2% · 20%:16.8% · 30%:13.5% · 40%:8.1% · 50%:5.4% · 60%:3.7% · 70%:3.4% · 80%:1.3% · 100%:0.7%
UPDATE "IncentivePolicy"
SET "discountWeights" = '{"5":40,"10":30,"20":25,"30":20,"40":12,"50":8,"60":5.5,"70":5,"80":2,"100":1}'::jsonb
WHERE "discountWeights" IS NULL;
