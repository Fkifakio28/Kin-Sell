import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const listings = await p.listing.count();
  const posts = await p.soKinPost.count();
  const users = await p.user.count();
  console.log(`Listings: ${listings} | SoKin Posts: ${posts} | Users: ${users}`);
} catch(e) { console.error(e.message); }
await p.$disconnect();
