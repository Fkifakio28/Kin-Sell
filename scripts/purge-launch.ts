/**
 * SCRIPT DE PURGE LANCEMENT — Kin-Sell
 *
 * Supprime toutes les données de test et prépare la base pour le lancement officiel.
 *
 * CONSERVE :
 *  ✅ Super Admin (filikifakio@gmail.com)
 *  ✅ Knowledge Base externe (MarketProductCatalog, TradeRoutes, BusinessInsights, SeasonalPatterns)
 *  ✅ Agents IA (AiAgent)
 *  ✅ Configuration pays/villes (MarketCountry, MarketCity)
 *  ✅ Paramètres site (SiteSetting)
 *  ✅ Taux de change (CurrencyRate)
 *
 * SUPPRIME :
 *  🗑️ Tous les utilisateurs (sauf SUPER_ADMIN)
 *  🗑️ Tous les listings, commandes, négociations
 *  🗑️ Historiques de transactions internes (repartir à zéro)
 *  🗑️ Publications So-Kin, stories, tendances
 *  🗑️ Messages, notifications
 *  🗑️ Abonnements, paiements
 *  🗑️ Avis, signalements, vérifications
 *  🗑️ Logs d'autonomie IA, snapshots mémoire
 *  🗑️ MarketStats (sera recalculé par le refresh depuis vrais listings)
 *
 * Usage:
 *   npx tsx scripts/purge-launch.ts
 *   npx tsx scripts/purge-launch.ts --confirm
 *
 * ATTENTION : Cette opération est IRRÉVERSIBLE.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes("--confirm");

async function main() {
  console.log("═".repeat(60));
  console.log("🚀 PURGE LANCEMENT KIN-SELL");
  console.log("═".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠️  MODE SIMULATION (dry run)");
    console.log("   Ajoutez --confirm pour exécuter réellement la purge.\n");
  } else {
    console.log("\n🔴 MODE PRODUCTION — Suppression réelle des données !\n");
  }

  // Vérifier le super admin
  const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!superAdmin) {
    console.error("❌ Aucun Super Admin trouvé. Exécutez le seed principal d'abord.");
    process.exit(1);
  }
  console.log(`✅ Super Admin identifié : ${superAdmin.email} (${superAdmin.id})`);

  // Compter avant purge
  const counts: Record<string, number> = {};
  counts["Users (non-admin)"] = await prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } });
  counts["Listings"] = await prisma.listing.count();
  counts["Orders"] = await prisma.order.count();
  counts["Negotiations"] = await prisma.negotiation.count();
  counts["Subscriptions"] = await prisma.subscription.count();
  counts["SoKin Posts"] = await prisma.soKinPost.count();
  counts["SoKin Events"] = await prisma.soKinEvent.count();
  counts["Internal Insights"] = await prisma.internalTransactionInsight.count();

  // Compter ce qui est conservé
  const preserved: Record<string, number> = {};
  preserved["KB Products"] = await prisma.marketProductCatalog.count();
  preserved["KB Trade Routes"] = await prisma.marketTradeRoute.count();
  preserved["KB Business Insights"] = await prisma.marketBusinessInsight.count();
  preserved["KB Seasonal Patterns"] = await prisma.marketSeasonalPattern.count();
  preserved["AI Agents"] = await prisma.aiAgent.count();
  preserved["Market Countries"] = await prisma.marketCountry.count();
  preserved["Market Cities"] = await prisma.marketCity.count();

  console.log("\n📊 Données à SUPPRIMER :");
  for (const [key, count] of Object.entries(counts)) {
    console.log(`   🗑️  ${key}: ${count}`);
  }

  console.log("\n📦 Données à CONSERVER :");
  for (const [key, count] of Object.entries(preserved)) {
    console.log(`   ✅ ${key}: ${count}`);
  }

  if (DRY_RUN) {
    console.log("\n✋ Fin de simulation. Utilisez --confirm pour exécuter.");
    return;
  }

  console.log("\n🔄 Purge en cours...\n");

  // Ordre de suppression respectant les FK cascades
  const steps: Array<{ name: string; fn: () => Promise<any> }> = [
    // Couche événements/analytics
    { name: "SoKinEvent", fn: () => prisma.soKinEvent.deleteMany() },
    { name: "SoKinStory", fn: () => prisma.soKinStory.deleteMany() },
    { name: "SoKinTrend", fn: () => prisma.soKinTrend.deleteMany() },
    // IA logs
    { name: "AiAutonomyLog", fn: () => prisma.aiAutonomyLog.deleteMany() },
    { name: "AiMemorySnapshot", fn: () => prisma.aiMemorySnapshot.deleteMany() },
    { name: "AiRecommendation", fn: () => prisma.aiRecommendation.deleteMany() },
    { name: "AiTrial", fn: () => prisma.aiTrial.deleteMany() },
    { name: "AiAdCreative", fn: () => prisma.aiAdCreative.deleteMany() },
    { name: "AiAdCampaign", fn: () => prisma.aiAdCampaign.deleteMany() },
    // Transactions
    { name: "NegotiationOffer", fn: () => prisma.negotiationOffer.deleteMany() },
    { name: "Negotiation", fn: () => prisma.negotiation.deleteMany() },
    { name: "NegotiationBundle", fn: () => prisma.negotiationBundle.deleteMany() },
    { name: "OrderItem", fn: () => prisma.orderItem.deleteMany() },
    { name: "Order", fn: () => prisma.order.deleteMany() },
    // Promotions
    { name: "PromotionItem", fn: () => prisma.promotionItem.deleteMany() },
    { name: "Promotion", fn: () => prisma.promotion.deleteMany() },
    // Paiements
    { name: "MobileMoneyPayment", fn: () => prisma.mobileMoneyPayment.deleteMany() },
    { name: "PaymentOrder", fn: () => prisma.paymentOrder.deleteMany() },
    { name: "SubscriptionAddon", fn: () => prisma.subscriptionAddon.deleteMany() },
    { name: "Subscription", fn: () => prisma.subscription.deleteMany() },
    // Trust & Sécurité
    { name: "TrustScoreEvent", fn: () => prisma.trustScoreEvent.deleteMany() },
    { name: "FraudSignal", fn: () => prisma.fraudSignal.deleteMany() },
    { name: "SecurityEvent", fn: () => prisma.securityEvent.deleteMany() },
    { name: "VerificationHistory", fn: () => prisma.verificationHistory.deleteMany() },
    { name: "VerificationRequest", fn: () => prisma.verificationRequest.deleteMany() },
    // Contenu
    { name: "Listing", fn: () => prisma.listing.deleteMany() },
    { name: "Vitrine", fn: () => prisma.vitrine.deleteMany() },
    // Données internes KB (reset pour repartir de zéro)
    { name: "InternalTransactionInsight", fn: () => prisma.internalTransactionInsight.deleteMany() },
    { name: "MarketStats", fn: () => prisma.marketStats.deleteMany() },
    { name: "KnowledgeBaseRefreshLog", fn: () => prisma.knowledgeBaseRefreshLog.deleteMany() },
  ];

  let cleared = 0;
  for (const step of steps) {
    try {
      const result = await step.fn();
      const count = typeof result === "object" && "count" in result ? result.count : "?";
      console.log(`   ✅ ${step.name} — ${count} supprimé(s)`);
      cleared++;
    } catch (err) {
      console.error(`   ❌ ${step.name} — ${(err as Error).message}`);
    }
  }

  // Supprimer les utilisateurs non-SuperAdmin
  const deletedUsers = await prisma.user.deleteMany({
    where: { role: { not: "SUPER_ADMIN" } },
  });
  console.log(`   ✅ Users (non-admin) — ${deletedUsers.count} supprimé(s)`);

  console.log("\n" + "═".repeat(60));
  console.log(`🎉 Purge terminée — ${cleared + 1} tables nettoyées`);
  console.log(`📦 Conservé : KB externe (${preserved["KB Products"]} produits, ${preserved["KB Trade Routes"]} routes), ${preserved["AI Agents"]} agents IA`);
  console.log(`👑 Super Admin : ${superAdmin.email} (intact)`);
  console.log("═".repeat(60));
  console.log("\n💡 Prochaines étapes :");
  console.log("   1. Vérifiez que la KB externe est intacte : npx tsx packages/db/prisma/seed-knowledge-base.ts");
  console.log("   2. Lancez l'application — les IA démarreront avec la base externe");
  console.log("   3. Les données internes s'enrichiront automatiquement via le cron de minuit");
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
