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
const qaBiz = await p.business.findFirst({ where: { ownerUserId: QA_SHOP_OWNER }, select: { id: true, publicName: true, slug: true } }).catch(() => null);
console.log("Business:", JSON.stringify(qaBiz));
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

console.log("\n=== Historique login de CEPHORA (dernières 10) ===");
const cephSessions = await p.userSession.findMany({
  where: { userId: CEPHORA },
  orderBy: { createdAt: "desc" },
  take: 10,
  select: { id: true, status: true, createdAt: true, lastActiveAt: true, ipAddress: true, userAgent: true }
});
for (const s of cephSessions) {
  console.log(`  ${s.id} | ${s.status} | created=${s.createdAt.toISOString()} | lastActive=${s.lastActiveAt?.toISOString() ?? '-'} | ip=${s.ipAddress ?? '?'} | UA=${(s.userAgent ?? '').slice(0, 60)}`);
}

console.log("\n=== Historique login de FILI (dernières 10) ===");
const filiSessions = await p.userSession.findMany({
  where: { userId: FILI },
  orderBy: { createdAt: "desc" },
  take: 10,
  select: { id: true, status: true, createdAt: true, lastActiveAt: true, ipAddress: true, userAgent: true }
});
for (const s of filiSessions) {
  console.log(`  ${s.id} | ${s.status} | created=${s.createdAt.toISOString()} | lastActive=${s.lastActiveAt?.toISOString() ?? '-'} | ip=${s.ipAddress ?? '?'} | UA=${(s.userAgent ?? '').slice(0, 60)}`);
}

console.log("\n=== SecurityEvents récents pour CEPHORA & FILI ===");
const events = await p.securityEvent.findMany({
  where: { userId: { in: [CEPHORA, FILI] } },
  orderBy: { createdAt: "desc" },
  take: 20,
  select: { id: true, userId: true, type: true, severity: true, ipAddress: true, createdAt: true, metadata: true }
}).catch((e) => { console.log("(pas de table SecurityEvent accessible :", e.message, ")"); return []; });
for (const e of events) {
  console.log(`  ${e.createdAt.toISOString()} | user=${e.userId} | ${e.type} (${e.severity}) | ip=${e.ipAddress ?? '?'}`);
}

await p.$disconnect();
