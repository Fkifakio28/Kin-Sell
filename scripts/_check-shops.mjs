import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const shops = await p.businessShop.findMany({ select: { logo: true, coverImage: true, shopPhotos: true } });
console.log(JSON.stringify(shops, null, 2));
await p.$disconnect();
