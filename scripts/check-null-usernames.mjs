import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const results = await prisma.userProfile.findMany({
  where: { OR: [{ username: null }, { username: '' }] },
  select: { userId: true, displayName: true, username: true },
  take: 20,
});
console.log('Users without username:', results.length);
console.log(JSON.stringify(results, null, 2));
await prisma.$disconnect();
