import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.chdir("/home/kinsell/Kin-Sell");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

// Find all SUPER_ADMINs
const admins = await p.user.findMany({
  where: { role: "SUPER_ADMIN" },
  select: { id: true, email: true, role: true }
});
console.log("ALL SUPER_ADMINS:", JSON.stringify(admins, null, 2));

// Delete any SUPER_ADMIN that is NOT fkifakio28@gmail.com
for (const admin of admins) {
  if (admin.email?.toLowerCase() !== "fkifakio28@gmail.com") {
    console.log("DELETING:", admin.email, admin.id);
    await p.auditLog.deleteMany({ where: { actorUserId: admin.id } });
    await p.user.delete({ where: { id: admin.id } });
    console.log("DELETED:", admin.email);
  }
}

// Verify
const remaining = await p.user.findMany({
  where: { role: "SUPER_ADMIN" },
  select: { id: true, email: true, role: true }
});
console.log("REMAINING SUPER_ADMINS:", JSON.stringify(remaining, null, 2));
await p.$disconnect();
