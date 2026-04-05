/**
 * IA Studio Ads — Service de génération créative publicitaire
 *
 * Génère des pubs (texte, bannière, carte promo, CTA) automatiquement ou manuellement.
 * Les créations sont stockées puis transmises à IA Ads pour diffusion.
 */
import { prisma } from '../../shared/db/prisma.js';

// ── Types ──────────────────────────────────────────────

type AdType = 'BOOST_ARTICLE' | 'BOOST_SHOP' | 'FORFAIT' | 'IA_PROMO' | 'ESSAI' | 'AUTO_VENTE' | 'UPGRADE' | 'CUSTOM';
type AudienceType = 'USER' | 'BUSINESS' | 'ALL';
type MediaType = 'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'BANNER' | 'CARD';
type Tone = 'premium' | 'agressif' | 'doux' | 'vendeur' | 'informatif';
type CreativeStatus = 'DRAFT' | 'READY' | 'PUBLISHED' | 'ARCHIVED';

export interface GenerateCreativeInput {
  adType: AdType;
  audienceType: AudienceType;
  mediaType?: MediaType;
  tone?: Tone;
  targetPlanCodes?: string[];
  targetCategory?: string;
  tags?: string[];
  customTitle?: string;
  customText?: string;
  customSubtitle?: string;
  customCtaLabel?: string;
  customCtaTarget?: string;
  customMediaUrl?: string;
  variantGroup?: string;
  variantLabel?: string;
  userId?: string;
  businessId?: string;
}

// ── Templates de génération ──────────────────────────────

const TEMPLATES: Record<AdType, { titles: string[]; texts: string[]; ctas: { label: string; target: string }[]; subtitles: string[] }> = {
  BOOST_ARTICLE: {
    titles: ['🚀 Boostez votre article', '📈 Plus de visibilité', '⚡ Mettez en avant votre produit'],
    texts: [
      'Votre article mérite d\'être vu par plus d\'acheteurs. Activez le boost pour multiplier vos vues.',
      'Les articles boostés reçoivent en moyenne 3x plus de contacts. Essayez maintenant.',
      'Ne laissez pas votre annonce passer inaperçue. Le boost la place devant les bons acheteurs.',
    ],
    ctas: [{ label: 'Booster', target: '/pricing' }, { label: 'Voir les options', target: '/pricing?tab=addons' }],
    subtitles: ['Visible par +3x d\'acheteurs', 'Résultats dès les premières heures'],
  },
  BOOST_SHOP: {
    titles: ['🏪 Mettez votre boutique en avant', '✨ Boutique premium', '🎯 Attirez plus de clients'],
    texts: [
      'Votre boutique a du potentiel. Le boost boutique la met en tête des résultats.',
      'Les boutiques boostées attirent 2x plus de visiteurs. Passez à l\'action.',
      'Faites briller votre boutique dans l\'Explorer Kin-Sell.',
    ],
    ctas: [{ label: 'Booster ma boutique', target: '/pricing' }, { label: 'En savoir plus', target: '/pricing?tab=business' }],
    subtitles: ['Votre boutique en tête', '+200% de visites estimées'],
  },
  FORFAIT: {
    titles: ['💎 Passez au niveau supérieur', '🔥 Forfait adapté à vos besoins', '📊 Débloquez les fonctions pro'],
    texts: [
      'Avec un forfait supérieur, vous accédez aux IA, à l\'analytique et aux boosts automatiques.',
      'Vos ventes stagnent ? Le bon forfait peut tout changer. Comparez les options.',
      'Rejoignez les vendeurs pro de Kin-Sell avec un forfait adapté à votre ambition.',
    ],
    ctas: [{ label: 'Voir les forfaits', target: '/pricing' }, { label: 'Comparer', target: '/pricing' }],
    subtitles: ['IA + Analytics + Boosts', 'Dès 6$/mois'],
  },
  IA_PROMO: {
    titles: ['🤖 L\'IA travaille pour vous', '🧠 Kin-Sell IA', '⚡ Automatisez vos ventes'],
    texts: [
      'L\'IA Marchande négocie pour vous, l\'IA Commande gère vos ventes. Activez-les.',
      'Laissez l\'intelligence artificielle s\'occuper de la vente pendant que vous vous concentrez sur vos produits.',
      'Les vendeurs avec IA activée vendent 60% de plus. Ne restez pas en arrière.',
    ],
    ctas: [{ label: 'Activer l\'IA', target: '/dashboard?tab=kinsell' }, { label: 'Découvrir les IA', target: '/pricing' }],
    subtitles: ['+60% de ventes', 'Négociation et vente sur pilote auto'],
  },
  ESSAI: {
    titles: ['🎁 Essai gratuit 15 jours', '✅ Testez sans engagement', '🆓 Essayez gratuitement'],
    texts: [
      'Vous avez débloqué un essai gratuit de 15 jours. Activez-le pour découvrir les fonctions premium.',
      'Essayez le forfait supérieur pendant 15 jours, sans payer. Si ça vous plaît, changez de plan.',
      'Profitez de 15 jours gratuits pour tester l\'analytique, le boost et l\'IA.',
    ],
    ctas: [{ label: 'Activer l\'essai', target: '/dashboard?tab=kinsell' }, { label: 'En savoir plus', target: '/pricing' }],
    subtitles: ['15 jours offerts', 'Sans carte, sans engagement'],
  },
  AUTO_VENTE: {
    titles: ['📦 Automatisez vos commandes', '🤖 IA Commande activée', '⚡ Vente automatique'],
    texts: [
      'L\'IA Commande confirme, relance et suit vos ventes automatiquement.',
      'Plus besoin de gérer chaque commande manuellement. L\'IA s\'en charge.',
      'Activez la vente automatique et voyez vos revenus augmenter sans effort.',
    ],
    ctas: [{ label: 'Activer', target: '/pricing?tab=addons' }, { label: 'Voir l\'add-on', target: '/pricing?tab=addons' }],
    subtitles: ['0 effort, +40% ventes', 'Confirmation auto + relances'],
  },
  UPGRADE: {
    titles: ['⬆️ Il est temps de passer au niveau supérieur', '🔑 Débloquez plus', '💎 Votre business mérite mieux'],
    texts: [
      'Vous avez atteint les limites de votre forfait actuel. Le prochain palier vous attend.',
      'Plus de publications, plus d\'IA, plus d\'analytique. Passez à la vitesse supérieure.',
      'Les vendeurs qui upgradent voient +80% de résultats en 30 jours.',
    ],
    ctas: [{ label: 'Passer au supérieur', target: '/pricing' }, { label: 'Comparer les forfaits', target: '/pricing' }],
    subtitles: ['+80% de résultats', 'Plus d\'IA, plus de ventes'],
  },
  CUSTOM: {
    titles: ['📢 Offre spéciale Kin-Sell'],
    texts: ['Découvrez notre offre exclusive réservée aux membres Kin-Sell.'],
    ctas: [{ label: 'Découvrir', target: '/pricing' }],
    subtitles: ['Offre limitée'],
  },
};

const TONE_MODIFIERS: Record<Tone, (text: string) => string> = {
  premium: (t) => t,
  agressif: (t) => t.replace(/\./g, ' !').replace('Essayez', '⚡ Activez MAINTENANT'),
  doux: (t) => t.replace(/!$/g, '.').replace('Activez', 'Vous pourriez activer'),
  vendeur: (t) => `💰 ${t}`,
  informatif: (t) => `ℹ️ ${t}`,
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Génération ──────────────────────────────────────────

export async function generateCreative(input: GenerateCreativeInput) {
  const template = TEMPLATES[input.adType] || TEMPLATES.CUSTOM;
  const tone = input.tone || 'premium';
  const modifier = TONE_MODIFIERS[tone];

  const title = input.customTitle || pick(template.titles);
  const rawText = input.customText || pick(template.texts);
  const contentText = modifier(rawText);
  const subtitle = input.customSubtitle || pick(template.subtitles);
  const cta = pick(template.ctas);

  const creative = await prisma.aiAdCreative.create({
    data: {
      title,
      adType: input.adType,
      audienceType: input.audienceType,
      sourceEngine: input.userId ? 'manual' : 'studio-ads',
      generatedBy: input.userId || 'SYSTEM',
      contentText,
      subtitle,
      mediaType: input.mediaType || 'TEXT',
      mediaUrl: input.customMediaUrl || null,
      ctaLabel: input.customCtaLabel || cta.label,
      ctaTarget: input.customCtaTarget || cta.target,
      tone,
      tags: input.tags || [],
      status: input.userId ? 'DRAFT' : 'READY',
      targetPlanCodes: input.targetPlanCodes || [],
      targetCategory: input.targetCategory || null,
      variantGroup: input.variantGroup || null,
      variantLabel: input.variantLabel || null,
      userId: input.userId || null,
      businessId: input.businessId || null,
    },
  });

  return creative;
}

// ── Génération auto bulk (appelé par le scheduler) ──────

export async function autoGenerateInternalAds() {
  const types: AdType[] = ['BOOST_ARTICLE', 'BOOST_SHOP', 'FORFAIT', 'IA_PROMO', 'ESSAI', 'AUTO_VENTE', 'UPGRADE'];
  const audiences: AudienceType[] = ['USER', 'BUSINESS'];
  const tones: Tone[] = ['premium', 'vendeur', 'informatif'];
  const generated: string[] = [];

  for (const adType of types) {
    for (const audienceType of audiences) {
      // Don't generate shop ads for USER audience
      if (adType === 'BOOST_SHOP' && audienceType === 'USER') continue;

      const existing = await prisma.aiAdCreative.count({
        where: { adType, audienceType, sourceEngine: 'studio-ads', status: { in: ['READY', 'PUBLISHED'] } },
      });
      if (existing >= 3) continue; // already have enough

      const tone = pick(tones);
      const creative = await generateCreative({ adType, audienceType, tone });
      generated.push(creative.id);
    }
  }

  return { generated: generated.length, ids: generated };
}

// ── CRUD Admin ──────────────────────────────────────────

export async function listCreatives(params: {
  page?: number;
  limit?: number;
  status?: string;
  adType?: string;
  audienceType?: string;
}) {
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 50);
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.adType) where.adType = params.adType;
  if (params.audienceType) where.audienceType = params.audienceType;

  const [items, total] = await Promise.all([
    prisma.aiAdCreative.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { campaigns: { select: { id: true, campaignName: true, active: true } } },
    }),
    prisma.aiAdCreative.count({ where }),
  ]);

  return { creatives: items, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getCreativeById(id: string) {
  return prisma.aiAdCreative.findUnique({
    where: { id },
    include: { campaigns: { include: { placements: true, metrics: true } } },
  });
}

export async function updateCreativeStatus(id: string, status: CreativeStatus) {
  return prisma.aiAdCreative.update({ where: { id }, data: { status } });
}

export async function updateCreative(id: string, data: Partial<GenerateCreativeInput & { status?: string }>) {
  const update: Record<string, unknown> = {};
  if (data.customTitle !== undefined) update.title = data.customTitle;
  if (data.customText !== undefined) update.contentText = data.customText;
  if (data.customSubtitle !== undefined) update.subtitle = data.customSubtitle;
  if (data.customCtaLabel !== undefined) update.ctaLabel = data.customCtaLabel;
  if (data.customCtaTarget !== undefined) update.ctaTarget = data.customCtaTarget;
  if (data.customMediaUrl !== undefined) update.mediaUrl = data.customMediaUrl;
  if (data.adType !== undefined) update.adType = data.adType;
  if (data.audienceType !== undefined) update.audienceType = data.audienceType;
  if (data.mediaType !== undefined) update.mediaType = data.mediaType;
  if (data.tone !== undefined) update.tone = data.tone;
  if (data.tags !== undefined) update.tags = data.tags;
  if (data.targetPlanCodes !== undefined) update.targetPlanCodes = data.targetPlanCodes;
  if (data.targetCategory !== undefined) update.targetCategory = data.targetCategory;
  if (data.status !== undefined) update.status = data.status;

  return prisma.aiAdCreative.update({ where: { id }, data: update });
}

export async function deleteCreative(id: string) {
  return prisma.aiAdCreative.delete({ where: { id } });
}
