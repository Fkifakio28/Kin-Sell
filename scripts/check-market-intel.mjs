import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const [prices, salaries, trends, arb, cov, products] = await Promise.all([
  p.marketPrice.count(),
  p.marketSalary.count(),
  p.marketTrend.count(),
  p.marketArbitrage.count(),
  p.marketCountryCoverage.count(),
  p.marketProduct.count(),
]);
console.log(JSON.stringify({ prices, salaries, trends, arb, cov, products }, null, 2));
await p.$disconnect();
