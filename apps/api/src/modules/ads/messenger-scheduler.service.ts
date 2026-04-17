/**
 * MESSENGER SCHEDULER — Campagnes proactives autonomes
 *
 * Rend l'IA Messager véritablement autonome :
 * - Re-engagement des utilisateurs inactifs
 * - Rappels de coupons expirant bientôt
 * - Welcome flow pour nouveaux inscrits
 * - Digest hebdomadaire marketplace
 * - Frequency capping global anti-spam
 *
 * Cycles :
 * - Toutes les 2h : Rappels coupons + re-engagement
 * - Toutes les 24h (9h) : Welcome flow + digest hebdo (dimanche)
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import {
  sendPromoEmail,
  sendPromoPush,
  type PromoReason,
} from "./ia-messenger-promo.service.js";

// ─────────────────────────────────────────────
// Scheduler enable guard
// ─────────────────────────────────────────────

async function isMessengerEnabled(): Promise<boolean> {
  const agent = await prisma.aiAgent.findFirst({ where: { name: "IA_MESSENGER" } });
  return agent?.enabled !== false;
}

// ─────────────────────────────────────────────
// Frequency Capping
// ─────────────────────────────────────────────

const FREQ_CAP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const FREQ_CAP_MAX_PER_DAY = 3;
const FREQ_CAP_MAX_PER_WEEK = 8;
const FREQ_CAP_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Vérifie si un utilisateur a atteint la limite de messages reçus.
 * Retourne true si le cap est atteint (ne pas envoyer).
 */
export async function isFrequencyCapped(userId: string): Promise<boolean> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - FREQ_CAP_WINDOW_MS);
  const weekAgo = new Date(now.getTime() - FREQ_CAP_WEEK_MS);

  const [dailyCount, weeklyCount] = await Promise.all([
    prisma.aiAutonomyLog.count({
      where: {
        agentName: "IA_MESSENGER",
        targetUserId: userId,
        createdAt: { gte: dayAgo },
        success: true,
      },
    }),
    prisma.aiAutonomyLog.count({
      where: {
        agentName: "IA_MESSENGER",
        targetUserId: userId,
        createdAt: { gte: weekAgo },
        success: true,
      },
    }),
  ]);

  if (dailyCount >= FREQ_CAP_MAX_PER_DAY) {
    logger.debug({ userId, dailyCount }, "[Messenger] Frequency cap daily atteint");
    return true;
  }
  if (weeklyCount >= FREQ_CAP_MAX_PER_WEEK) {
    logger.debug({ userId, weeklyCount }, "[Messenger] Frequency cap weekly atteint");
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// Batch helpers — eliminate N+1 queries
// ─────────────────────────────────────────────

/**
 * Pre-fetch frequency cap counts for a batch of userIds.
 * Returns Set of userIds that are capped.
 */
async function batchFrequencyCap(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - FREQ_CAP_WINDOW_MS);
  const weekAgo = new Date(now.getTime() - FREQ_CAP_WEEK_MS);

  const [dailyCounts, weeklyCounts] = await Promise.all([
    prisma.aiAutonomyLog.groupBy({
      by: ["targetUserId"],
      where: {
        agentName: "IA_MESSENGER",
        targetUserId: { in: userIds },
        createdAt: { gte: dayAgo },
        success: true,
      },
      _count: true,
    }),
    prisma.aiAutonomyLog.groupBy({
      by: ["targetUserId"],
      where: {
        agentName: "IA_MESSENGER",
        targetUserId: { in: userIds },
        createdAt: { gte: weekAgo },
        success: true,
      },
      _count: true,
    }),
  ]);

  const capped = new Set<string>();
  const dailyMap = new Map(dailyCounts.map((d) => [d.targetUserId, d._count]));
  const weeklyMap = new Map(weeklyCounts.map((d) => [d.targetUserId, d._count]));
  for (const uid of userIds) {
    if ((dailyMap.get(uid) ?? 0) >= FREQ_CAP_MAX_PER_DAY) capped.add(uid);
    else if ((weeklyMap.get(uid) ?? 0) >= FREQ_CAP_MAX_PER_WEEK) capped.add(uid);
  }
  return capped;
}

/**
 * Pre-fetch idempotency for a batch: which (actionType, userId, identifier) combos already exist.
 * Returns Set of `userId` that already have a matching log.
 */
async function batchIdempotencyCheck(
  actionType: string,
  entries: { userId: string; identifier: string }[],
): Promise<Set<string>> {
  if (entries.length === 0) return new Set();
  const userIds = entries.map((e) => e.userId);

  const existingLogs = await prisma.aiAutonomyLog.findMany({
    where: {
      agentName: "IA_MESSENGER",
      actionType,
      targetUserId: { in: userIds },
    },
    select: { targetUserId: true, decision: true },
  });

  const alreadySent = new Set<string>();
  for (const entry of entries) {
    const match = existingLogs.find(
      (l) =>
        l.targetUserId === entry.userId &&
        (!entry.identifier || l.decision?.includes(entry.identifier)),
    );
    if (match) alreadySent.add(entry.userId);
  }
  return alreadySent;
}

// ─────────────────────────────────────────────
// Scheduler State
// ─────────────────────────────────────────────

let _schedulerRunning = false;
let _intervals: ReturnType<typeof setInterval>[] = [];
let _timeouts: ReturnType<typeof setTimeout>[] = [];

// ─────────────────────────────────────────────
// Campagne 1 : Rappel coupons expirant bientôt
// ─────────────────────────────────────────────

/**
 * Envoie un rappel aux utilisateurs dont le coupon expire dans 48h.
 * Idempotent : un seul rappel par coupon.
 */
export async function runCouponExpiryReminders(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Coupons actifs qui expirent dans les 48h, pas encore rappelés
  const expiringCoupons = await prisma.incentiveCoupon.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gte: now, lte: in48h },
      recipientUserId: { not: null },
    },
    select: {
      id: true,
      code: true,
      discountPercent: true,
      expiresAt: true,
      recipientUserId: true,
    },
    take: 50,
  });

  const validCoupons = expiringCoupons.filter((c) => c.recipientUserId);
  const userIds = validCoupons.map((c) => c.recipientUserId!);

  // Batch pre-fetch: 2 queries instead of 3N
  const [alreadyRemindedSet, cappedSet] = await Promise.all([
    batchIdempotencyCheck(
      "COUPON_EXPIRY_REMINDER",
      validCoupons.map((c) => ({ userId: c.recipientUserId!, identifier: c.code })),
    ),
    batchFrequencyCap(userIds),
  ]);

  let sent = 0;
  let skipped = 0;

  for (const coupon of validCoupons) {
    if (!coupon.recipientUserId) { skipped++; continue; }
    if (alreadyRemindedSet.has(coupon.recipientUserId)) { skipped++; continue; }
    if (cappedSet.has(coupon.recipientUserId)) { skipped++; continue; }

    const expiresLabel = coupon.expiresAt.toLocaleDateString("fr-FR");
    const htmlBody = `
      <p>Votre code promo <strong>${coupon.code}</strong> expire bientôt !</p>
      <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <p style="color:#ff6b6b;font-size:14px;margin:0 0 8px;">⏰ Expire le ${expiresLabel}</p>
        <p style="color:#fff;font-size:24px;font-weight:bold;margin:0;letter-spacing:2px;">${coupon.code}</p>
        <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:8px 0 0;">
          -${coupon.discountPercent}% de réduction
        </p>
      </div>
      <p>Utilisez-le sur <a href="https://kin-sell.com/forfaits" style="color:#6f58ff;">Forfaits</a> avant qu'il n'expire.</p>`;

    const emailOk = await sendPromoEmail(
      coupon.recipientUserId,
      `⏰ Votre code -${coupon.discountPercent}% expire bientôt !`,
      htmlBody,
      "SUBSCRIPTION_PROMO" as PromoReason,
    );

    if (!emailOk) {
      await sendPromoPush(
        coupon.recipientUserId,
        `Code promo -${coupon.discountPercent}% expire bientôt`,
        `Votre code ${coupon.code} expire le ${expiresLabel}. Utilisez-le maintenant !`,
        "SUBSCRIPTION_PROMO" as PromoReason,
      );
    }

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "COUPON_EXPIRY_REMINDER",
        targetUserId: coupon.recipientUserId,
        decision: `Rappel: ${coupon.code} expire ${expiresLabel}`,
        reasoning: `Coupon -${coupon.discountPercent}% expire dans < 48h`,
        success: true,
      },
    });
    sent++;
  }

  if (sent > 0) {
    logger.info({ sent, skipped }, "[Messenger] Rappels coupons expirants envoyés");
  }
  return { sent, skipped };
}

// ─────────────────────────────────────────────
// Campagne 2 : Re-engagement utilisateurs inactifs
// ─────────────────────────────────────────────

/**
 * Contacte les utilisateurs inactifs depuis 14+ jours qui ont un profil completé.
 * Un seul message de re-engagement par user par mois.
 */
export async function runInactiveUserReengagement(): Promise<{ sent: number; skipped: number }> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // Users inactifs (pas de listing/order/login récent) mais profil complété
  const inactiveUsers = await prisma.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      profileCompleted: true,
      email: { not: null },
      updatedAt: { lt: fourteenDaysAgo },
      listings: { none: { createdAt: { gte: fourteenDaysAgo } } },
      buyerOrders: { none: { createdAt: { gte: fourteenDaysAgo } } },
    },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
    take: 30,
  });

  const userIds = inactiveUsers.map((u) => u.id);

  // Batch pre-fetch: 2 queries instead of 3N
  const [alreadySentSet, cappedSet] = await Promise.all([
    batchIdempotencyCheck(
      "REENGAGEMENT",
      userIds.map((uid) => ({ userId: uid, identifier: monthKey })),
    ),
    batchFrequencyCap(userIds),
  ]);

  let sent = 0;
  let skipped = 0;

  for (const user of inactiveUsers) {
    if (alreadySentSet.has(user.id)) { skipped++; continue; }
    if (cappedSet.has(user.id)) { skipped++; continue; }

    const name = user.profile?.displayName ?? "cher utilisateur";
    const htmlBody = `
      <p>Bonjour ${name} 👋</p>
      <p>Ça fait un moment qu'on ne vous a pas vu sur Kin-Sell ! La marketplace regorge de nouvelles opportunités.</p>
      <div style="background:rgba(111,88,255,0.1);border-radius:8px;padding:16px;margin:16px 0;">
        <p style="color:#e0d8ff;margin:0 0 8px;">🔥 Ce qui a changé :</p>
        <ul style="color:#e0d8ff;margin:0;padding-left:20px;">
          <li>De nouveaux articles publiés chaque jour</li>
          <li>Des offres exclusives pour les membres actifs</li>
          <li>Des outils IA pour booster vos ventes</li>
        </ul>
      </div>
      <p><a href="https://kin-sell.com/explorer" style="color:#6f58ff;font-weight:bold;">Revenir sur Kin-Sell →</a></p>`;

    const emailOk = await sendPromoEmail(
      user.id,
      `${name}, revenez découvrir les nouveautés !`,
      htmlBody,
      "TRENDING" as PromoReason,
    );

    if (!emailOk) {
      await sendPromoPush(
        user.id,
        "Vous nous manquez !",
        `${name}, découvrez les dernières offres sur Kin-Sell.`,
        "TRENDING" as PromoReason,
      );
    }

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "REENGAGEMENT",
        targetUserId: user.id,
        decision: `Re-engagement ${monthKey}`,
        reasoning: `Inactif depuis > 14j, profil complété`,
        success: true,
      },
    });
    sent++;
  }

  if (sent > 0) {
    logger.info({ sent, skipped }, "[Messenger] Re-engagement utilisateurs inactifs");
  }
  return { sent, skipped };
}

// ─────────────────────────────────────────────
// Campagne 3 : Welcome flow — nouveaux inscrits
// ─────────────────────────────────────────────

/**
 * Envoie un message de bienvenue aux utilisateurs inscrits depuis 24-72h
 * qui n'ont pas encore publié d'annonce ni acheté.
 */
export async function runWelcomeFlow(): Promise<{ sent: number; skipped: number }> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const newUsers = await prisma.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      email: { not: null },
      createdAt: { gte: threeDaysAgo, lte: dayAgo },
      listings: { none: {} },
      buyerOrders: { none: {} },
    },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
      role: true,
    },
    take: 20,
  });

  const userIds = newUsers.map((u) => u.id);

  // Batch pre-fetch: 2 queries instead of 3N
  const [alreadySentSet, cappedSet] = await Promise.all([
    batchIdempotencyCheck(
      "WELCOME_FLOW",
      userIds.map((uid) => ({ userId: uid, identifier: "" })),
    ),
    batchFrequencyCap(userIds),
  ]);

  let sent = 0;
  let skipped = 0;

  for (const user of newUsers) {
    if (alreadySentSet.has(user.id)) { skipped++; continue; }
    if (cappedSet.has(user.id)) { skipped++; continue; }

    const name = user.profile?.displayName ?? "cher membre";
    const isSeller = user.role === "BUSINESS";

    const htmlBody = isSeller
      ? `
        <p>Bienvenue sur Kin-Sell, ${name} ! 🎉</p>
        <p>Vous êtes vendeur ? Voici comment démarrer en force :</p>
        <div style="background:rgba(111,88,255,0.1);border-radius:8px;padding:16px;margin:16px 0;">
          <ol style="color:#e0d8ff;margin:0;padding-left:20px;">
            <li><strong>Publiez votre première annonce</strong> — c'est rapide et gratuit</li>
            <li><strong>Complétez votre profil</strong> — les acheteurs préfèrent les profils vérifiés</li>
            <li><strong>Découvrez les Forfaits</strong> — boostez votre visibilité avec l'IA</li>
          </ol>
        </div>
        <p><a href="https://kin-sell.com/publier" style="color:#6f58ff;font-weight:bold;">Publier une annonce →</a></p>`
      : `
        <p>Bienvenue sur Kin-Sell, ${name} ! 🎉</p>
        <p>Explorez la marketplace de Kinshasa :</p>
        <div style="background:rgba(111,88,255,0.1);border-radius:8px;padding:16px;margin:16px 0;">
          <ol style="color:#e0d8ff;margin:0;padding-left:20px;">
            <li><strong>Explorez les catégories</strong> — trouvez ce que vous cherchez</li>
            <li><strong>Contactez les vendeurs</strong> — négociez directement</li>
            <li><strong>Activez les notifications</strong> — soyez alerté des bonnes affaires</li>
          </ol>
        </div>
        <p><a href="https://kin-sell.com/explorer" style="color:#6f58ff;font-weight:bold;">Explorer →</a></p>`;

    const emailOk = await sendPromoEmail(
      user.id,
      `Bienvenue sur Kin-Sell, ${name} !`,
      htmlBody,
      "NEW_FEATURE" as PromoReason,
    );

    if (!emailOk) {
      await sendPromoPush(
        user.id,
        "Bienvenue sur Kin-Sell !",
        `${name}, découvrez comment ${isSeller ? "vendre" : "acheter"} sur Kin-Sell.`,
        "NEW_FEATURE" as PromoReason,
      );
    }

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "WELCOME_FLOW",
        targetUserId: user.id,
        decision: `Welcome email sent to ${isSeller ? "seller" : "buyer"}`,
        reasoning: `Inscrit depuis 24-72h, aucune activité`,
        success: true,
      },
    });
    sent++;
  }

  if (sent > 0) {
    logger.info({ sent, skipped }, "[Messenger] Welcome flow envoyé");
  }
  return { sent, skipped };
}

// ─────────────────────────────────────────────
// Campagne 4 : Digest hebdomadaire (dimanche)
// ─────────────────────────────────────────────

/**
 * Envoie un résumé hebdomadaire aux vendeurs actifs.
 * Uniquement le dimanche.
 */
export async function runWeeklyDigest(): Promise<{ sent: number; skipped: number }> {
  // Ne tourner que le dimanche
  if (new Date().getDay() !== 0) return { sent: 0, skipped: 0 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekKey = `digest-${new Date().toISOString().slice(0, 10)}`;

  // Vendeurs actifs (ont au moins 1 listing actif)
  const sellers = await prisma.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      email: { not: null },
      listings: { some: { status: "ACTIVE" } },
    },
    select: {
      id: true,
      profile: { select: { displayName: true } },
      listings: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      sellerOrders: {
        where: { createdAt: { gte: weekAgo } },
        select: { id: true, totalUsdCents: true },
      },
    },
    take: 50,
  });

  const sellerIds = sellers.map((s) => s.id);

  // Batch pre-fetch: 2 queries instead of 3N
  const [alreadySentSet, cappedSet] = await Promise.all([
    batchIdempotencyCheck(
      "WEEKLY_DIGEST",
      sellerIds.map((uid) => ({ userId: uid, identifier: weekKey })),
    ),
    batchFrequencyCap(sellerIds),
  ]);

  let sent = 0;
  let skipped = 0;

  for (const seller of sellers) {
    if (alreadySentSet.has(seller.id)) { skipped++; continue; }
    if (cappedSet.has(seller.id)) { skipped++; continue; }

    const name = seller.profile?.displayName ?? "Vendeur";
    const activeListings = seller.listings.length;
    const weekOrders = seller.sellerOrders.length;
    const weekRevenue = seller.sellerOrders.reduce((s: number, o: { totalUsdCents: number }) => s + (o.totalUsdCents ?? 0), 0);
    const revenueLabel = weekRevenue > 0 ? `$${(weekRevenue / 100).toFixed(2)}` : "$0.00";

    const htmlBody = `
      <p>Bonjour ${name}, voici votre résumé de la semaine :</p>
      <div style="background:rgba(111,88,255,0.1);border-radius:8px;padding:16px;margin:16px 0;">
        <table style="width:100%;color:#e0d8ff;">
          <tr>
            <td style="padding:8px;text-align:center;">
              <p style="font-size:24px;font-weight:bold;color:#6f58ff;margin:0;">${activeListings}</p>
              <p style="font-size:12px;margin:4px 0 0;">Annonces actives</p>
            </td>
            <td style="padding:8px;text-align:center;">
              <p style="font-size:24px;font-weight:bold;color:#6f58ff;margin:0;">${weekOrders}</p>
              <p style="font-size:12px;margin:4px 0 0;">Commandes cette semaine</p>
            </td>
            <td style="padding:8px;text-align:center;">
              <p style="font-size:24px;font-weight:bold;color:#6f58ff;margin:0;">${revenueLabel}</p>
              <p style="font-size:12px;margin:4px 0 0;">Revenus</p>
            </td>
          </tr>
        </table>
      </div>
      ${weekOrders === 0 ? '<p>💡 <strong>Conseil :</strong> Boostez vos annonces pour augmenter votre visibilité cette semaine !</p>' : '<p>🎉 Beau travail ! Continuez sur cette lancée.</p>'}
      <p><a href="https://kin-sell.com/compte/annonces" style="color:#6f58ff;font-weight:bold;">Gérer mes annonces →</a></p>`;

    const emailOk = await sendPromoEmail(
      seller.id,
      `📊 ${name}, votre semaine sur Kin-Sell`,
      htmlBody,
      "TRENDING" as PromoReason,
    );

    if (!emailOk) {
      await sendPromoPush(
        seller.id,
        "Votre résumé hebdo",
        `${name}: ${weekOrders} commande(s) cette semaine, ${activeListings} annonces actives.`,
        "TRENDING" as PromoReason,
      );
    }

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "WEEKLY_DIGEST",
        targetUserId: seller.id,
        decision: `Digest ${weekKey} | ${weekOrders} orders, ${revenueLabel}`,
        reasoning: `Vendeur actif, ${activeListings} listings`,
        success: true,
      },
    });
    sent++;
  }

  if (sent > 0) {
    logger.info({ sent, skipped }, "[Messenger] Digest hebdomadaire envoyé");
  }
  return { sent, skipped };
}

// ─────────────────────────────────────────────
// Campagne 5 : Notification première vente
// ─────────────────────────────────────────────

/**
 * Félicite les vendeurs qui ont fait leur première vente récemment.
 */
export async function runFirstSaleCongrats(): Promise<{ sent: number; skipped: number }> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Vendeurs dont la première commande a été créée dans les 24h
  const firstSaleUsers = await prisma.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      email: { not: null },
      listings: { some: {} },
      sellerOrders: { some: { createdAt: { gte: dayAgo } } },
    },
    select: {
      id: true,
      profile: { select: { displayName: true } },
      _count: { select: { sellerOrders: true } },
    },
    take: 20,
  });

  // Pre-filter by order count, then batch checks
  const eligibleSellers = firstSaleUsers.filter((s) => s._count.sellerOrders <= 2);
  const sellerIds = eligibleSellers.map((s) => s.id);

  // Batch pre-fetch: 2 queries instead of 3N
  const [alreadySentSet, cappedSet] = await Promise.all([
    batchIdempotencyCheck(
      "FIRST_SALE_CONGRATS",
      sellerIds.map((uid) => ({ userId: uid, identifier: "" })),
    ),
    batchFrequencyCap(sellerIds),
  ]);

  let sent = 0;
  let skipped = firstSaleUsers.length - eligibleSellers.length;

  for (const seller of eligibleSellers) {
    if (alreadySentSet.has(seller.id)) { skipped++; continue; }
    if (cappedSet.has(seller.id)) { skipped++; continue; }

    const name = seller.profile?.displayName ?? "Vendeur";
    const htmlBody = `
      <p>Félicitations ${name} ! 🎉🎊</p>
      <p>Vous venez de réaliser votre première vente sur Kin-Sell !</p>
      <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <p style="color:#6f58ff;font-size:40px;margin:0;">🏆</p>
        <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0 0;">Première vente réussie !</p>
      </div>
      <p>Voici comment continuer à vendre :</p>
      <ul style="color:#e0d8ff;">
        <li>Publiez plus d'annonces pour augmenter vos chances</li>
        <li>Répondez rapidement aux messages des acheteurs</li>
        <li>Découvrez les <a href="https://kin-sell.com/forfaits" style="color:#6f58ff;">forfaits</a> pour booster votre visibilité</li>
      </ul>`;

    const emailOk = await sendPromoEmail(
      seller.id,
      `🏆 ${name}, votre première vente sur Kin-Sell !`,
      htmlBody,
      "NEW_FEATURE" as PromoReason,
    );

    if (!emailOk) {
      await sendPromoPush(
        seller.id,
        "Première vente ! 🏆",
        `${name}, félicitations pour votre première vente sur Kin-Sell !`,
        "NEW_FEATURE" as PromoReason,
      );
    }

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "FIRST_SALE_CONGRATS",
        targetUserId: seller.id,
        decision: `First sale congrats`,
        reasoning: `Vendeur a ${seller._count.sellerOrders} commande(s)`,
        success: true,
      },
    });
    sent++;
  }

  if (sent > 0) {
    logger.info({ sent, skipped }, "[Messenger] Félicitations première vente");
  }
  return { sent, skipped };
}

// ─────────────────────────────────────────────
// Scheduler Lifecycle
// ─────────────────────────────────────────────

/**
 * Cycle fréquent (2h) : rappels + re-engagement + first sale
 */
async function runFrequentCycle(): Promise<void> {
  if (!(await isMessengerEnabled())) return;
  try {
    const [reminders, reengagement, firstSale] = await Promise.all([
      runCouponExpiryReminders().catch((err) => { logger.error(err, "[Messenger] Coupon reminders failed"); return { sent: 0, skipped: 0 }; }),
      runInactiveUserReengagement().catch((err) => { logger.error(err, "[Messenger] Reengagement failed"); return { sent: 0, skipped: 0 }; }),
      runFirstSaleCongrats().catch((err) => { logger.error(err, "[Messenger] First sale congrats failed"); return { sent: 0, skipped: 0 }; }),
    ]);

    const totalSent = reminders.sent + reengagement.sent + firstSale.sent;
    if (totalSent > 0) {
      logger.info({
        reminders: reminders.sent,
        reengagement: reengagement.sent,
        firstSale: firstSale.sent,
      }, "[Messenger] Cycle fréquent terminé");
    }
  } catch (err) {
    logger.error(err, "[Messenger] Erreur cycle fréquent");
  }
}

/**
 * Cycle quotidien (9h) : welcome + digest
 */
async function runDailyCycle(): Promise<void> {
  if (!(await isMessengerEnabled())) return;
  try {
    const [welcome, digest] = await Promise.all([
      runWelcomeFlow().catch((err) => { logger.error(err, "[Messenger] Welcome flow failed"); return { sent: 0, skipped: 0 }; }),
      runWeeklyDigest().catch((err) => { logger.error(err, "[Messenger] Weekly digest failed"); return { sent: 0, skipped: 0 }; }),
    ]);

    const totalSent = welcome.sent + digest.sent;
    if (totalSent > 0) {
      logger.info({ welcome: welcome.sent, digest: digest.sent }, "[Messenger] Cycle quotidien terminé");
    }
  } catch (err) {
    logger.error(err, "[Messenger] Erreur cycle quotidien");
  }
}

/**
 * Démarre le scheduler messenger autonome.
 */
export function startMessengerScheduler(): void {
  if (_schedulerRunning) return;
  _schedulerRunning = true;

  logger.info("[Messenger] Scheduler autonome démarré — cycles: 2h / 24h (9h)");

  // Premier cycle fréquent après 5 min
  _timeouts.push(setTimeout(() => { void runFrequentCycle(); }, 5 * 60 * 1000));

  // Cycle fréquent toutes les 2h
  _intervals.push(setInterval(() => { void runFrequentCycle(); }, 2 * 60 * 60 * 1000));

  // Cycle quotidien à 9h
  const now = new Date();
  const next9am = new Date(now);
  next9am.setHours(9, 0, 0, 0);
  if (next9am.getTime() <= now.getTime()) {
    next9am.setDate(next9am.getDate() + 1);
  }
  const delayTo9am = next9am.getTime() - now.getTime();

  _timeouts.push(setTimeout(() => {
    void runDailyCycle();
    _intervals.push(setInterval(() => { void runDailyCycle(); }, 24 * 60 * 60 * 1000));
  }, delayTo9am));

  logger.info(`[Messenger] Prochain cycle quotidien dans ${Math.round(delayTo9am / 3600_000)}h`);
}

/**
 * Stoppe le scheduler messenger.
 */
export function stopMessengerScheduler(): void {
  for (const i of _intervals) clearInterval(i);
  for (const t of _timeouts) clearTimeout(t);
  _intervals = [];
  _timeouts = [];
  _schedulerRunning = false;
  logger.info("[Messenger] Scheduler arrêté");
}

/**
 * Stats du scheduler messenger pour admin dashboard.
 */
export async function getMessengerSchedulerStats(): Promise<{
  running: boolean;
  last24h: {
    couponReminders: number;
    reengagement: number;
    welcomeFlow: number;
    weeklyDigest: number;
    firstSaleCongrats: number;
    total: number;
  };
  last7d: {
    total: number;
    byType: Record<string, number>;
  };
}> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const campaignTypes = [
    "COUPON_EXPIRY_REMINDER",
    "REENGAGEMENT",
    "WELCOME_FLOW",
    "WEEKLY_DIGEST",
    "FIRST_SALE_CONGRATS",
  ] as const;

  const [daily, weekly] = await Promise.all([
    prisma.aiAutonomyLog.groupBy({
      by: ["actionType"],
      where: {
        agentName: "IA_MESSENGER",
        actionType: { in: [...campaignTypes] },
        createdAt: { gte: dayAgo },
        success: true,
      },
      _count: true,
    }),
    prisma.aiAutonomyLog.groupBy({
      by: ["actionType"],
      where: {
        agentName: "IA_MESSENGER",
        actionType: { in: [...campaignTypes] },
        createdAt: { gte: weekAgo },
        success: true,
      },
      _count: true,
    }),
  ]);

  const dailyMap = new Map(daily.map((d) => [d.actionType, d._count]));
  const weeklyMap = new Map(weekly.map((d) => [d.actionType, d._count]));

  const last24h = {
    couponReminders: dailyMap.get("COUPON_EXPIRY_REMINDER") ?? 0,
    reengagement: dailyMap.get("REENGAGEMENT") ?? 0,
    welcomeFlow: dailyMap.get("WELCOME_FLOW") ?? 0,
    weeklyDigest: dailyMap.get("WEEKLY_DIGEST") ?? 0,
    firstSaleCongrats: dailyMap.get("FIRST_SALE_CONGRATS") ?? 0,
    total: daily.reduce((s, d) => s + d._count, 0),
  };

  return {
    running: _schedulerRunning,
    last24h,
    last7d: {
      total: weekly.reduce((s, d) => s + d._count, 0),
      byType: Object.fromEntries(weeklyMap),
    },
  };
}
