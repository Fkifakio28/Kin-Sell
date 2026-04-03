import { PrismaClient } from "@prisma/client";
import { logger } from "../logger.js";

const isProd = process.env.NODE_ENV === "production";

export const prisma = new PrismaClient({
  // Pool connections: ~20 en prod via query string DATABASE_URL
  // En dev, log les queries lentes pour détecter N+1
  log: isProd
    ? [{ emit: "event", level: "error" }]
    : [
        { emit: "event", level: "query" },
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

  // Détecter les queries lentes (>200ms) — aide à trouver les N+1
  prisma.$on("query" as never, (e: any) => {
    if (e?.duration > 200) {
      logger.warn({ query: e.query?.slice(0, 200), duration: e.duration }, "Slow query detected (>200ms)");
    }
  });
}
