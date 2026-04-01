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

  // ── Mobile Money ──
  ORANGE_MONEY_CLIENT_ID: z.string().optional(),
  ORANGE_MONEY_CLIENT_SECRET: z.string().optional(),
  ORANGE_MONEY_MERCHANT_KEY: z.string().optional(),
  ORANGE_MONEY_BASE_URL: z.string().default("https://api.orange.com/orange-money-webpay/dev/v1"),
  ORANGE_MONEY_RETURN_URL: z.string().default("http://localhost:5173/payment/callback"),
  ORANGE_MONEY_CANCEL_URL: z.string().default("http://localhost:5173/payment/cancel"),
  ORANGE_MONEY_NOTIF_URL: z.string().default("http://localhost:4000/mobile-money/webhook/orange"),

  MPESA_API_KEY: z.string().optional(),
  MPESA_PUBLIC_KEY: z.string().optional(),
  MPESA_SERVICE_PROVIDER_CODE: z.string().optional(),
  MPESA_BASE_URL: z.string().default("https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomDRC"),
  MPESA_CALLBACK_URL: z.string().default("http://localhost:4000/mobile-money/webhook/mpesa"),

  // ── PayPal ──
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_MERCHANT_EMAIL: z.string().default("filikifakio@gmail.com"),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("live"),
  PAYPAL_IPN_VERIFY_URL: z.string().default("https://ipnpb.paypal.com/cgi-bin/webscr"),
  PAYPAL_RETURN_URL: z.string().default("http://localhost:5173/forfaits?paid=1"),
  PAYPAL_CANCEL_URL: z.string().default("http://localhost:5173/forfaits?cancelled=1"),

  // ── Google Maps ──
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
