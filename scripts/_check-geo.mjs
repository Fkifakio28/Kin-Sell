import { PrismaClient } from "../node_modules/@prisma/client/default.js";
const p = new PrismaClient();
const l = await p.listing.findMany({
  where: { isPublished: true, status: "ACTIVE" },
  select: { title: true, city: true, countryCode: true },
});
console.log("Active listings geo:", JSON.stringify(l, null, 2));
await p.$disconnect();
