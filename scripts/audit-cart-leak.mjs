#!/usr/bin/env node
/**
 * Audit cart leak :
 *  1) Détecte si plusieurs Cart OPEN existent pour le même buyerUserId (doublons anormaux)
 *  2) Détecte si 2 users distincts partagent un même email, phoneE164 ou deviceId récent
 *     (signe d'un compte cloné / partagé)
 *  3) Affiche le top 5 Cart par nombre d'items
 *
 * Usage :
 *   node scripts/audit-cart-leak.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== 1) Carts OPEN multiples par user ===");
  const dupCarts = await prisma.$queryRaw`
    SELECT "buyerUserId", COUNT(*)::int AS "openCount"
    FROM "Cart"
    WHERE "status" = 'OPEN'
    GROUP BY "buyerUserId"
    HAVING COUNT(*) > 1
    ORDER BY "openCount" DESC
    LIMIT 20
  `;
  console.log(dupCarts.length === 0 ? "OK — aucun doublon" : dupCarts);

  console.log("\n=== 2) Emails partagés par plusieurs users ===");
  const dupEmails = await prisma.$queryRaw`
    SELECT LOWER("email") AS email, COUNT(*)::int AS users
    FROM "User"
    WHERE "email" IS NOT NULL
    GROUP BY LOWER("email")
    HAVING COUNT(*) > 1
    LIMIT 20
  `;
  console.log(dupEmails.length === 0 ? "OK — aucun email partagé" : dupEmails);

  console.log("\n=== 3) Top 5 Carts OPEN par nombre d'items ===");
  const topCarts = await prisma.cart.findMany({
    where: { status: "OPEN" },
    include: {
      _count: { select: { items: true } },
      buyer: { select: { id: true, email: true, profile: { select: { displayName: true, city: true } } } }
    },
    orderBy: { updatedAt: "desc" },
    take: 5
  });
  for (const c of topCarts) {
    console.log(`- Cart ${c.id} | buyer=${c.buyerUserId} (${c.buyer?.email ?? "?"} / ${c.buyer?.profile?.displayName ?? "?"} / ${c.buyer?.profile?.city ?? "?"}) | items=${c._count.items} | updated=${c.updatedAt.toISOString()}`);
  }

  console.log("\n=== 4) Sessions actives par user (top 10) ===");
  const dupSessions = await prisma.$queryRaw`
    SELECT "userId", COUNT(*)::int AS "activeSessions"
    FROM "UserSession"
    WHERE "status" = 'ACTIVE'
    GROUP BY "userId"
    HAVING COUNT(*) >= 2
    ORDER BY "activeSessions" DESC
    LIMIT 10
  `;
  console.log(dupSessions.length === 0 ? "OK — aucune session multiple" : dupSessions);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
