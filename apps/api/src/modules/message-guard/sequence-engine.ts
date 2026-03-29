/**
 * Message Guard — Sequence Engine
 *
 * Détecte les contournements par fragmentation multi-messages.
 * Stocke temporairement les fragments récents et les combine
 * pour repérer des numéros / emails / contacts distribués
 * sur plusieurs messages successifs.
 */

import { prisma } from "../../shared/db/prisma.js";
import { normalize, extractDigitSequence, findEmailDomainMentions, findPlatformMentions } from "./normalizer.js";

export interface SequenceDetection {
  type: "FRAGMENTED_PHONE" | "FRAGMENTED_EMAIL" | "FRAGMENTED_CONTACT";
  fragments: string[];
  combined: string;
  confidence: number;
}

/** Durée de vie des fragments (5 minutes) */
const FRAGMENT_TTL_MS = 5 * 60 * 1000;

/** Nombre max de fragments récents à examiner */
const MAX_FRAGMENTS = 10;

/**
 * Stocke un fragment pour analyse séquentielle.
 */
export async function storeFragment(
  userId: string,
  conversationId: string,
  content: string,
  normalizedContent: string,
): Promise<void> {
  await prisma.messageGuardFragment.create({
    data: {
      userId,
      conversationId,
      content,
      normalizedContent,
      expiresAt: new Date(Date.now() + FRAGMENT_TTL_MS),
    },
  });

  // Nettoyage des fragments expirés (fire & forget)
  prisma.messageGuardFragment
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

/**
 * Récupère les fragments récents et les combine avec le message actuel
 * pour détecter des séquences interdites.
 */
export async function detectSequence(
  userId: string,
  conversationId: string,
  currentNormalized: string,
  currentRaw: string,
): Promise<SequenceDetection[]> {
  const results: SequenceDetection[] = [];

  // Récupérer les fragments récents de cet utilisateur dans cette conversation
  const fragments = await prisma.messageGuardFragment.findMany({
    where: {
      userId,
      conversationId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_FRAGMENTS,
  });

  if (fragments.length === 0) return results;

  // Combiner les fragments normalisés + message actuel
  const allNormalized = [...fragments.map(f => f.normalizedContent), currentNormalized];
  const allRaw = [...fragments.map(f => f.content), currentRaw];
  const combined = allNormalized.join(" ");
  const combinedRaw = allRaw.join(" ");

  // ─── Téléphone fragmenté ───
  const digits = extractDigitSequence(combined);
  if (digits.length >= 8) {
    // Vérifier que les chiffres sont répartis sur plusieurs messages
    const currentDigits = extractDigitSequence(currentNormalized);
    const fragDigits = fragments.map(f => extractDigitSequence(f.normalizedContent));
    const hasMultiSource = currentDigits.length > 0 && fragDigits.some(d => d.length > 0);

    if (hasMultiSource) {
      results.push({
        type: "FRAGMENTED_PHONE",
        fragments: allRaw,
        combined: digits,
        confidence: digits.length >= 10 ? 0.9 : 0.7,
      });
    }
  }

  // ─── Email fragmenté ───
  const hasAt = combined.includes("@") || combinedRaw.includes("@");
  const hasDot = combined.includes(".");
  const domains = findEmailDomainMentions(combined);

  if ((hasAt && hasDot) || domains.length > 0) {
    // Vérifier que les pièces viennent de messages différents
    const currentHasAt = currentNormalized.includes("@") || currentRaw.includes("@");
    const fragsHaveAt = fragments.some(f => f.normalizedContent.includes("@") || f.content.includes("@"));
    const currentHasDomain = findEmailDomainMentions(currentNormalized).length > 0;
    const fragsHaveDomain = fragments.some(f => findEmailDomainMentions(f.normalizedContent).length > 0);

    const isCrossmessage = (currentHasAt !== fragsHaveAt) ||
                           (currentHasDomain !== fragsHaveDomain) ||
                           (!currentHasAt && !currentHasDomain && (fragsHaveAt || fragsHaveDomain));

    if (isCrossmessage || domains.length > 0) {
      results.push({
        type: "FRAGMENTED_EMAIL",
        fragments: allRaw,
        combined: `${combined} [domains: ${domains.join(",")}]`,
        confidence: 0.75,
      });
    }
  }

  // ─── Contact fragmenté (plateforme) ───
  const platforms = findPlatformMentions(combined);
  if (platforms.length > 0 && digits.length >= 4) {
    results.push({
      type: "FRAGMENTED_CONTACT",
      fragments: allRaw,
      combined: `${platforms.join(",")} + ${digits}`,
      confidence: 0.8,
    });
  }

  return results;
}
