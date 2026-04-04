/**
 * Swap Super Admin: delete fkifakio28@gmail.com, create Admin@kin-sell.com as SUPER_ADMIN.
 * Run from project root: node scripts/swap-admin.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.chdir("/home/kinsell/Kin-Sell");

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const OLD_EMAIL = "fkifakio28@gmail.com";
const NEW_EMAIL = "admin@kin-sell.com";
const NEW_PASSWORD = "8765123490@28A28a28@";

async function main() {
  // 1. Delete old account and all related data
  const oldUser = await prisma.user.findUnique({ where: { email: OLD_EMAIL } });
  if (oldUser) {
    console.log(`Suppression de ${OLD_EMAIL} (${oldUser.id})...`);
    const uid = oldUser.id;

    // Delete in dependency order (children first)
    await prisma.messageReadReceipt.deleteMany({ where: { userId: uid } });
    await prisma.messageGuardLog.deleteMany({ where: { userId: uid } });
    await prisma.message.deleteMany({ where: { senderId: uid } });
    await prisma.conversationParticipant.deleteMany({ where: { userId: uid } });
    await prisma.pushSubscription.deleteMany({ where: { userId: uid } });
    await prisma.callLog.deleteMany({ where: { OR: [{ callerUserId: uid }, { receiverUserId: uid }] } });
    await prisma.negotiationOffer.deleteMany({ where: { fromUserId: uid } });
    await prisma.negotiation.deleteMany({ where: { OR: [{ buyerUserId: uid }, { sellerUserId: uid }] } });
    await prisma.negotiationBundle.deleteMany({ where: { OR: [{ creatorUserId: uid }, { sellerUserId: uid }] } });
    await prisma.order.deleteMany({ where: { OR: [{ buyerUserId: uid }, { sellerUserId: uid }] } });
    await prisma.cart.deleteMany({ where: { buyerUserId: uid } });
    await prisma.paymentOrder.deleteMany({ where: { userId: uid } });
    await prisma.subscription.deleteMany({ where: { userId: uid } });
    await prisma.report.deleteMany({ where: { OR: [{ reporterUserId: uid }, { reportedUserId: uid }] } });
    await prisma.blogPost.deleteMany({ where: { authorId: uid } });
    await prisma.trustScoreEvent.deleteMany({ where: { userId: uid } });
    await prisma.securityEvent.deleteMany({ where: { userId: uid } });
    await prisma.userRestriction.deleteMany({ where: { userId: uid } });
    await prisma.fraudSignal.deleteMany({ where: { userId: uid } });
    await prisma.soKinPost.deleteMany({ where: { authorId: uid } });
    await prisma.adDonation.deleteMany({ where: { userId: uid } });
    await prisma.advertisement.deleteMany({ where: { userId: uid } });
    await prisma.listing.deleteMany({ where: { ownerUserId: uid } });
    await prisma.businessAccount.deleteMany({ where: { ownerUserId: uid } });
    await prisma.verificationCode.deleteMany({ where: { userId: uid } });
    await prisma.userSession.deleteMany({ where: { userId: uid } });
    await prisma.userIdentity.deleteMany({ where: { userId: uid } });
    await prisma.adminProfile.deleteMany({ where: { userId: uid } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: uid } });
    await prisma.userPreference.deleteMany({ where: { userId: uid } });
    await prisma.userProfile.deleteMany({ where: { userId: uid } });
    await prisma.user.delete({ where: { id: uid } });

    console.log(`✓ ${OLD_EMAIL} supprimé.`);
  } else {
    console.log(`${OLD_EMAIL} non trouvé, on continue...`);
  }

  // 2. Check if new admin already exists
  const existing = await prisma.user.findUnique({ where: { email: NEW_EMAIL.toLowerCase() } });
  if (existing) {
    console.log(`${NEW_EMAIL} existe déjà (${existing.id}, role: ${existing.role}). Promotion en SUPER_ADMIN...`);
    await prisma.user.update({ where: { id: existing.id }, data: { role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(NEW_PASSWORD, 12) } });
    console.log(`✓ ${NEW_EMAIL} promu SUPER_ADMIN avec nouveau mot de passe.`);
  } else {
    // 3. Create fresh super admin
    const passwordHash = await bcrypt.hash(NEW_PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        email: NEW_EMAIL.toLowerCase(),
        emailVerified: true,
        passwordHash,
        role: "SUPER_ADMIN",
        preferredAccountType: "USER",
        profileCompleted: true,
        accountStatus: "ACTIVE",
        trustScore: 100,
        trustLevel: "PREMIUM",
        profile: {
          create: {
            displayName: "Admin Kin-Sell",
            username: "admin-kinsell",
          }
        },
        preferences: { create: { locale: "fr", currency: "CDF" } },
        identities: {
          create: {
            provider: "EMAIL",
            providerSubject: NEW_EMAIL.toLowerCase(),
          }
        },
      }
    });
    console.log(`✓ ${NEW_EMAIL} créé comme SUPER_ADMIN (${user.id})`);
  }

  // 4. Verify
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true, email: true, role: true }
  });
  console.log("\nComptes admin actuels:");
  console.log(JSON.stringify(admins, null, 2));
}

main()
  .catch(e => { console.error("ERREUR:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
