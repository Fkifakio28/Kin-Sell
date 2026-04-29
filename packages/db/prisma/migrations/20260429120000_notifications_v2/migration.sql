-- Notifications v2 : modèle persistant + préférences granulaires
-- Étape 1 du chantier "notifications transactions" (29 avril 2026)

-- 1) Nouvel enum NotificationCategory
CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'NEGOTIATION', 'PAYMENT', 'MESSAGE', 'SOCIAL', 'SYSTEM', 'AI', 'PROMO');

-- 2) Préférences granulaires sur UserPreference
ALTER TABLE "UserPreference"
  ADD COLUMN "notifyOrderEmail"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyOrderPush"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyOrderInApp"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyNegotiationEmail"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyNegotiationPush"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyNegotiationInApp"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyPaymentEmail"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyPaymentPush"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyPaymentInApp"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMessageEmail"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifyMessagePush"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMessageInApp"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySocialEmail"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifySocialPush"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySocialInApp"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySystemEmail"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySystemPush"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySystemInApp"       BOOLEAN NOT NULL DEFAULT true;

-- 3) Table Notification
CREATE TABLE "Notification" (
  "id"         TEXT                   NOT NULL,
  "userId"     TEXT                   NOT NULL,
  "category"   "NotificationCategory" NOT NULL,
  "type"       TEXT                   NOT NULL,
  "title"      TEXT                   NOT NULL,
  "body"       TEXT                   NOT NULL,
  "data"       JSONB,
  "url"        TEXT,
  "icon"       TEXT,
  "readAt"     TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "emailSent"  BOOLEAN                NOT NULL DEFAULT false,
  "pushSent"   BOOLEAN                NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt");

CREATE INDEX "Notification_userId_category_createdAt_idx"
  ON "Notification"("userId", "category", "createdAt");

CREATE INDEX "Notification_userId_archivedAt_idx"
  ON "Notification"("userId", "archivedAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
