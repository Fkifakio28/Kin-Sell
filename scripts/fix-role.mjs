import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const email = 'city@market.com';

async function main() {
  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user) { console.log('User not found:', email); return; }
  console.log('BEFORE:', { id: user.id, email: user.email, role: user.role, displayName: user.profile?.displayName });

  if (user.role !== 'BUSINESS') {
    const updated = await prisma.user.update({ where: { email }, data: { role: 'BUSINESS' } });
    console.log('AFTER:', { id: updated.id, email: updated.email, role: updated.role });
  } else {
    console.log('Role is already BUSINESS — no change needed.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
