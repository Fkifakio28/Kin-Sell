/**
 * Script ponctuel — Supprimer l'avatar/logo du compte "City Market"
 *
 * Usage :
 *   cd d:\Kin-Sell
 *   npx ts-node -e "require('./packages/db/clear-city-market-avatar.ts')"
 *
 * Ou depuis packages/db :
 *   cd packages/db
 *   npx ts-node prisma/clear-city-market-avatar.ts
 */

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: "../../.env" });

const prisma = new PrismaClient();

async function main() {
  // 1. Trouver toutes les boutiques dont le nom public contient "city market"
  const businesses = await prisma.businessAccount.findMany({
    where: {
      publicName: { contains: "city market", mode: "insensitive" },
    },
    select: {
      id: true,
      publicName: true,
      ownerUserId: true,
      shop: { select: { id: true, logo: true } },
    },
  });

  if (businesses.length === 0) {
    console.log('⚠️  Aucun compte "City Market" trouvé en base.');
    return;
  }

  for (const biz of businesses) {
    console.log(`\n🔍 Trouvé : "${biz.publicName}" (id: ${biz.id})`);

    // 2. Effacer le logo de la boutique
    if (biz.shop?.logo) {
      await prisma.businessShop.update({
        where: { businessId: biz.id },
        data: { logo: null, coverImage: null },
      });
      console.log(`  ✅ Logo et coverImage de la boutique effacés.`);
    } else {
      console.log(`  ℹ️  Pas de logo en DB pour la boutique.`);
    }

    // 3. Effacer l'avatarUrl du profil du propriétaire
    const profile = await prisma.userProfile.findUnique({
      where: { userId: biz.ownerUserId },
      select: { id: true, avatarUrl: true, displayName: true },
    });

    if (profile?.avatarUrl) {
      await prisma.userProfile.update({
        where: { userId: biz.ownerUserId },
        data: { avatarUrl: null },
      });
      console.log(`  ✅ avatarUrl du profil "${profile.displayName}" effacé.`);
    } else {
      console.log(`  ℹ️  Pas d'avatarUrl sur le profil utilisateur.`);
    }
  }

  console.log("\n✔ Terminé.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
