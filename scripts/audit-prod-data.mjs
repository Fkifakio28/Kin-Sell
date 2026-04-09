import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 1. Advertisements in DB
const ads = await prisma.advertisement.findMany({ take: 20 });
console.log(`\n=== ADVERTISEMENTS: ${ads.length} total ===`);
for (const ad of ads) {
  console.log(`  [${ad.status}] "${ad.title}" pages=${ad.targetPages} imp=${ad.impressions} clicks=${ad.clicks} priority=${ad.priority}`);
}

// 2. Boosted listings
const boosted = await prisma.listing.findMany({ where: { isBoosted: true }, select: { id: true, title: true, isBoosted: true, boostExpiresAt: true }, take: 20 });
console.log(`\n=== BOOSTED LISTINGS: ${boosted.length} ===`);
for (const b of boosted) {
  console.log(`  "${b.title?.slice(0,40)}" expires=${b.boostExpiresAt}`);
}

// 3. Ghost boosts (expired but still flagged)
const ghostBoosts = await prisma.listing.count({ where: { isBoosted: true, boostExpiresAt: { lte: new Date() } } });
console.log(`\n=== GHOST BOOSTS (expired but isBoosted=true): ${ghostBoosts} ===`);

// 4. AI Recommendations
const recs = await prisma.aiRecommendation.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
console.log(`\n=== AI RECOMMENDATIONS: ${recs.length} recent ===`);
for (const r of recs) {
  console.log(`  [${r.status}] type=${r.triggerType} "${r.title?.slice(0,50)}" created=${r.createdAt.toISOString().slice(0,10)}`);
}
const totalRecs = await prisma.aiRecommendation.count();
console.log(`  Total in DB: ${totalRecs}`);

// 5. AI Memory Snapshots
try {
  const snaps = await prisma.aiMemorySnapshot.count();
  console.log(`\n=== AI MEMORY SNAPSHOTS: ${snaps} ===`);
} catch { console.log('\n=== AI MEMORY SNAPSHOTS: table not found ==='); }

// 6. Subscriptions with addons
const subs = await prisma.subscription.findMany({ where: { status: 'ACTIVE' }, include: { addons: true }, take: 20 });
console.log(`\n=== ACTIVE SUBSCRIPTIONS: ${subs.length} ===`);
for (const s of subs) {
  console.log(`  plan=${s.planCode} addons=[${s.addons.map(a => `${a.addonCode}:${a.status}`).join(', ')}]`);
}

// 7. Boost addon active
const boostAddons = await prisma.subscriptionAddon.findMany({ where: { addonCode: 'BOOST_VISIBILITY' }, take: 10 });
console.log(`\n=== BOOST_VISIBILITY ADDONS: ${boostAddons.length} ===`);
for (const a of boostAddons) {
  console.log(`  status=${a.status} ends=${a.endsAt}`);
}

// 8. Audit logs for boost
const boostLogs = await prisma.auditLog.findMany({ where: { action: { contains: 'BOOST' } }, take: 10, orderBy: { createdAt: 'desc' } });
console.log(`\n=== BOOST AUDIT LOGS: ${boostLogs.length} ===`);
for (const l of boostLogs) {
  console.log(`  action=${l.action} date=${l.createdAt.toISOString().slice(0,10)}`);
}

// 9. Orders count (real sales data for analytics)
const orders = await prisma.order.count();
const deliveredOrders = await prisma.order.count({ where: { status: 'DELIVERED' } });
console.log(`\n=== ORDERS: ${orders} total, ${deliveredOrders} DELIVERED ===`);

// 10. Negotiations count
const negos = await prisma.negotiation.count();
console.log(`=== NEGOTIATIONS: ${negos} total ===`);

// 11. Total listings
const listings = await prisma.listing.count();
const published = await prisma.listing.count({ where: { isPublished: true } });
console.log(`=== LISTINGS: ${listings} total, ${published} published ===`);

// 12. Total users
const users = await prisma.user.count();
console.log(`=== USERS: ${users} total ===`);

await prisma.$disconnect();
