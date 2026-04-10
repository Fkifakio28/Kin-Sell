/**
 * So-Kin Trends Routes — Tendances, analytics, insights produit
 *
 * Endpoints publics :
 * - GET /sokin/trends          — Tendances locales (hashtags + sujets)
 * - GET /sokin/trends/profiles — Profils suggérés
 *
 * Endpoints analytics (auth) :
 * - GET /sokin/trends/post-insight/:id   — Insights bruts d'un post
 * - GET /sokin/trends/analytics/post/:id — Performance détaillée d'un post
 * - GET /sokin/trends/analytics/my       — Insights complets auteur (7d/30d)
 * - GET /sokin/trends/analytics/global   — Tendances So-Kin globales
 *
 * Endpoints insights produit — mobile-first (auth) :
 * - GET /sokin/trends/insights/post/:id  — Insight card post (gratuit + premium)
 * - GET /sokin/trends/insights/my        — Dashboard auteur (gratuit + premium)
 *
 * Smart feed blocks — tendances + suggestions intelligentes :
 * - GET /sokin/trends/smart/feed          — Blocs secondaires combinés (public)
 * - GET /sokin/trends/smart/hashtags      — Hashtags chauds (public)
 * - GET /sokin/trends/smart/topics        — Sujets qui montent (public)
 * - GET /sokin/trends/smart/formats       — Formats gagnants (public)
 * - GET /sokin/trends/smart/ideas         — Idées de publication (auth)
 * - GET /sokin/trends/smart/boost         — Opportunités de boost (auth)
 * - GET /sokin/trends/smart/suggestions   — Suggestions personnalisées (auth)
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { getTrending, getSuggestedProfiles, getPostInsight } from "./sokin-trends.service.js";
import { getPostPerformance, getAuthorSoKinInsights, getSoKinTrendsInsight } from "../analytics/sokin-analytics.service.js";
import { getPostInsightCard, getAuthorDashboard } from "../sokin/sokin-author-insights.service.js";
import {
  getSmartFeedBlocks,
  getHotHashtags,
  getTrendingTopics,
  getWinningFormats,
  getPublishIdeas,
  getBoostOpportunities,
  getAuthorSmartSuggestions,
} from "../sokin/sokin-smart-feed.service.js";
import { HttpError } from "../../shared/errors/http-error.js";

const router = Router();

/**
 * GET /sokin/trends
 * Tendances locales : sujets populaires + hashtags chauds
 * Public (pas de auth requis)
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const data = await getTrending(city, limit);
    res.json(data);
  })
);

/**
 * GET /sokin/trends/profiles
 * Profils suggérés (les plus actifs dans la ville)
 * Public
 */
router.get(
  "/profiles",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const data = await getSuggestedProfiles(city, limit);
    res.json(data);
  })
);

/**
 * GET /sokin/trends/post-insight/:id
 * Insights d'un post — réservé à l'auteur du post
 */
router.get(
  "/post-insight/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
    if (!postId) throw new HttpError(400, "postId requis");
    const insight = await getPostInsight(postId, req.auth!.userId);
    res.json(insight);
  })
);

export default router;

// ═══════════════════════════════════════════════════════
// ANALYTICS SO-KIN — Insights actionnables
// ═══════════════════════════════════════════════════════

/**
 * GET /sokin/trends/analytics/post/:id
 * Performance détaillée d'un post — réservé à l'auteur
 */
router.get(
  "/analytics/post/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
    if (!postId) throw new HttpError(400, "postId requis");
    const perf = await getPostPerformance(postId, req.auth!.userId);
    if (!perf) throw new HttpError(404, "Post introuvable ou non autorisé");
    res.json(perf);
  })
);

/**
 * GET /sokin/trends/analytics/my
 * Insights complets auteur — période 7d ou 30d
 */
router.get(
  "/analytics/my",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const period = (req.query.period as "7d" | "30d") || "7d";
    if (period !== "7d" && period !== "30d") throw new HttpError(400, "Période invalide (7d ou 30d)");
    const insights = await getAuthorSoKinInsights(req.auth!.userId, period);
    res.json(insights);
  })
);

/**
 * GET /sokin/trends/analytics/global
 * Tendances globales So-Kin — filtrable par ville
 */
router.get(
  "/analytics/global",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const trends = await getSoKinTrendsInsight(city);
    res.json(trends);
  })
);

// ═══════════════════════════════════════════════════════
// INSIGHTS AUTEUR — API produit mobile-first
// ═══════════════════════════════════════════════════════

/**
 * GET /sokin/trends/insights/post/:id
 * Insight card d'un post — mobile-ready, labels prêts à afficher
 * Gratuit : portée, engagement, commentaires, reposts, saves, potentiel, suggestion
 * Premium : + intérêt local, clics listing, ouvertures DM
 */
router.get(
  "/insights/post/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
    if (!postId) throw new HttpError(400, "postId requis");
    const card = await getPostInsightCard(postId, req.auth!.userId);
    if (!card) throw new HttpError(404, "Post introuvable ou non autorisé");
    res.json(card);
  })
);

/**
 * GET /sokin/trends/insights/my?period=7d|30d
 * Dashboard auteur — vue d'ensemble + suggestion globale
 * Gratuit : overview, topPost, suggestion
 * Premium : + bestTiming, hotHashtags, topCity, socialVsBusiness
 */
router.get(
  "/insights/my",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const period = (req.query.period as "7d" | "30d") || "7d";
    if (period !== "7d" && period !== "30d") throw new HttpError(400, "Période invalide (7d ou 30d)");
    const dashboard = await getAuthorDashboard(req.auth!.userId, period);
    res.json(dashboard);
  })
);

// ═══════════════════════════════════════════════════════
// SMART FEED — Blocs secondaires intelligents
// ═══════════════════════════════════════════════════════

/**
 * GET /sokin/trends/smart/feed
 * Vue combinée : tendances + hashtags + formats + boost + idées
 * Public — cache Redis 10 min
 */
router.get(
  "/smart/feed",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const blocks = await getSmartFeedBlocks(city);
    res.json(blocks);
  })
);

/**
 * GET /sokin/trends/smart/hashtags
 * Hashtags chauds avec velocity (RISING / NEW / STEADY)
 * Public — cache Redis 10 min
 */
router.get(
  "/smart/hashtags",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 15, 30);
    const data = await getHotHashtags(city, limit);
    res.json({ hashtags: data });
  })
);

/**
 * GET /sokin/trends/smart/topics
 * Sujets qui montent avec momentum (UP / EMERGING / STABLE)
 * Public — cache Redis 10 min
 */
router.get(
  "/smart/topics",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 8, 15);
    const data = await getTrendingTopics(city, limit);
    res.json({ topics: data });
  })
);

/**
 * GET /sokin/trends/smart/formats
 * Formats de posts qui performent (HOT / STABLE / COOL)
 * Public — cache Redis 10 min
 */
router.get(
  "/smart/formats",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const data = await getWinningFormats(city);
    res.json({ formats: data });
  })
);

/**
 * GET /sokin/trends/smart/ideas
 * Idées de publication personnalisées pour l'auteur
 * Auth — cache Redis 5 min
 */
router.get(
  "/smart/ideas",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const city = (req.query.city as string) || undefined;
    const ideas = await getPublishIdeas(req.auth!.userId, city);
    res.json({ ideas });
  })
);

/**
 * GET /sokin/trends/smart/boost
 * Opportunités de boost pour l'auteur (via IA Ads + scoring)
 * Auth — cache Redis 5 min
 */
router.get(
  "/smart/boost",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const opportunities = await getBoostOpportunities(req.auth!.userId, limit);
    res.json({ opportunities });
  })
);

/**
 * GET /sokin/trends/smart/suggestions
 * Vue combinée personnalisée : idées + boost
 * Auth — cache Redis 5 min
 */
router.get(
  "/smart/suggestions",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const city = (req.query.city as string) || undefined;
    const data = await getAuthorSmartSuggestions(req.auth!.userId, city);
    res.json(data);
  })
);
