/**
 * SO-KIN ADS ADVISOR — Pont IA Ads ↔ So-Kin
 *
 * Rôle limité et précis :
 * - Détecter les posts à fort boostScore et recommander à l'auteur
 * - Suggérer une meilleure structure / accroche de post
 * - Suggérer une portée géographique (LOCAL / NATIONAL / CROSS_BORDER)
 * - Suggérer de relier un article/service à un post marchand
 * - Distinguer post purement social vs. post à mettre en avant
 *
 * Anti-spam :
 * - Max 1 recommandation par post
 * - Max 3 recommandations par auteur par jour
 * - Cooldown 24h après un dismiss
 * - Stocké dans AiRecommendation existant (engineKey = "sokin-advisor")
 *
 * 3 audiences :
 * - AUTHOR   : l'auteur voit des tips dans son dashboard
 * - ADMIN    : l'admin voit les opportunités dans le panel admin
 * - SYSTEM   : signaux internes pour l'orchestrateur / analytics
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import {
  scorePost,
  getTopBoostCandidates,
  type ScoredPost,
} from "../sokin/sokin-scoring.service.js";
import { computeSellerProfile, type SellerProfile } from "./ai-ads-engine.service.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type TipAudience = "AUTHOR" | "ADMIN" | "SYSTEM";
export type SoKinTipType =
  | "BOOST_SUGGESTION"       // post à fort potentiel → booster
  | "CONTENT_IMPROVEMENT"    // améliorer accroche / structure
  | "GEO_EXPANSION"          // élargir la portée géographique
  | "LINK_LISTING"           // relier un article au post
  | "KEEP_SOCIAL"            // le post est social, ne pas commercialiser
  | "HIGH_POTENTIAL_ALERT"   // signal admin pour post viral potentiel
  | "PERFORMANCE_ALERT"      // alerte auteur: post en bonne performance
  | "REBOOST_SUGGESTION";   // suggestion de re-boost après bon résultat

export type GeoScope = "LOCAL" | "NATIONAL" | "CROSS_BORDER";

export interface SoKinTip {
  type: SoKinTipType;
  audience: TipAudience;
  postId: string;
  authorId: string;
  priority: number;          // 1-10
  title: string;
  message: string;
  rationale: string;
  actionType: string;
  actionTarget: string | null;
  actionData: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════
// Constantes — Seuils
// ═══════════════════════════════════════════════════════

const ENGINE_KEY = "sokin-advisor";

/** Seuil boostScore pour recommander un boost */
const BOOST_THRESHOLD = 45;

/** Seuil socialScore au-dessus duquel on dit "gardez social" */
const SOCIAL_DOMINANT_THRESHOLD = 50;

/** Seuil businessScore au-dessus duquel on suggère lier un article */
const BUSINESS_LINK_THRESHOLD = 30;

/** Max recommandations par auteur par jour */
const MAX_TIPS_PER_AUTHOR_PER_DAY = 3;

/** Max 1 recommandation par post */
const MAX_TIPS_PER_POST = 1;

/** Cooldown après dismiss (heures) */
const DISMISS_COOLDOWN_HOURS = 24;

// ═══════════════════════════════════════════════════════
// Anti-spam : vérifications de quota
// ═══════════════════════════════════════════════════════

async function canTipPost(postId: string): Promise<boolean> {
  const existing = await prisma.aiRecommendation.count({
    where: {
      engineKey: ENGINE_KEY,
      actionData: { path: ["postId"], equals: postId },
    },
  });
  return existing < MAX_TIPS_PER_POST;
}

async function canTipAuthor(authorId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiRecommendation.count({
    where: {
      engineKey: ENGINE_KEY,
      userId: authorId,
      createdAt: { gte: since },
    },
  });
  return count < MAX_TIPS_PER_AUTHOR_PER_DAY;
}

async function isAuthorCoolingDown(authorId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000);
  const dismissed = await prisma.aiRecommendation.findFirst({
    where: {
      engineKey: ENGINE_KEY,
      userId: authorId,
      dismissed: true,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return !!dismissed;
}

// ═══════════════════════════════════════════════════════
// Analyseurs — logique de détection
// ═══════════════════════════════════════════════════════

/**
 * Détermine la portée géographique recommandée pour un post.
 */
function suggestGeoScope(scored: ScoredPost, cityPostCount: number): GeoScope {
  const { boostScore, breakdown } = scored;
  // Post local populaire avec forte demande locale
  if (breakdown.boost.geoReachPoints >= 8 && cityPostCount >= 20) return "NATIONAL";
  // Post très performant (boost > 70) dans une ville active
  if (boostScore >= 70 && breakdown.boost.geoReachPoints >= 4) return "CROSS_BORDER";
  return "LOCAL";
}

/**
 * Détermine si un post doit rester purement social.
 * Un post est "social d'abord" si :
 * - socialScore > SOCIAL_DOMINANT_THRESHOLD
 * - businessScore < socialScore * 0.3
 * - pas de listing lié
 */
function isSocialDominant(scored: ScoredPost, hasLinkedListing: boolean): boolean {
  return (
    scored.socialScore >= SOCIAL_DOMINANT_THRESHOLD &&
    scored.businessScore < scored.socialScore * 0.3 &&
    !hasLinkedListing
  );
}

/**
 * Génère des suggestions d'amélioration de contenu.
 */
function getContentImprovements(scored: ScoredPost, post: PostMeta): string[] {
  const tips: string[] = [];
  const { social, boost } = scored.breakdown;

  if (boost.contentQualityPoints < 8 && post.mediaCount === 0) {
    tips.push("Ajoutez au moins 1 photo pour +40% d'engagement.");
  }
  if (boost.contentQualityPoints < 12 && post.hashtagCount < 2) {
    tips.push("Ajoutez 2-3 hashtags pertinents pour plus de visibilité.");
  }
  if (post.textLength < 50) {
    tips.push("Un texte plus détaillé (50+ caractères) attire plus de lecteurs.");
  }
  if (social.reactionsPoints > 10 && social.commentsPoints < 5) {
    tips.push("Vos réactions sont fortes mais peu de commentaires — posez une question pour engager.");
  }
  if (social.velocityPoints < 5 && post.ageHours < 24) {
    tips.push("Publiez aux heures de pointe (18h-21h) pour un meilleur démarrage.");
  }

  return tips;
}

// ═══════════════════════════════════════════════════════
// Types internes
// ═══════════════════════════════════════════════════════

interface PostMeta {
  id: string;
  authorId: string;
  postType: string;
  textLength: number;
  mediaCount: number;
  hashtagCount: number;
  hasLinkedListing: boolean;
  location: string | null;
  ageHours: number;
  views: number;
  sponsored: boolean;
}

async function getPostMeta(postId: string): Promise<PostMeta | null> {
  const post = await prisma.soKinPost.findFirst({
    where: { id: postId, status: "ACTIVE" },
    select: {
      id: true,
      authorId: true,
      postType: true,
      text: true,
      mediaUrls: true,
      hashtags: true,
      linkedListingId: true,
      location: true,
      createdAt: true,
      views: true,
      sponsored: true,
    },
  });
  if (!post) return null;

  return {
    id: post.id,
    authorId: post.authorId,
    postType: post.postType,
    textLength: post.text.length,
    mediaCount: post.mediaUrls.length,
    hashtagCount: post.hashtags.length,
    hasLinkedListing: !!post.linkedListingId,
    location: post.location,
    ageHours: (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60),
    views: (post as any).views ?? 0,
    sponsored: (post as any).sponsored ?? false,
  };
}

// ═══════════════════════════════════════════════════════
// API principale — Analyser un post et générer des tips
// ═══════════════════════════════════════════════════════

/**
 * Analyse un post So-Kin et génère des recommandations IA Ads.
 * Retourne les tips générés SANS les persister.
 * Appeler `persistTips()` pour sauvegarder dans AiRecommendation.
 */
export async function analyzePost(postId: string): Promise<SoKinTip[]> {
  const [scored, meta] = await Promise.all([
    scorePost(postId),
    getPostMeta(postId),
  ]);
  if (!scored || !meta) return [];

  const tips: SoKinTip[] = [];

  // ── 1. Post social dominant → ne pas commercialiser ──
  if (isSocialDominant(scored, meta.hasLinkedListing)) {
    tips.push({
      type: "KEEP_SOCIAL",
      audience: "SYSTEM",
      postId: meta.id,
      authorId: meta.authorId,
      priority: 3,
      title: "Post social authentique",
      message: "Ce post génère de l'engagement social naturel. Pas besoin de le commercialiser.",
      rationale: `socialScore=${scored.socialScore} >> businessScore=${scored.businessScore}`,
      actionType: "NONE",
      actionTarget: null,
      actionData: { postId: meta.id, socialScore: scored.socialScore },
    });
    // On continue quand même — un post social peut avoir d'autres tips utiles (contenu)
  }

  // ── 2. Fort boostScore → suggérer un boost ──
  if (scored.boostScore >= BOOST_THRESHOLD) {
    const geoScope = suggestGeoScope(scored, scored.breakdown.boost.geoReachPoints);
    tips.push({
      type: "BOOST_SUGGESTION",
      audience: "AUTHOR",
      postId: meta.id,
      authorId: meta.authorId,
      priority: scored.boostScore >= 70 ? 8 : 6,
      title: "Ce post a du potentiel",
      message: scored.boostScore >= 70
        ? `Votre post performe très bien (score ${scored.boostScore}/100). Un boost pourrait tripler sa portée.`
        : `Votre post a un bon potentiel (score ${scored.boostScore}/100). Un boost amplifierait sa visibilité.`,
      rationale: `boostScore=${scored.boostScore}, socialScore=${scored.socialScore}, businessScore=${scored.businessScore}`,
      actionType: "BOOST_POST",
      actionTarget: `/sokin/post/${meta.id}`,
      actionData: {
        postId: meta.id,
        boostScore: scored.boostScore,
        suggestedScope: geoScope,
        suggestedDurationDays: geoScope === "CROSS_BORDER" ? 7 : 3,
      },
    });
  }

  // ── 3. Alerte admin pour post viral potentiel ──
  if (scored.boostScore >= 70 && scored.socialScore >= 60) {
    tips.push({
      type: "HIGH_POTENTIAL_ALERT",
      audience: "ADMIN",
      postId: meta.id,
      authorId: meta.authorId,
      priority: 9,
      title: "Post à fort potentiel détecté",
      message: `Post ${meta.id.slice(0, 8)}… avec boostScore=${scored.boostScore}, socialScore=${scored.socialScore}. Candidat à la mise en avant éditoriale.`,
      rationale: "Scores combinés exceptionnels — potentiel viral local",
      actionType: "FEATURE_POST",
      actionTarget: `/admin/sokin/post/${meta.id}`,
      actionData: {
        postId: meta.id,
        authorId: meta.authorId,
        scores: { social: scored.socialScore, business: scored.businessScore, boost: scored.boostScore },
      },
    });
  }

  // ── 4. Portée géographique ──
  if (scored.boostScore >= 40 && meta.location) {
    const geoScope = suggestGeoScope(scored, scored.breakdown.boost.geoReachPoints);
    if (geoScope !== "LOCAL") {
      tips.push({
        type: "GEO_EXPANSION",
        audience: "AUTHOR",
        postId: meta.id,
        authorId: meta.authorId,
        priority: 5,
        title: geoScope === "NATIONAL" ? "Élargissez votre portée" : "Portée internationale possible",
        message: geoScope === "NATIONAL"
          ? "Ce post a du potentiel au-delà de votre ville. Envisagez une portée nationale."
          : "Ce post pourrait toucher des acheteurs dans d'autres pays. Tentez le cross-border.",
        rationale: `geoReachPoints=${scored.breakdown.boost.geoReachPoints}, boostScore=${scored.boostScore}`,
        actionType: "EXPAND_GEO",
        actionTarget: null,
        actionData: { postId: meta.id, suggestedScope: geoScope },
      });
    }
  }

  // ── 5. Lier un article/service au post ──
  if (
    scored.businessScore >= BUSINESS_LINK_THRESHOLD &&
    !meta.hasLinkedListing &&
    ["SELLING", "PROMO", "SHOWCASE", "REVIEW"].includes(meta.postType)
  ) {
    // Chercher un listing actif de l'auteur pour suggestion
    const topListing = await prisma.listing.findFirst({
      where: { ownerUserId: meta.authorId, status: "ACTIVE" },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });

    if (topListing) {
      tips.push({
        type: "LINK_LISTING",
        audience: "AUTHOR",
        postId: meta.id,
        authorId: meta.authorId,
        priority: 5,
        title: "Reliez un article à ce post",
        message: `Ce post a un potentiel business (score ${scored.businessScore}/100). Liez-y "${topListing.title}" pour convertir les clics en ventes.`,
        rationale: `businessScore=${scored.businessScore}, pas de listing lié, type=${meta.postType}`,
        actionType: "LINK_LISTING",
        actionTarget: `/sokin/post/${meta.id}/edit`,
        actionData: {
          postId: meta.id,
          suggestedListingId: topListing.id,
          suggestedListingTitle: topListing.title,
        },
      });
    }
  }

  // ── 6. Amélioration de contenu ──
  const improvements = getContentImprovements(scored, meta);
  if (improvements.length > 0) {
    tips.push({
      type: "CONTENT_IMPROVEMENT",
      audience: "AUTHOR",
      postId: meta.id,
      authorId: meta.authorId,
      priority: 4,
      title: "Améliorez votre post",
      message: improvements[0], // tip principal
      rationale: `contentQualityPoints=${scored.breakdown.boost.contentQualityPoints}, ${improvements.length} améliorations possibles`,
      actionType: "IMPROVE_CONTENT",
      actionTarget: null,
      actionData: {
        postId: meta.id,
        improvements,
      },
    });
  }

  // ── 7. Alerte performance — post qui explose ──
  const viewsPerHour = meta.ageHours > 0 ? meta.views / meta.ageHours : 0;
  if (meta.views >= 50 && viewsPerHour >= 10 && meta.ageHours <= 48) {
    tips.push({
      type: "PERFORMANCE_ALERT",
      audience: "AUTHOR",
      postId: meta.id,
      authorId: meta.authorId,
      priority: 9,
      title: "🔥 Votre post explose !",
      message: `${meta.views} vues en ${Math.round(meta.ageHours)}h — profitez du momentum avec un boost pour tripler la portée.`,
      rationale: `views=${meta.views}, viewsPerHour=${Math.round(viewsPerHour)}, ageHours=${Math.round(meta.ageHours)}`,
      actionType: "BOOST_POST",
      actionTarget: `/sokin/post/${meta.id}`,
      actionData: {
        postId: meta.id,
        views: meta.views,
        viewsPerHour: Math.round(viewsPerHour),
        ageHours: Math.round(meta.ageHours),
      },
    });
  }

  // ── 8. Re-boost suggestion — post sponsorisé qui performe bien ──
  if (meta.sponsored && meta.views >= 100 && scored.boostScore >= 50) {
    tips.push({
      type: "REBOOST_SUGGESTION",
      audience: "AUTHOR",
      postId: meta.id,
      authorId: meta.authorId,
      priority: 7,
      title: "📈 Re-boostez ce champion",
      message: `Ce post sponsorisé a atteint ${meta.views} vues avec un score de ${scored.boostScore}/100. Un re-boost prolongerait l'élan.`,
      rationale: `sponsored=true, views=${meta.views}, boostScore=${scored.boostScore}`,
      actionType: "BOOST_POST",
      actionTarget: `/sokin/post/${meta.id}`,
      actionData: {
        postId: meta.id,
        views: meta.views,
        boostScore: scored.boostScore,
        reboost: true,
      },
    });
  }

  // Tri par priorité décroissante
  return tips.sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════
// Persistance — Stocker dans AiRecommendation
// ═══════════════════════════════════════════════════════

/**
 * Persiste les tips dans AiRecommendation (si anti-spam OK).
 * Retourne le nombre de tips effectivement stockés.
 */
export async function persistTips(tips: SoKinTip[]): Promise<{ stored: number; skipped: number }> {
  let stored = 0;
  let skipped = 0;

  for (const tip of tips) {
    // Anti-spam
    if (tip.audience === "SYSTEM") { skipped++; continue; } // SYSTEM = pas de stockage
    if (!(await canTipPost(tip.postId))) { skipped++; continue; }
    if (!(await canTipAuthor(tip.authorId))) { skipped++; continue; }
    if (await isAuthorCoolingDown(tip.authorId)) { skipped++; continue; }

    try {
      await prisma.aiRecommendation.create({
        data: {
          engineKey: ENGINE_KEY,
          userId: tip.authorId,
          triggerType: tip.type,
          title: tip.title,
          message: tip.message,
          actionType: tip.actionType,
          actionTarget: tip.actionTarget,
          actionData: { ...tip.actionData, audience: tip.audience, rationale: tip.rationale },
          priority: tip.priority,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // expire 72h
        },
      });
      stored++;
    } catch (err) {
      logger.error(`[sokin-ads-advisor] persist tip failed: ${err}`);
      skipped++;
    }
  }

  return { stored, skipped };
}

// ═══════════════════════════════════════════════════════
// Batch — Balayage des posts scorés
// ═══════════════════════════════════════════════════════

/**
 * Balaye les top posts boostables et génère des recommandations.
 * Appelé périodiquement (après le batch scoring).
 */
export async function batchAnalyze(limit = 30, city?: string): Promise<{ analyzed: number; tipsStored: number }> {
  const candidates = await getTopBoostCandidates(limit, city);
  let analyzed = 0;
  let tipsStored = 0;

  for (const post of candidates) {
    try {
      const tips = await analyzePost(post.id);
      if (tips.length > 0) {
        const result = await persistTips(tips);
        tipsStored += result.stored;
      }
      analyzed++;
    } catch (err) {
      logger.error(`[sokin-ads-advisor] batch error on ${post.id}: ${err}`);
    }
  }

  if (analyzed > 0) {
    logger.info(`[sokin-ads-advisor] batch: ${analyzed} posts analyzed, ${tipsStored} tips stored`);
  }

  return { analyzed, tipsStored };
}

// ═══════════════════════════════════════════════════════
// Requêtes — Récupérer les tips stockés
// ═══════════════════════════════════════════════════════

/**
 * Tips auteur : recommandations non-dismissées pour un utilisateur.
 */
export async function getAuthorTips(userId: string, limit = 10) {
  return prisma.aiRecommendation.findMany({
    where: {
      engineKey: ENGINE_KEY,
      userId,
      dismissed: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { priority: "desc" },
    take: limit,
    select: {
      id: true,
      triggerType: true,
      title: true,
      message: true,
      actionType: true,
      actionTarget: true,
      actionData: true,
      priority: true,
      createdAt: true,
    },
  });
}

/**
 * Opportunités admin : posts high-potential non traités.
 */
export async function getAdminOpportunities(limit = 20) {
  return prisma.aiRecommendation.findMany({
    where: {
      engineKey: ENGINE_KEY,
      triggerType: "HIGH_POTENTIAL_ALERT",
      dismissed: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { priority: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      triggerType: true,
      title: true,
      message: true,
      actionData: true,
      priority: true,
      createdAt: true,
    },
  });
}

/**
 * Dismiss un tip (l'utilisateur ne veut plus le voir).
 */
export async function dismissTip(tipId: string, userId: string): Promise<boolean> {
  const tip = await prisma.aiRecommendation.findFirst({
    where: { id: tipId, userId, engineKey: ENGINE_KEY },
  });
  if (!tip) return false;

  await prisma.aiRecommendation.update({
    where: { id: tipId },
    data: { dismissed: true },
  });
  return true;
}

/**
 * Accepter un tip (l'utilisateur a agi dessus).
 */
export async function acceptTip(tipId: string, userId: string): Promise<boolean> {
  const tip = await prisma.aiRecommendation.findFirst({
    where: { id: tipId, userId, engineKey: ENGINE_KEY },
  });
  if (!tip) return false;

  await prisma.aiRecommendation.update({
    where: { id: tipId },
    data: { accepted: true, clicked: true },
  });
  return true;
}
