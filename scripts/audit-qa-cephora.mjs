import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// IDs de l'audit précédent
const CEPHORA = "cmnk2huky000phtuqoquhgryu";
const FILI = "cmnjhr3cq0001z281rofcvm6e";
const QA_SHOP_OWNER = "cmo44xx4y0002h1dvlgid60xj";

console.log("=== Qui est l'owner de QA Shop ? ===");
const qaOwner = await p.user.findUnique({
  where: { id: QA_SHOP_OWNER },
  select: { id: true, email: true, role: true, createdAt: true, profile: { select: { displayName: true } } }
});
console.log(JSON.stringify(qaOwner, null, 2));
console.log(JSON.stringify(qaOwner, null, 2));

console.log("\n=== Listings de QA Shop ===");
const qaListings = await p.listing.findMany({
  where: { ownerUserId: QA_SHOP_OWNER },
  select: { id: true, title: true, priceUsdCents: true, isPublished: true, createdAt: true }
});
for (const l of qaListings) {
  console.log(`  ${l.id} | ${l.title} | ${l.priceUsdCents}¢ | published=${l.isPublished} | created=${l.createdAt.toISOString()}`);
}

console.log("\n=== CartItems créés pour CEPHORA liés à QA listings ===");
const cephoraItems = await p.cartItem.findMany({
  where: {
    cart: { buyerUserId: CEPHORA },
    listing: { ownerUserId: QA_SHOP_OWNER }
  },
  select: { id: true, listingId: true, quantity: true, unitPriceUsdCents: true, createdAt: true, updatedAt: true, negotiationId: true, negotiation: { select: { id: true, buyerUserId: true, sellerUserId: true, status: true, createdAt: true } } }
});
for (const it of cephoraItems) {
  console.log(`  item=${it.id} listing=${it.listingId} qty=${it.quantity} prix=${it.unitPriceUsdCents}¢`);
  console.log(`    cartItem.createdAt = ${it.createdAt.toISOString()}  updatedAt=${it.updatedAt.toISOString()}`);
  if (it.negotiation) {
    console.log(`    nego=${it.negotiation.id} buyer=${it.negotiation.buyerUserId} seller=${it.negotiation.sellerUserId} status=${it.negotiation.status} negoCreated=${it.negotiation.createdAt.toISOString()}`);
  }
}

console.log("\n=== Historique login de CEPHORA + QA + FILI (IP check) ===");
const allIds = [CEPHORA, FILI, QA_SHOP_OWNER];
for (const uid of allIds) {
  const sessions = await p.userSession.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, createdAt: true, lastSeenAt: true, ipAddress: true, userAgent: true, deviceId: true }
  }).catch((e) => { console.log("ERR:", e.message); return []; });
  console.log(`\n--- user ${uid} (${sessions.length} sessions) ---`);
  for (const s of sessions) {
    console.log(`  ${s.id.slice(0,10)} | ${s.status} | created=${s.createdAt.toISOString()} | seen=${s.lastSeenAt?.toISOString() ?? '-'} | ip=${s.ipAddress ?? '?'} | UA=${(s.userAgent ?? '').slice(0, 70)}`);
  }
}

console.log("\n=== IPs partagées entre plusieurs users ? ===");
const ipShare = await p.$queryRaw`
  SELECT "ipAddress", COUNT(DISTINCT "userId")::int AS "userCount", array_agg(DISTINCT "userId") AS "userIds"
  FROM "UserSession"
  WHERE "ipAddress" IS NOT NULL AND "createdAt" > NOW() - INTERVAL '7 days'
  GROUP BY "ipAddress"
  HAVING COUNT(DISTINCT "userId") > 1
  ORDER BY "userCount" DESC
  LIMIT 20
`;
for (const r of ipShare) {
  const hasCeph = r.userIds.includes(CEPHORA);
  const hasFili = r.userIds.includes(FILI);
  const hasQa = r.userIds.includes(QA_SHOP_OWNER);
  const tag = (hasCeph || hasFili || hasQa) ? " ← MATCH" : "";
  console.log(`  IP ${r.ipAddress} | ${r.userCount} users distincts${tag} ${hasCeph?'[CEPHORA]':''}${hasFili?'[FILI]':''}${hasQa?'[QA]':''}`);
}

await p.$disconnect();
