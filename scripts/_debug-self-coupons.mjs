import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const coupons = await p.incentiveCoupon.findMany({
  where: { metadata: { path: ["selfConvert"], equals: true } },
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    code: true,
    recipientUserId: true,
    issuedById: true,
    status: true,
    expiresAt: true,
    usedCount: true,
    maxUses: true,
    maxUsesPerUser: true,
    metadata: true,
    createdAt: true,
  },
});
for (const c of coupons) {
  const user = c.recipientUserId
    ? await p.user.findUnique({ where: { id: c.recipientUserId }, select: { id: true, email: true, role: true } })
    : null;
  console.log("──");
  console.log("code:", c.code);
  console.log("recipientUserId:", c.recipientUserId);
  console.log("user in DB:", user);
  console.log("status:", c.status, "expires:", c.expiresAt, "used:", c.usedCount, "/", c.maxUses);
  console.log("metadata:", JSON.stringify(c.metadata));
}
await p.$disconnect();
