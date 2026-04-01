import pino from "pino";

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
