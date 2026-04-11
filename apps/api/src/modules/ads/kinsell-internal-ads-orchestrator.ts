/**
 * Kin-Sell Internal Ads Orchestrator
 *
 * Autonomous system that generates, scores, rotates, and manages
 * internal Kin-Sell promotional banners using:
 *   - Gemini → regional market context + ad copy generation
 *   - Internal data → trending categories, listing counts, prices
 *
 * Constraints:
 *   - MAX_AI_ADS_PER_DAY quota (default 2) — shared with admin generation
 *   - Mutex lock — only 1 generation at a time globally
 *   - 24h cache per category+city — no redundant API calls
 *   - Fallback templates if API fails or quota reached
 *
 * Pipeline:
 *   1. Acquire mutex lock
 *   2. Expire old internal ads
 *   3. Check quota
 *   4. Analyze internal data
 *   5. Enrich with Gemini regional context (cached 6h)
 *   6. Generate ad copy via Gemini (cached 24h)
 *   7. Store as KIN_SELL advertisements
 *   8. Release mutex lock
 *
 * All generated ads tagged type="KIN_SELL" + paymentRef="INTERNAL_AUTO".
 * Runs on configurable interval (default: every 12 hours).
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { getRedis } from "../../shared/db/redis.js";
import { getRegionalMarketContext } from "./regional-market-context.service.js";
import {
  generateAdCopy,
  acquireGenLock,
  releaseGenLock,
  isAiQuotaAvailable,
  getDailyAiGenCount,
  type GeneratedAdResult,
} from "./internal-ad-copy-generator.service.js";
import { scoreInternal, scoreHybrid, type ConfidenceScore } from "../analytics/confidence-score.service.js";
import { env } from "../../config/env.js";

// ── Types ──────────────────────────────────────────────────

interface CategoryInsight {
  category: string;
  count: number;
  avgPriceUsdCents: number;
  boostedCount: number;
}

interface InternalAd {
  title: string;
  description: string;
  ctaText: string;
  targetPages: string[];
  type: "KIN_SELL";
  priority: number;
  linkUrl: string;
  score: ConfidenceScore;
  baseCity: string;
  baseCountry: string;
}

interface OrchestrationResult {
  generated: number;
  expired: number;
  active: number;
  errors: string[];
  timestamp: string;
}

// ── Constants ──────────────────────────────────────────────

const MAX_INTERNAL_ADS = 10;
const INTERNAL_AD_DURATION_DAYS = 3;
const ORCHESTRATION_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_KEY = "ks:ads:orchestrator:last-run";

// ── Internal Data Analysis ─────────────────────────────────

async function analyzeInternalData(): Promise<{
  categories: CategoryInsight[];
  totalListings: number;
  totalUsers: number;
  topCity: string;
  topCountry: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const [listings, userCount] = await Promise.all([
      db.listing.findMany({
        where: { status: "ACTIVE", isPublished: true },
        select: { category: true, priceUsdCents: true, isBoosted: true, city: true, country: true },
      }),
      db.user.count({ where: { accountStatus: "ACTIVE" } }),
    ]);

    // Group by category
    const catMap = new Map<string, { count: number; totalPrice: number; boosted: number }>();
    const cityMap = new Map<string, number>();

    for (const l of listings) {
      const cat = catMap.get(l.category) ?? { count: 0, totalPrice: 0, boosted: 0 };
      cat.count++;
      cat.totalPrice += l.priceUsdCents;
      if (l.isBoosted) cat.boosted++;
      catMap.set(l.category, cat);

      cityMap.set(l.city, (cityMap.get(l.city) ?? 0) + 1);
    }

    const categories: CategoryInsight[] = [];
    for (const [category, data] of catMap) {
      categories.push({
        category,
        count: data.count,
        avgPriceUsdCents: data.count > 0 ? Math.round(data.totalPrice / data.count) : 0,
        boostedCount: data.boosted,
      });
    }
    categories.sort((a, b) => b.count - a.count);

    const topCity = [...cityMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Kinshasa";

    // Resolve top country from listings
    const countryMap = new Map<string, number>();
    for (const l of listings) {
      if (l.country) countryMap.set(l.country, (countryMap.get(l.country) ?? 0) + 1);
    }
    const topCountry = [...countryMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "RD Congo";

    return {
      categories: categories.slice(0, 8),
      totalListings: listings.length,
      totalUsers: userCount,
      topCity,
      topCountry,
    };
  } catch (err) {
    logger.warn({ err }, "[AdOrchestrator] Internal data analysis failed");
    return { categories: [], totalListings: 0, totalUsers: 0, topCity: "Kinshasa", topCountry: "RD Congo" };
  }
}

// ── Ad Generation Pipeline ─────────────────────────────────

async function generateInternalAds(
  categories: CategoryInsight[],
  topCity: string,
  topCountry: string = "RD Congo",
): Promise<InternalAd[]> {
  const ads: InternalAd[] = [];

  // Generate ONE ad at a time, respecting daily quota
  for (const cat of categories.slice(0, 5)) {
    // Check quota before each generation
    const quotaOk = await isAiQuotaAvailable();
    if (!quotaOk) {
      const count = await getDailyAiGenCount();
      logger.info({ count, max: env.MAX_AI_ADS_PER_DAY }, "[AdOrchestrator] Daily AI limit reached — remaining use fallback");
    }

    try {
      // Step 1: Get regional context from Gemini (cached 6h, doesn't count against quota)
      let regionContext;
      try {
        regionContext = await getRegionalMarketContext(cat.category, topCity);
      } catch { regionContext = null; }

      const signal = regionContext?.signals[0]?.data;

      // Step 2: Generate ad copy via Gemini (cached 24h, counts against quota only if API called)
      const adResult: GeneratedAdResult = await generateAdCopy({
        category: cat.category,
        city: topCity,
        trendDirection: signal?.trend,
        demandLevel: signal?.demandLevel,
        listingsCount: cat.count,
        avgPriceUsdCents: cat.avgPriceUsdCents,
        seasonalNote: signal?.seasonalNote ?? undefined,
      });

      // Step 3: Calculate priority score
      const priority = calculatePriority(cat, signal);

      // Step 4: Build internal ad
      ads.push({
        title: adResult.copy.title,
        description: adResult.copy.description,
        ctaText: adResult.copy.ctaText,
        targetPages: [adResult.copy.targetPage, "home"],
        type: "KIN_SELL",
        priority,
        linkUrl: `/explorer?category=${encodeURIComponent(cat.category)}`,
        score: adResult.score,
        baseCity: topCity,
        baseCountry: topCountry,
      });

      logger.info({ category: cat.category }, "[AdOrchestrator] Ad generated for category");
    } catch (err) {
      logger.warn({ err, category: cat.category }, "[AdOrchestrator] Failed to generate ad");
    }
  }

  return ads.sort((a, b) => b.priority - a.priority);
}

function calculatePriority(
  cat: CategoryInsight,
  signal?: { demandLevel?: string; trend?: string } | null,
): number {
  let score = 0;

  // Volume bonus
  if (cat.count >= 20) score += 3;
  else if (cat.count >= 5) score += 2;
  else score += 1;

  // Demand bonus (from Gemini)
  if (signal?.demandLevel === "HIGH") score += 3;
  else if (signal?.demandLevel === "MEDIUM") score += 1;

  // Trend bonus
  if (signal?.trend === "GROWING") score += 2;
  else if (signal?.trend === "DECLINING") score -= 1;

  // Boost activity bonus (organic interest)
  if (cat.boostedCount > 0) score += 1;

  return Math.max(0, Math.min(10, score));
}

// ── Storage ────────────────────────────────────────────────

async function storeInternalAds(ads: InternalAd[]): Promise<number> {
  let created = 0;
  const now = new Date();
  const endDate = new Date(now.getTime() + INTERNAL_AD_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  for (const ad of ads.slice(0, MAX_INTERNAL_ADS)) {
    try {
      await db.advertisement.create({
        data: {
          title: ad.title,
          description: ad.description,
          ctaText: ad.ctaText,
          linkUrl: ad.linkUrl,
          type: "KIN_SELL",
          status: "ACTIVE",
          targetPages: ad.targetPages,
          priority: ad.priority,
          startDate: now,
          endDate,
          advertiserName: "Kin-Sell IA",
          advertiserEmail: "ia@kin-sell.com",
          amountPaidCents: 0,
          paymentRef: "INTERNAL_AUTO",
          promotionScope: "NATIONAL",
          baseCity: ad.baseCity,
          baseCountry: ad.baseCountry,
          pricingMultiplier: 1.0,
        },
      });
      created++;
    } catch (err) {
      logger.warn({ err, title: ad.title }, "[AdOrchestrator] Failed to store ad");
    }
  }

  return created;
}

async function expireOldInternalAds(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (prisma as any).advertisement.updateMany({
      where: {
        type: "KIN_SELL",
        paymentRef: "INTERNAL_AUTO",
        status: "ACTIVE",
        endDate: { lt: new Date() },
      },
      data: { status: "INACTIVE" },
    });
    return result.count;
  } catch { return 0; }
}

async function countActiveInternalAds(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (prisma as any).advertisement.count({
      where: { type: "KIN_SELL", paymentRef: "INTERNAL_AUTO", status: "ACTIVE" },
    });
  } catch { return 0; }
}

// ── Orchestrator ───────────────────────────────────────────

/**
 * Run the full orchestration pipeline:
 * 1. Acquire mutex lock
 * 2. Expire old internal ads
 * 3. Check if we need new ads
 * 4. Analyze internal data
 * 5. Enrich with regional context (Gemini, cached)
 * 6. Generate ad copies (Gemini, cached, quota-limited)
 * 7. Store and activate
 * 8. Release mutex lock
 */
export async function runOrchestration(): Promise<OrchestrationResult> {
  const result: OrchestrationResult = {
    generated: 0,
    expired: 0,
    active: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  // Step 0: Acquire mutex — only 1 generation at a time
  const lockAcquired = await acquireGenLock();
  if (!lockAcquired) {
    logger.warn("[AdOrchestrator] Another generation in progress — skipping");
    result.errors.push("Generation locked — another run in progress");
    return result;
  }

  try {
    // Step 1: Expire old ads
    result.expired = await expireOldInternalAds();

    // Step 2: Check current count
    result.active = await countActiveInternalAds();
    if (result.active >= MAX_INTERNAL_ADS) {
      logger.info(`[AdOrchestrator] ${result.active} internal ads active — skipping generation`);
      return result;
    }

    // Step 3: Analyze internal data
    const { categories, topCity, topCountry, totalListings } = await analyzeInternalData();
    if (categories.length === 0) {
      logger.info("[AdOrchestrator] No categories found — skipping generation");
      return result;
    }

    // How many new ads to generate
    const needed = Math.min(MAX_INTERNAL_ADS - result.active, categories.length);
    const topCategories = categories.slice(0, needed);

    // Log quota status
    const dailyCount = await getDailyAiGenCount();
    logger.info({
      needed,
      categories: topCategories.map(c => c.category),
      totalListings,
      dailyAiCount: dailyCount,
      maxDaily: env.MAX_AI_ADS_PER_DAY,
    }, "[AdOrchestrator] Starting generation");

    // Step 4+5: Generate ads (Gemini context + Gemini copy, sequentially)
    const ads = await generateInternalAds(topCategories, topCity, topCountry);

    // Step 6: Store
    result.generated = await storeInternalAds(ads);
    result.active += result.generated;

    logger.info({
      generated: result.generated,
      expired: result.expired,
      active: result.active,
    }, "[AdOrchestrator] Orchestration complete");

    // Save last run timestamp
    try {
      const redis = getRedis();
      if (redis) await redis.set(CACHE_KEY, new Date().toISOString());
    } catch { /* ignore */ }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(msg);
    logger.error({ err }, "[AdOrchestrator] Orchestration failed");
  } finally {
    await releaseGenLock();
  }

  return result;
}

/**
 * Start the autonomous ad orchestrator scheduler.
 * Runs immediately on startup, then every 12 hours.
 */
export function startAdOrchestrator(): void {
  // Delay initial run by 30 seconds to let other services start
  setTimeout(() => {
    void runOrchestration().catch(err =>
      logger.error({ err }, "[AdOrchestrator] Initial run failed")
    );
  }, 30_000);

  setInterval(() => {
    void runOrchestration().catch(err =>
      logger.error({ err }, "[AdOrchestrator] Scheduled run failed")
    );
  }, ORCHESTRATION_INTERVAL_MS);

  logger.info("[AdOrchestrator] Scheduler started — runs every 12h");
}
