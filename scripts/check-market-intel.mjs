import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const [products, prices, jobs, salaries, trends, arb, sources] = await Promise.all([
  p.marketProduct.count(),
  p.marketPrice.count(),
  p.marketJob.count(),
  p.marketSalary.count(),
  p.marketTrend.count(),
  p.arbitrageOpportunity.count(),
  p.marketSource.count(),
]);
console.log(JSON.stringify({ products, prices, jobs, salaries, trends, arb, sources }, null, 2));
await p.$disconnect();
