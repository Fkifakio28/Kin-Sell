import pino from "pino";
import crypto from "node:crypto";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: isDev ? "debug" : "info",
  transport: isDev
    ? { target: "pino/file", options: { destination: 1 } }
    : undefined,
  ...(isDev
    ? {}
    : {
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

/** Génère un ID de corrélation pour tracer les requêtes à travers les logs */
export function genRequestId(): string {
  return crypto.randomUUID();
}
