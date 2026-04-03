import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const rates = [
  { from: "USD", to: "CDF", rate: 2850 },
  { from: "USD", to: "EUR", rate: 0.92 },
  { from: "USD", to: "XAF", rate: 605 },
  { from: "USD", to: "AOA", rate: 905 },
  { from: "USD", to: "XOF", rate: 605 },
  { from: "USD", to: "GNF", rate: 8600 },
  { from: "USD", to: "MAD", rate: 9.9 },
];

for (const r of rates) {
  await prisma.currencyRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: r.from, toCurrency: r.to } },
    update: { rate: r.rate },
    create: { fromCurrency: r.from, toCurrency: r.to, rate: r.rate, isManual: false },
  });
  console.log(`${r.from} -> ${r.to}: ${r.rate}`);
}

await prisma.$disconnect();
console.log("Done!");
