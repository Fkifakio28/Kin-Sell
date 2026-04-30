import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

try {
  const hash = await bcrypt.hash('QaBuyer!2026#Ks', 12);
  const bizHash = await bcrypt.hash('QaBiz!2026#Ks', 12);

  const buyer = await prisma.user.upsert({
    where: { email: 'qa-buyer-2026@yopmail.com' },
    update: {},
    create: {
      email: 'qa-buyer-2026@yopmail.com',
      passwordHash: hash,
      role: 'USER',
      preferredAccountType: 'USER',
      profileCompleted: true,
      profile: {
        create: {
          displayName: 'QA Buyer',
          username: 'qa-buyer-test',
          country: 'CD',
          city: 'Kinshasa',
        }
      }
    }
  });
  console.log('BUYER:', buyer.id, buyer.email, buyer.role);

  const biz = await prisma.user.upsert({
    where: { email: 'qa-business-2026@yopmail.com' },
    update: {},
    create: {
      email: 'qa-business-2026@yopmail.com',
      passwordHash: bizHash,
      role: 'BUSINESS',
      preferredAccountType: 'BUSINESS',
      profileCompleted: true,
      profile: {
        create: {
          displayName: 'QA Business',
          username: 'qa-biz-test',
          country: 'CD',
          city: 'Kinshasa',
        }
      }
    }
  });
  console.log('BUSINESS:', biz.id, biz.email, biz.role);

  let ba = await prisma.businessAccount.findFirst({ where: { ownerUserId: biz.id } });
  if (!ba) {
    ba = await prisma.businessAccount.create({
      data: {
        ownerUserId: biz.id,
        legalName: 'QA Test SARL',
        publicName: 'QA Shop Test',
        slug: 'qa-shop-test',
        description: 'Boutique de test QA',
      }
    });
  }
  console.log('SHOP:', ba.id, 'slug:', ba.slug);

  const listing = await prisma.listing.create({
    data: {
      ownerUserId: biz.id,
      businessId: ba.id,
      type: 'PRODUIT',
      title: 'Produit QA Test',
      description: 'Produit de test QA',
      category: 'Electronique',
      city: 'Kinshasa',
      country: 'CD',
      latitude: -4.325,
      longitude: 15.3222,
      priceUsdCents: 500,
      stockQuantity: 10,
      status: 'ACTIVE',
    }
  });
  console.log('LISTING_PRODUIT:', listing.id, 'price:', listing.priceUsdCents);

  const svc = await prisma.listing.create({
    data: {
      ownerUserId: biz.id,
      businessId: ba.id,
      type: 'SERVICE',
      title: 'Service QA Test',
      description: 'Service de test QA',
      category: 'Services',
      city: 'Kinshasa',
      country: 'CD',
      latitude: -4.325,
      longitude: 15.3222,
      priceUsdCents: 1000,
      serviceDurationMin: 60,
      status: 'ACTIVE',
    }
  });
  console.log('LISTING_SERVICE:', svc.id, 'price:', svc.priceUsdCents);

  console.log('DONE');
} finally {
  await prisma.$disconnect();
}
