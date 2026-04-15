import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });

const schema = z.object({
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_DOMAIN: z.string().optional(), // e.g. ".kin-sell.com" — enables cookie sharing across subdomains
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_SECRET: z.string().min(24),
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

  // ── Redis ──
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),

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

  // Secret partagé pour vérifier l'authenticité des callbacks webhook Mobile Money
  MOMO_WEBHOOK_SECRET: z.string().min(16).optional(),

  // ── PayPal ──
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_MERCHANT_EMAIL: z.string().default("filikifakio@gmail.com"),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("live"),
  PAYPAL_IPN_VERIFY_URL: z.string().default("https://ipnpb.paypal.com/cgi-bin/webscr"),
  PAYPAL_RETURN_URL: z.string().default("http://localhost:5173/forfaits?paid=1"),
  PAYPAL_CANCEL_URL: z.string().default("http://localhost:5173/forfaits?cancelled=1"),

  // ── SMTP (Email) ──
  SMTP_HOST: z.string().default("smtp.hostinger.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Kin-Sell <contact@kin-sell.com>"),

  // ── Google OAuth ──
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default("https://api.kin-sell.com/auth/google/callback"),

  // ── Apple OAuth ──
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_CALLBACK_URL: z.string().default("https://api.kin-sell.com/auth/apple/callback"),

  // ── Apple In-App Purchase ──
  APPLE_IAP_SHARED_SECRET: z.string().optional(),

  FRONTEND_URL: z.string().default("https://kin-sell.com"),
  MOBILE_APP_AUTH_CALLBACK: z.string().default("com.kinsell.app://auth/callback"),

  // ── Cloudflare Turnstile ──
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // ── AI Services ──
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ENABLE_OPENAI: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  ENABLE_GEMINI: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  MAX_AI_ADS_PER_DAY: z.coerce.number().min(0).max(20).default(2),
  AI_MODE: z.enum(["ECONOMY", "STANDARD", "FULL"]).default("ECONOMY"),

  // ── External Intelligence ──
  MARKET_REFRESH_TIME: z.string().default("00:00"),
  MARKET_REFRESH_TZ: z.string().default("Africa/Kinshasa"),
  WORLDBANK_API_URL: z.string().default("https://api.worldbank.org/v2"),
  FAOSTAT_API_URL: z.string().default("https://www.fao.org/faostat/api/v1"),
  OPEN_METEO_API_URL: z.string().default("https://api.open-meteo.com/v1"),
  ECB_DATA_API_URL: z.string().default("https://data-api.ecb.europa.eu/service"),
  JOOBLE_API_KEY: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_API_KEY: z.string().optional(),
  EXTERNAL_INTEL_TIMEOUT_MS: z.coerce.number().default(15000),
  EXTERNAL_INTEL_RETRY_COUNT: z.coerce.number().default(3),

  // ── Firebase (FCM push) ──
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
