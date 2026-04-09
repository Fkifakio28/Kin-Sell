/**
 * So-Kin Scoring Service — Score de potentiel V1
 *
 * 3 scores distincts par post (0-100) :
 *
 * 1. socialScore     — potentiel social (engagement, vitesse, qualité interactions)
 * 2. businessScore   — potentiel business (clics commerce, nature du post, profil auteur)
 * 3. boostScore      — potentiel de boost (combinaison social+business, géo, contenu)
 *
 * Toutes les formules sont explicites et testables.
 * Aucune IA externe — purement rule-based sur données Prisma + SoKinEvent.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";

// ── Types ──

export interface SoKinScores {
  socialScore: number;       // 0-100
  businessScore: number;     // 0-100
  boostScore: number;        // 0-100
}

export interface ScoredPost extends SoKinScores {
  postId: string;
  breakdown: {
    social: SocialBreakdown;
    business: BusinessBreakdown;
    boost: BoostBreakdown;
  };
}

export interface SocialBreakdown {
  reactionsPoints: number;     // 0-20
  commentsPoints: number;      // 0-15
  repliesPoints: number;       // 0-10
  sharesPoints: number;        // 0-10
  bookmarksPoints: number;     // 0-10
  velocityPoints: number;      // 0-15
  profileClicksPoints: number; // 0-10
  localInterestPoints: number; // 0-10
}

export interface BusinessBreakdown {
  listingClicksPoints: number;  // 0-20
  contactClicksPoints: number;  // 0-20
  dmOpensPoints: number;        // 0-15
  postNaturePoints: number;     // 0-15
  localDemandPoints: number;    // 0-15
  authorProfilePoints: number;  // 0-15
}

export interface BoostBreakdown {
  socialWeight: number;        // 0-35
  businessWeight: number;      // 0-25
  contentQualityPoints: number;// 0-20
  geoReachPoints: number;      // 0-10
  postTypePoints: number;      // 0-10
}

// ── Constantes & seuils ──

/** Types commerciaux (pondérés plus haut pour businessScore) */
const COMMERCIAL_TYPES = new Set(["SELLING", "PROMO", "SHOWCASE"]);

/** Types sociaux purs (pondérés plus haut pour socialScore) */
const SOCIAL_TYPES = new Set(["DISCUSSION", "QUESTION", "REVIEW", "TREND"]);

/** Fenêtre pour la vitesse d'engagement (heures) */
const VELOCITY_WINDOW_HOURS = 24;

/** Âge max pour les événements de scoring (jours) */
const EVENT_WINDOW_DAYS = 7;

// ── Helpers de scoring ──

/** Clamp et arrondir */
function clamp(v: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, v)));
}

/** Courbe logarithmique douce : transforme un compteur brut en points */
function logScale(count: number, maxPoints: number, halfAt: number): number {
  if (count <= 0) return 0;
  // Atteint ~50% des points à halfAt, ~90% à halfAt*4
  const raw = (Math.log(1 + count) / Math.log(1 + halfAt)) * (maxPoints * 0.5);
  return clamp(raw, 0, maxPoints);
}

// ═══════════════════════════════════════════════════════
// Score Social (0-100)
// ═══════════════════════════════════════════════════════

/**
 * Calcul du Social Potential Score
 *
 * Composantes :
 * - Réactions (0-20)      : diversité et volume des réactions
 * - Commentaires (0-15)   : volume de commentaires
 * - Réponses (0-10)       : profondeur des conversations (replies)
 * - Partages (0-10)       : volume de partages
 * - Sauvegardes (0-10)    : bookmarks = intérêt durable
 * - Vitesse (0-15)        : engagement dans les 24h après publication
 * - Clics profil (0-10)   : curiosité vers l'auteur
 * - Intérêt local (0-10)  : concentration géographique des interactions
 */
function computeSocialScore(
  post: PostData,
  events: EventCounts,
  earlyEngagement: number,
  reactionTypes: number,
  replyCount: number,
  bookmarkCount: number,
): { score: number; breakdown: SocialBreakdown } {
  // Réactions : volume + diversité (plus de types = mieux)
  const reactionsBase = logScale(post.likes, 15, 10);
  const diversityBonus = clamp(reactionTypes * 1.5, 0, 5);
  const reactionsPoints = clamp(reactionsBase + diversityBonus, 0, 20);

  // Commentaires
  const commentsPoints = logScale(post.comments, 15, 5);

  // Réponses (imbriquées = conversation riche)
  const repliesPoints = logScale(replyCount, 10, 3);

  // Partages
  const sharesPoints = logScale(post.shares, 10, 3);

  // Sauvegardes
  const bookmarksPoints = logScale(bookmarkCount, 10, 3);

  // Vitesse d'engagement (engagement dans les VELOCITY_WINDOW_HOURS premières heures)
  const velocityPoints = logScale(earlyEngagement, 15, 5);

  // Clics profil auteur (depuis événements trackés)
  const profileClicksPoints = logScale(events.PROFILE_CLICK, 10, 3);

  // Intérêt local : si le post a une location ET a des interactions
  const totalEngagement = post.likes + post.comments + post.shares + bookmarkCount;
  const hasLocation = !!post.location;
  const localInterestPoints = hasLocation ? clamp(logScale(totalEngagement, 8, 5) + 2, 0, 10) : logScale(totalEngagement, 6, 8);

  const breakdown: SocialBreakdown = {
    reactionsPoints,
    commentsPoints,
    repliesPoints,
    sharesPoints,
    bookmarksPoints,
    velocityPoints,
    profileClicksPoints,
    localInterestPoints,
  };

  const score = clamp(
    reactionsPoints + commentsPoints + repliesPoints + sharesPoints +
    bookmarksPoints + velocityPoints + profileClicksPoints + localInterestPoints,
    0, 100,
  );

  return { score, breakdown };
}

// ═══════════════════════════════════════════════════════
// Score Business (0-100)
// ═══════════════════════════════════════════════════════

/**
 * Calcul du Business Potential Score
 *
 * Composantes :
 * - Clics article lié (0-20) : intérêt pour le produit
 * - Clics contacter (0-20)   : intention forte d'achat
 * - Ouvertures DM (0-15)     : conversion vers conversation
 * - Nature marchande (0-15)  : type de post (SELLING/PROMO > DISCUSSION)
 * - Demande locale (0-15)    : posts So-Kin dans la même catégorie/ville (proxy demand)
 * - Profil auteur (0-15)     : vendeur actif = signal fort (listings, ventes)
 */
function computeBusinessScore(
  post: PostData,
  events: EventCounts,
  authorStats: AuthorStats,
  localCategoryDemand: number,
): { score: number; breakdown: BusinessBreakdown } {
  // Clics article lié
  const listingClicksPoints = logScale(events.LISTING_CLICK, 20, 3);

  // Clics contacter / call-to-action
  const contactClicksPoints = logScale(events.CONTACT_CLICK, 20, 3);

  // DM ouverts depuis le post
  const dmOpensPoints = logScale(events.DM_OPEN, 15, 2);

  // Nature marchande du post
  let postNaturePoints = 0;
  if (COMMERCIAL_TYPES.has(post.postType)) {
    postNaturePoints = 10;
    if (post.linkedListingId) postNaturePoints = 15; // lié à un vrai article
  } else if (post.postType === "REVIEW") {
    postNaturePoints = 5; // avis = signal indirect
  }

  // Demande locale (activité So-Kin récente dans la même zone)
  const localDemandPoints = logScale(localCategoryDemand, 15, 10);

  // Profil auteur (vendeur établi ?)
  let authorProfilePoints = 0;
  if (authorStats.totalListings >= 10) authorProfilePoints = 15;
  else if (authorStats.totalListings >= 5) authorProfilePoints = 12;
  else if (authorStats.totalListings >= 2) authorProfilePoints = 8;
  else if (authorStats.totalListings >= 1) authorProfilePoints = 5;
  // Bonus ventes
  if (authorStats.completedSales >= 5) authorProfilePoints = Math.min(15, authorProfilePoints + 3);

  const breakdown: BusinessBreakdown = {
    listingClicksPoints,
    contactClicksPoints,
    dmOpensPoints,
    postNaturePoints,
    localDemandPoints,
    authorProfilePoints,
  };

  const score = clamp(
    listingClicksPoints + contactClicksPoints + dmOpensPoints +
    postNaturePoints + localDemandPoints + authorProfilePoints,
    0, 100,
  );

  return { score, breakdown };
}

// ═══════════════════════════════════════════════════════
// Score Boost (0-100)
// ═══════════════════════════════════════════════════════

/**
 * Calcul du Boost Potential Score
 *
 * Composantes :
 * - Poids social (0-35)        : 35% du socialScore
 * - Poids business (0-25)      : 25% du businessScore
 * - Qualité contenu (0-20)     : médias, hashtags, texte
 * - Portée géo (0-10)          : location renseignée, ville active
 * - Type de post (0-10)        : types visuels/commerciaux boostent mieux
 */
function computeBoostScore(
  post: PostData,
  socialScore: number,
  businessScore: number,
  cityPostCount: number,
): { score: number; breakdown: BoostBreakdown } {
  // Poids social : 35% du socialScore
  const socialWeight = clamp(Math.round(socialScore * 0.35), 0, 35);

  // Poids business : 25% du businessScore
  const businessWeight = clamp(Math.round(businessScore * 0.25), 0, 25);

  // Qualité contenu
  let contentQualityPoints = 0;
  if (post.mediaUrls.length > 0) contentQualityPoints += 8;
  if (post.mediaUrls.length >= 3) contentQualityPoints += 3; // galerie
  if (post.hashtags.length >= 2) contentQualityPoints += 4;
  if (post.text.length > 50) contentQualityPoints += 3;
  if (post.text.length > 150) contentQualityPoints += 2;
  contentQualityPoints = clamp(contentQualityPoints, 0, 20);

  // Portée géo
  let geoReachPoints = 0;
  if (post.location) {
    geoReachPoints += 4;
    // Bonus si la ville est active (beaucoup de posts récents)
    if (cityPostCount >= 20) geoReachPoints += 6;
    else if (cityPostCount >= 5) geoReachPoints += 4;
    else geoReachPoints += 2;
  }
  geoReachPoints = clamp(geoReachPoints, 0, 10);

  // Type de post
  let postTypePoints = 0;
  if (COMMERCIAL_TYPES.has(post.postType)) postTypePoints = 10;
  else if (post.postType === "REVIEW" || post.postType === "TREND") postTypePoints = 7;
  else if (SOCIAL_TYPES.has(post.postType)) postTypePoints = 4;
  else postTypePoints = 3;

  const breakdown: BoostBreakdown = {
    socialWeight,
    businessWeight,
    contentQualityPoints,
    geoReachPoints,
    postTypePoints,
  };

  const score = clamp(
    socialWeight + businessWeight + contentQualityPoints +
    geoReachPoints + postTypePoints,
    0, 100,
  );

  return { score, breakdown };
}

// ═══════════════════════════════════════════════════════
// Types internes — données agrégées
// ═══════════════════════════════════════════════════════

interface PostData {
  id: string;
  authorId: string;
  postType: string;
  text: string;
  mediaUrls: string[];
  hashtags: string[];
  location: string | null;
  linkedListingId: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  createdAt: Date;
}

interface EventCounts {
  VIEW: number;
  COMMENT_OPEN: number;
  PROFILE_CLICK: number;
  LISTING_CLICK: number;
  CONTACT_CLICK: number;
  DM_OPEN: number;
}

interface AuthorStats {
  totalListings: number;
  completedSales: number;
}

// ═══════════════════════════════════════════════════════
// Collecte de données — requêtes Prisma
// ═══════════════════════════════════════════════════════

/** Récupérer les compteurs d'événements trackés pour un post */
async function getEventCounts(postId: string): Promise<EventCounts> {
  const since = new Date(Date.now() - EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped: { event: string; _count: { id: number } }[] = await (prisma as any).soKinEvent.groupBy({
    by: ["event"],
    where: { postId, createdAt: { gte: since } },
    _count: { id: true },
  });

  const counts: EventCounts = {
    VIEW: 0, COMMENT_OPEN: 0, PROFILE_CLICK: 0,
    LISTING_CLICK: 0, CONTACT_CLICK: 0, DM_OPEN: 0,
  };
  for (const g of grouped) {
    if (g.event in counts) (counts as any)[g.event] = g._count.id;
  }
  return counts;
}

/** Engagement dans les premières 24h après publication */
async function getEarlyEngagement(postId: string, createdAt: Date): Promise<number> {
  const windowEnd = new Date(createdAt.getTime() + VELOCITY_WINDOW_HOURS * 60 * 60 * 1000);
  const count = await (prisma as any).soKinEvent.count({
    where: {
      postId,
      createdAt: { gte: createdAt, lte: windowEnd },
    },
  });
  return count;
}

/** Nombre de types de réaction distincts sur un post */
async function getReactionTypesCount(postId: string): Promise<number> {
  const types: { type: string }[] = await prisma.soKinReaction.findMany({
    where: { postId },
    select: { type: true },
    distinct: ["type"],
  });
  return types.length;
}

/** Nombre de réponses (commentaires avec parentCommentId) */
async function getReplyCount(postId: string): Promise<number> {
  return prisma.soKinComment.count({
    where: { postId, parentCommentId: { not: null } },
  });
}

/** Nombre de bookmarks */
async function getBookmarkCount(postId: string): Promise<number> {
  return prisma.soKinBookmark.count({ where: { postId } });
}

/** Stats auteur simplifiées (listings + ventes) */
async function getAuthorStats(authorId: string): Promise<AuthorStats> {
  const [totalListings, completedSales] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: authorId, status: "ACTIVE" } }),
    prisma.order.count({ where: { sellerUserId: authorId, status: "DELIVERED" } }),
  ]);
  return { totalListings, completedSales };
}

/** Posts actifs récents dans la même ville (proxy demande locale) */
async function getCityPostCount(location: string | null): Promise<number> {
  if (!location) return 0;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.soKinPost.count({
    where: {
      status: "ACTIVE",
      createdAt: { gte: since },
      location: { contains: location, mode: "insensitive" },
    } as any,
  });
}

/** Posts récents dans la même zone géo avec types commerciaux (proxy demande marché) */
async function getLocalCategoryDemand(location: string | null, postType: string): Promise<number> {
  if (!location) return 0;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.soKinPost.count({
    where: {
      status: "ACTIVE",
      createdAt: { gte: since },
      location: { contains: location, mode: "insensitive" },
      postType: { in: ["SELLING", "PROMO", "SHOWCASE"] },
    } as any,
  });
}

// ═══════════════════════════════════════════════════════
// API principale — Scorer un post
// ═══════════════════════════════════════════════════════

/**
 * Calcule les 3 scores pour un post donné.
 * Retourne les scores + le breakdown détaillé.
 */
export async function scorePost(postId: string): Promise<ScoredPost | null> {
  const post = await prisma.soKinPost.findFirst({
    where: { id: postId, status: "ACTIVE" },
    select: {
      id: true,
      authorId: true,
      postType: true,
      text: true,
      mediaUrls: true,
      hashtags: true,
      location: true,
      linkedListingId: true,
      likes: true,
      comments: true,
      shares: true,
      createdAt: true,
    },
  });
  if (!post) return null;

  const views = ((post as any).views ?? 0) as number;
  const postData: PostData = { ...post, views };

  // Collecter toutes les données en parallèle
  const [events, earlyEngagement, reactionTypes, replyCount, bookmarkCount, authorStats, localDemand, cityPosts] =
    await Promise.all([
      getEventCounts(postId),
      getEarlyEngagement(postId, post.createdAt),
      getReactionTypesCount(postId),
      getReplyCount(postId),
      getBookmarkCount(postId),
      getAuthorStats(post.authorId),
      getLocalCategoryDemand(post.location, post.postType),
      getCityPostCount(post.location),
    ]);

  // Calculer les 3 scores
  const social = computeSocialScore(postData, events, earlyEngagement, reactionTypes, replyCount, bookmarkCount);
  const business = computeBusinessScore(postData, events, authorStats, localDemand);
  const boost = computeBoostScore(postData, social.score, business.score, cityPosts);

  return {
    postId,
    socialScore: social.score,
    businessScore: business.score,
    boostScore: boost.score,
    breakdown: {
      social: social.breakdown,
      business: business.breakdown,
      boost: boost.breakdown,
    },
  };
}

/**
 * Score un post et persiste les résultats dans SoKinPost.
 * Utilisé par le recalcul batch et par le recalcul post-événement.
 */
export async function scoreAndPersist(postId: string): Promise<ScoredPost | null> {
  const scored = await scorePost(postId);
  if (!scored) return null;

  try {
    await (prisma as any).soKinPost.update({
      where: { id: postId },
      data: {
        socialScore: scored.socialScore,
        businessScore: scored.businessScore,
        boostScore: scored.boostScore,
        scoredAt: new Date(),
      },
    });
  } catch (err) {
    logger.error(`[sokin-scoring] persist failed for ${postId}: ${err}`);
  }

  return scored;
}

// ═══════════════════════════════════════════════════════
// Batch — Recalcul périodique
// ═══════════════════════════════════════════════════════

/**
 * Recalcule les scores pour les posts actifs récents.
 *
 * Stratégie de fréquence :
 * - Posts < 24h     : recalcul à chaque batch
 * - Posts 1-7 jours : recalcul si scoredAt > 6h
 * - Posts > 7 jours : recalcul si scoredAt > 24h
 *
 * Appelé périodiquement (toutes les 30 minutes via setInterval ou cron).
 */
export async function batchRecalculate(limit = 100): Promise<{ scored: number; errors: number }> {
  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  // Posts récents non encore scorés ou dont le score est périmé
  const posts = await prisma.soKinPost.findMany({
    where: {
      status: "ACTIVE",
      createdAt: { gte: sevenDaysAgo },
      OR: [
        { scoredAt: null } as any,
        // Posts < 24h : toujours recalculer
        { createdAt: { gte: oneDayAgo } },
        // Posts plus vieux : seulement si scoredAt > 6h
        { scoredAt: { lt: sixHoursAgo } as any },
      ],
    } as any,
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let scored = 0;
  let errors = 0;

  // Traiter en série pour ne pas surcharger la DB
  for (const post of posts) {
    try {
      await scoreAndPersist(post.id);
      scored++;
    } catch (err) {
      errors++;
      logger.error(`[sokin-scoring] batch error on ${post.id}: ${err}`);
    }
  }

  if (scored > 0) {
    logger.info(`[sokin-scoring] batch: ${scored} scored, ${errors} errors`);
  }

  return { scored, errors };
}

/**
 * Démarre le recalcul périodique (toutes les 30 minutes).
 * Appeler une fois au démarrage du serveur.
 */
let batchInterval: ReturnType<typeof setInterval> | null = null;

export function startScoringScheduler(): void {
  if (batchInterval) return;
  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  batchInterval = setInterval(() => {
    batchRecalculate().catch((err) =>
      logger.error(`[sokin-scoring] scheduler error: ${err}`)
    );
  }, INTERVAL_MS);
  logger.info("[sokin-scoring] scheduler started (every 30 min)");
}

export function stopScoringScheduler(): void {
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
  }
}

// ═══════════════════════════════════════════════════════
// Requêtes — Posts les mieux scorés
// ═══════════════════════════════════════════════════════

/** Posts avec le plus haut boostScore (candidats au boost IA Ads) */
export async function getTopBoostCandidates(limit = 20, city?: string) {
  const where: Record<string, unknown> = {
    status: "ACTIVE",
    boostScore: { gt: 0 },
  };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  return (prisma as any).soKinPost.findMany({
    where,
    select: {
      id: true,
      authorId: true,
      postType: true,
      socialScore: true,
      businessScore: true,
      boostScore: true,
      likes: true,
      views: true,
      location: true,
      createdAt: true,
    },
    orderBy: { boostScore: "desc" },
    take: limit,
  });
}

/** Posts avec le plus haut socialScore */
export async function getTopSocialPosts(limit = 20, city?: string) {
  const where: Record<string, unknown> = {
    status: "ACTIVE",
    socialScore: { gt: 0 },
  };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  return (prisma as any).soKinPost.findMany({
    where,
    select: {
      id: true,
      authorId: true,
      postType: true,
      socialScore: true,
      likes: true,
      views: true,
      location: true,
      createdAt: true,
    },
    orderBy: { socialScore: "desc" },
    take: limit,
  });
}

/** Posts avec le plus haut businessScore */
export async function getTopBusinessPosts(limit = 20, city?: string) {
  const where: Record<string, unknown> = {
    status: "ACTIVE",
    businessScore: { gt: 0 },
  };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  return (prisma as any).soKinPost.findMany({
    where,
    select: {
      id: true,
      authorId: true,
      postType: true,
      businessScore: true,
      likes: true,
      views: true,
      location: true,
      createdAt: true,
    },
    orderBy: { businessScore: "desc" },
    take: limit,
  });
}
