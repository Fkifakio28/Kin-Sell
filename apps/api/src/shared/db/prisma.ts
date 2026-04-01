import { PrismaClient } from "@prisma/client";
import { logger } from "../logger.js";

const isProd = process.env.NODE_ENV === "production";

export const prisma = new PrismaClient({
  log: isProd
    ? [{ emit: "event", level: "error" }]
    : [
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
});

prisma.$on("error" as never, (e: unknown) => {
  logger.error(e, "Prisma error");
});

if (!isProd) {
  prisma.$on("warn" as never, (e: unknown) => {
    logger.warn(e, "Prisma warning");
  });
}
