import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMAIL = process.argv[2];

if (!EMAIL) {
  console.error("Usage: node scripts/delete-user.mjs <email>");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, email: true, role: true } });

if (!user) {
  console.log(`Aucun compte trouvé pour: ${EMAIL}`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Compte trouvé: ${user.email} | rôle: ${user.role} | id: ${user.id}`);
console.log("Suppression en cours...");

await prisma.user.delete({ where: { id: user.id } });

console.log(`Compte ${EMAIL} supprimé avec succès.`);
await prisma.$disconnect();
