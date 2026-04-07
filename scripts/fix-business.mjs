import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'city@market.com' },
    select: { id: true, email: true, role: true },
  });
  console.log('User:', JSON.stringify(user, null, 2));

  if (!user) { console.log('User not found'); return; }

  const business = await prisma.businessAccount.findFirst({
    where: { ownerUserId: user.id },
    include: { shop: true },
  });
  console.log('Business:', JSON.stringify(business, null, 2));

  if (!business) {
    console.log('>>> NO BusinessAccount found — creating one...');
    const slug = 'city-market';
    const created = await prisma.$transaction(async (tx) => {
      const biz = await tx.businessAccount.create({
        data: {
          ownerUserId: user.id,
          legalName: 'City Market',
          publicName: 'City Market',
          description: 'Espace entreprise City Market',
          slug,
          shop: {
            create: {
              city: 'Kinshasa',
              publicDescription: 'Boutique City Market',
            },
          },
        },
        include: { shop: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'BUSINESS_CREATE',
          entityType: 'BUSINESS_ACCOUNT',
          entityId: biz.id,
          metadata: { slug: biz.slug },
        },
      });
      return biz;
    });
    console.log('Created Business:', JSON.stringify(created, null, 2));
  } else {
    console.log('BusinessAccount already exists — no action needed.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
