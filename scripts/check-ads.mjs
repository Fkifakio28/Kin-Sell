import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const t = await p.advertisement.count();
const a = await p.advertisement.count({ where: { status: 'ACTIVE' } });
const k = await p.advertisement.count({ where: { type: 'KIN_SELL' } });
console.log('Total:', t, '| Active:', a, '| KIN_SELL:', k);
if (a > 0) {
  const ads = await p.advertisement.findMany({ where: { status: 'ACTIVE' }, select: { id: true, title: true, type: true, targetPages: true, promotionScope: true, baseCity: true, startDate: true, endDate: true }, take: 5 });
  console.log(JSON.stringify(ads, null, 2));
} else {
  console.log('AUCUNE PUB ACTIVE');
  const all = await p.advertisement.findMany({ select: { id: true, title: true, type: true, status: true }, take: 10 });
  console.log('Toutes les pubs:', JSON.stringify(all, null, 2));
}
await p.$disconnect();
