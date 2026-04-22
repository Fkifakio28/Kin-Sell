import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const emails = ["cephorahenry@gmail.com", "Filikifakio@gmail.com", "filikifakio@gmail.com"];

for (const em of emails) {
  const u = await p.user.findFirst({
    where: { email: { equals: em, mode: "insensitive" } },
    select: { id: true, email: true, profile: { select: { displayName: true } } }
  });
  console.log("---", em, "=>", JSON.stringify(u));
  if (!u) continue;

  const carts = await p.cart.findMany({
    where: { buyerUserId: u.id },
    include: {
      items: {
        include: {
          listing: { select: { id: true, title: true, ownerUserId: true } },
          negotiation: { select: { id: true, status: true, buyerUserId: true, sellerUserId: true } }
        }
      }
    }
  });
  for (const c of carts) {
    console.log(`  Cart ${c.id} status=${c.status} items=${c.items.length} updated=${c.updatedAt.toISOString()}`);
    for (const it of c.items) {
      console.log(
        `    item=${it.id} listing=${it.listingId} (${it.listing?.title ?? "?"}) ownerListing=${it.listing?.ownerUserId ?? "?"} qty=${it.quantity} price=${it.unitPriceUsdCents} negoId=${it.negotiation?.id ?? "-"} negoBuyer=${it.negotiation?.buyerUserId ?? "-"} negoSeller=${it.negotiation?.sellerUserId ?? "-"}`
      );
    }
  }
}

// Chercher aussi les negotiations de ces users (peut-être un item partagé ?)
console.log("\n=== Négociations liées ===");
for (const em of emails) {
  const u = await p.user.findFirst({ where: { email: { equals: em, mode: "insensitive" } }, select: { id: true, email: true } });
  if (!u) continue;
  const negos = await p.negotiation.findMany({
    where: { OR: [{ buyerUserId: u.id }, { sellerUserId: u.id }] },
    select: { id: true, status: true, buyerUserId: true, sellerUserId: true, listingId: true, originalPriceUsdCents: true, finalPriceUsdCents: true, createdAt: true }
  });
  console.log(`User ${em} (${u.id}) négociations: ${negos.length}`);
  for (const n of negos) console.log(`  nego=${n.id} status=${n.status} buyer=${n.buyerUserId} seller=${n.sellerUserId} listing=${n.listingId} prix=${n.finalPriceUsdCents ?? n.originalPriceUsdCents}`);
}

await p.$disconnect();
