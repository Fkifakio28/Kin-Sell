import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const t = await p.advertisement.count();
const a = await p.advertisement.count({ where: { status: 'ACTIVE' } });
const k = await p.advertisement.count({ where: { type: 'KIN_SELL' } });
console.log('Total:', t, '| Active:', a, '| KIN_SELL:', k);

// Fix: set all KIN_SELL ads to NATIONAL scope so they show everywhere in the country
const fixed = await p.advertisement.updateMany({
  where: { type: 'KIN_SELL', promotionScope: 'LOCAL' },
  data: { promotionScope: 'NATIONAL' },
});
console.log('Fixed to NATIONAL scope:', fixed.count, 'ads');

const active = await p.advertisement.findMany({
  where: { status: 'ACTIVE' },
  select: { id: true, title: true, promotionScope: true, baseCity: true, targetPages: true },
  take: 5,
});
console.log(JSON.stringify(active, null, 2));
await p.$disconnect();
