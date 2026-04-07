import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const posts = await p.soKinPost.findMany({
  where: { status: 'ACTIVE' },
  orderBy: { createdAt: 'desc' },
  take: 10,
  select: { id: true, text: true, location: true, scheduledAt: true, status: true, createdAt: true, authorId: true }
});
console.log(JSON.stringify(posts, null, 2));
await p.$disconnect();
