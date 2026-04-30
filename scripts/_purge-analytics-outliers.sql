-- Purge des données analytique aberrantes.
-- Seuils : < 0.50 € ou > 100 000 € pour prix ; < 50 € ou > 20 000 €/mois pour salaires.
DELETE FROM "MarketPrice" WHERE "priceMedianEurCents" < 50 OR "priceMedianEurCents" > 10000000;
DELETE FROM "MarketSalary" WHERE "salaryMedianEurCents" < 5000 OR "salaryMedianEurCents" > 2000000;
