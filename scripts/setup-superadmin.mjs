import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const p = new PrismaClient();

const email = 'fkifakio28@gmail.com';
const password = '8765123490@28A28a28@';
const displayName = 'Super Admin';

// Check if already exists
let u = await p.user.findFirst({ where: { email }, select: { id: true, role: true, email: true } });

if (!u) {
  console.log('Creating new SUPER_ADMIN account…');
  const passwordHash = await bcrypt.hash(password, 12);

  u = await p.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: 'SUPER_ADMIN',
        preferredAccountType: 'USER',
        profileCompleted: true,
        profile: {
          create: {
            displayName,
            username: 'super-admin',
          },
        },
        preferences: { create: {} },
      },
    });

    await tx.userIdentity.create({
      data: {
        userId: created.id,
        provider: 'EMAIL',
        providerSubject: email,
        providerEmail: email,
        isVerified: true,
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: created.id },
      select: { id: true, role: true, email: true },
    });
  });

  console.log('ACCOUNT_CREATED:', JSON.stringify(u));
} else {
  console.log('FOUND:', JSON.stringify(u));
  if (u.role !== 'SUPER_ADMIN') {
    await p.user.update({ where: { id: u.id }, data: { role: 'SUPER_ADMIN' } });
    console.log('ROLE_UPDATED_TO_SUPER_ADMIN');
  } else {
    console.log('ALREADY_SUPER_ADMIN');
  }
}

// Ensure AdminProfile
const ap = await p.adminProfile.findUnique({ where: { userId: u.id } });
if (!ap) {
  await p.adminProfile.create({
    data: {
      userId: u.id,
      level: 'LEVEL_1',
      permissions: [
        'DASHBOARD','USERS','BLOG','TRANSACTIONS','REPORTS','FEED',
        'DONATIONS','ADS','SECURITY','ANTIFRAUD','SECURITY_AI',
        'AI_MANAGEMENT','RANKINGS','ADMINS','CURRENCY','AUDIT',
        'SETTINGS','MESSAGING',
      ],
    },
  });
  console.log('ADMIN_PROFILE_CREATED');
} else {
  console.log('ADMIN_PROFILE_EXISTS');
}

await p.$disconnect();
console.log('DONE — Super Admin ready');
