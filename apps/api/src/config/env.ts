import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });

const schema = z.object({
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("7d"),
  REFRESH_TOKEN_SECRET: z.string().min(24).default("kinsell-refresh-secret-change-me-in-prod-please"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("30d"),
  OTP_TTL_SECONDS: z.coerce.number().min(60).max(900).default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().min(3).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().min(30).max(300).default(60),
  BILLING_TRANSFER_ORDER_TTL_HOURS: z.coerce.number().min(1).max(168).default(72),
  BILLING_TRANSFER_BENEFICIARY_IBAN: z.string().default("FR7616598000012725637000125"),
  BILLING_TRANSFER_BENEFICIARY_BIC: z.string().default("FPELFR21XXX"),
  BILLING_TRANSFER_BENEFICIARY_RIB: z.string().default("FR76"),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(10).optional(),
  SUPER_ADMIN_DISPLAY_NAME: z.string().min(3).optional(),
  VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().default("mailto:contact@kin-sell.com"),
});

export const env = schema.parse(process.env);
