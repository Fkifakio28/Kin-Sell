#!/bin/bash
# PURGE Kin-Sell — supprime toutes les données utilisateurs/IA internes
# CONSERVE : SUPER_ADMIN + tables externes (MarketProduct, MarketPrice, MarketJob,
# MarketSalary, MarketTrend, MarketSource, MarketCountry, MarketCity, External*,
# CategoryNegotiationRule, CurrencyRate, AiAgent, IncentivePolicy, SiteSetting,
# MarketProductCatalog, MarketTradeRoute, MarketBusinessInsight, MarketSeasonalPattern,
# MarketDataGap, KnowledgeBaseRefreshLog, ExternalDataSource, ExternalIngestionRun)
set -e
export PGPASSWORD='8765123490@28A28a28'
SUPER_ADMIN_ID='cmnktyws400005tmsqb5trsoc'

psql -h localhost -U kinsell -d kinsell_db -v ON_ERROR_STOP=1 <<SQL
BEGIN;

-- ── IA internes & analytics calculées sur Kin-Sell ──
TRUNCATE TABLE
  "AiRecommendation","AiTrial","AiAdCreative","AiAdCampaign","AiAdPlacement","AiAdPerformance",
  "AiMemorySnapshot","AiAutonomyLog","AiFreemiumUsage",
  "IncentiveCoupon","IncentiveCouponRedemption","IncentiveQuotaCounter",
  "GrowthIncentiveGrant","GrowthIncentiveEvent",
  "BoostCampaign","BoostMetric",
  "Promotion","PromotionItem","Vitrine","AdOffer","AdDonation","Advertisement",
  "MarketStats","ArbitrageOpportunity","InternalTransactionInsight","JobMarketSnapshot",
  "SoKinTrend","SoKinSuggestion",
  "UserKnowledgeIntent"
RESTART IDENTITY CASCADE;

-- MarketPrice : on vide complètement (sera reconstruit par scrapers externes au prochain cycle)
TRUNCATE TABLE "MarketPrice","MarketSalary" RESTART IDENTITY CASCADE;

-- Sécurité / signaux comportementaux
TRUNCATE TABLE
  "TrustScoreEvent","FraudSignal","SecurityEvent","UserRestriction",
  "MessageGuardLog","MessageGuardFragment",
  "RateLimitEntry"
RESTART IDENTITY CASCADE;

-- Emploi
TRUNCATE TABLE
  "JobApplication","JobListing","UserQualification","UserExperience"
RESTART IDENTITY CASCADE;

-- So-Kin user-generated
TRUNCATE TABLE
  "SoKinStoryView","SoKinStory","SoKinEvent","SoKinReport","SoKinBookmark","SoKinReaction",
  "SoKinLiveChat","SoKinLiveParticipant","SoKinLive","SoKinComment","SoKinPost",
  "SoKinConnection","BusinessFollow","UserContact"
RESTART IDENTITY CASCADE;

-- Avis & vérifications
TRUNCATE TABLE
  "UserReview","VerificationHistory","VerificationRequest"
RESTART IDENTITY CASCADE;

-- Commerce (ordre FK)
TRUNCATE TABLE
  "OrderItem","Order",
  "CartItem","Cart",
  "NegotiationOffer","Negotiation","NegotiationBundleItem","NegotiationBundle",
  "Listing",
  "BusinessShop","BusinessAccount",
  "SubscriptionAddon","Subscription",
  "PaymentOrder","MobileMoneyPayment",
  "WalletTransaction","Wallet"
RESTART IDENTITY CASCADE;

-- Messages & notifications
TRUNCATE TABLE
  "MessageReadReceipt","Message","ConversationParticipant","Conversation",
  "CallLog","Notification","PushSubscription","FcmToken","VerificationCode"
RESTART IDENTITY CASCADE;

-- Logs & contenus user
TRUNCATE TABLE "Report","BlogPost","AuditLog" RESTART IDENTITY CASCADE;

-- Users : tout sauf SUPER_ADMIN
DELETE FROM "UserSession"     WHERE "userId" <> '${SUPER_ADMIN_ID}';
DELETE FROM "UserIdentity"    WHERE "userId" <> '${SUPER_ADMIN_ID}';
DELETE FROM "UserPreference"  WHERE "userId" <> '${SUPER_ADMIN_ID}';
DELETE FROM "UserProfile"     WHERE "userId" <> '${SUPER_ADMIN_ID}';
DELETE FROM "AdminProfile"    WHERE "userId" <> '${SUPER_ADMIN_ID}';
DELETE FROM "User"             WHERE id       <> '${SUPER_ADMIN_ID}';

COMMIT;

-- Vérifications post-purge
SELECT 'Users restants:' AS label, COUNT(*) FROM "User";
SELECT 'Listings:' AS label, COUNT(*) FROM "Listing";
SELECT 'Orders:' AS label, COUNT(*) FROM "Order";
SELECT 'SoKinPosts:' AS label, COUNT(*) FROM "SoKinPost";
SELECT 'MarketPrice (externe à recharger):' AS label, COUNT(*) FROM "MarketPrice";
SELECT 'MarketProduct (catalogue gardé):' AS label, COUNT(*) FROM "MarketProduct";
SELECT 'MarketCity (gardé):' AS label, COUNT(*) FROM "MarketCity";
SELECT 'CategoryNegotiationRule (gardé):' AS label, COUNT(*) FROM "CategoryNegotiationRule";
SELECT 'AiAgent (gardé):' AS label, COUNT(*) FROM "AiAgent";
SELECT id, email, role FROM "User";
SQL

echo "─── Vidage uploads ───"
find /home/kinsell/Kin-Sell/apps/api/uploads/ -type f -delete 2>/dev/null || true
ls -la /home/kinsell/Kin-Sell/apps/api/uploads/

echo "✅ PURGE TERMINÉE"
