/**
 * CONTACTS — Import et matching de contacts
 *
 * Supporte: contacts téléphone, Facebook, Google, manuel.
 * Matche les contacts importés avec les utilisateurs existants.
 * Alimente les suggestions "Personnes que vous pourriez connaître".
 */

import { prisma } from "../../shared/db/prisma.js";
import { ContactSource } from "../../shared/db/prisma-enums.js";

// ── Types ──

interface ImportPhoneContact {
  name?: string;
  phone: string;
}

interface ImportFacebookContact {
  name?: string;
  fbId: string;
}

// ── Import contacts téléphone ──

export async function importPhoneContacts(userId: string, contacts: ImportPhoneContact[]) {
  const results = [];

  for (const c of contacts) {
    const normalized = c.phone.replace(/\D/g, "");
    if (!normalized) continue;

    // Upsert via unique constraint [userId, source, contactPhone]
    const existing = await prisma.userContact.findFirst({
      where: { userId, source: ContactSource.PHONE, contactPhone: normalized },
    });

    let contact;
    if (existing) {
      contact = existing;
    } else {
      contact = await prisma.userContact.create({
        data: {
          userId,
          source: ContactSource.PHONE,
          contactName: c.name ?? null,
          contactPhone: normalized,
        },
      });
    }

    // Tenter le matching avec un user existant
    if (!contact.matchedUserId) {
      const matched = await prisma.user.findFirst({
        where: { phone: { contains: normalized } },
        select: { id: true },
      });
      if (matched && matched.id !== userId) {
        contact = await prisma.userContact.update({
          where: { id: contact.id },
          data: { matchedUserId: matched.id },
        });
      }
    }

    results.push(contact);
  }

  return results;
}

// ── Import contacts Facebook ──

export async function importFacebookContacts(userId: string, contacts: ImportFacebookContact[]) {
  const results = [];

  for (const c of contacts) {
    if (!c.fbId) continue;

    const existing = await prisma.userContact.findFirst({
      where: { userId, source: ContactSource.FACEBOOK, contactFbId: c.fbId },
    });

    let contact;
    if (existing) {
      contact = existing;
    } else {
      contact = await prisma.userContact.create({
        data: {
          userId,
          source: ContactSource.FACEBOOK,
          contactName: c.name ?? null,
          contactFbId: c.fbId,
        },
      });
    }

    // Matching via fbId — pour l'instant, pas de relation accounts sur User
    // Le matching Facebook se fera si un champ fbId est ajouté au profil
    // Pour l'instant, on tente un match par email si disponible

    results.push(contact);
  }

  return results;
}

// ── Récupérer ses contacts ──

export async function getUserContacts(userId: string, source?: ContactSource) {
  const where: any = { userId };
  if (source) where.source = source;
  return prisma.userContact.findMany({
    where,
    include: {
      matchedUser: {
        select: { id: true, profile: { select: { displayName: true, avatarUrl: true, city: true } } },
      },
    },
    orderBy: { importedAt: "desc" },
  });
}

// ── Re-matching global ──

export async function rematchContacts(userId: string) {
  const unmatched = await prisma.userContact.findMany({
    where: { userId, matchedUserId: null },
  });

  let matchCount = 0;
  for (const c of unmatched) {
    let matchedUser = null;

    if (c.contactPhone) {
      matchedUser = await prisma.user.findFirst({
        where: { phone: { contains: c.contactPhone } },
        select: { id: true },
      });
    }

    if (!matchedUser && c.contactFbId) {
      // Pas de relation accounts sur User pour l'instant
      // Matching FB sera possible quand le modèle Account/OAuth sera ajouté
    }

    if (!matchedUser && c.contactEmail) {
      matchedUser = await prisma.user.findFirst({
        where: { email: { equals: c.contactEmail, mode: "insensitive" } },
        select: { id: true },
      });
    }

    if (matchedUser && matchedUser.id !== userId) {
      await prisma.userContact.update({
        where: { id: c.id },
        data: { matchedUserId: matchedUser.id },
      });
      matchCount++;
    }
  }

  return { rematched: matchCount, total: unmatched.length };
}

// ── Ajout manuel d'un contact (par userId) ──

export async function addManualContact(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new Error("Vous ne pouvez pas vous ajouter vous-même.");

  // Vérifier que le user cible existe
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, profile: { select: { displayName: true, avatarUrl: true, city: true, username: true } } },
  });
  if (!target) throw new Error("Utilisateur introuvable.");

  // Upsert — évite les doublons
  const existing = await prisma.userContact.findFirst({
    where: { userId, matchedUserId: targetUserId },
  });

  if (existing) {
    return { ...existing, matchedUser: target };
  }

  const contact = await prisma.userContact.create({
    data: {
      userId,
      source: "MANUAL",
      contactName: target.profile?.displayName ?? null,
      matchedUserId: targetUserId,
    },
  });

  return { ...contact, matchedUser: target };
}

// ── Toggle favori ──

export async function toggleContactFavorite(userId: string, contactId: string, isFavorite: boolean) {
  const contact = await prisma.userContact.findFirst({ where: { id: contactId, userId } });
  if (!contact) throw new Error("Contact introuvable.");

  return prisma.userContact.update({
    where: { id: contactId },
    data: { isFavorite },
    include: {
      matchedUser: {
        select: { id: true, profile: { select: { displayName: true, avatarUrl: true, city: true } } },
      },
    },
  });
}

// ── Auto-ajout contacts depuis la messagerie ──

export async function autoAddMessagingContacts(userIdA: string, userIdB: string) {
  if (userIdA === userIdB) return;

  // Vérifier les rôles — exclure les admins
  const users = await prisma.user.findMany({
    where: { id: { in: [userIdA, userIdB] } },
    select: { id: true, role: true },
  });

  const hasAdmin = users.some(
    (u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN"
  );
  if (hasAdmin) return;

  // Ajout mutuel silencieux (upsert via addManualContact)
  await Promise.all([
    addManualContact(userIdA, userIdB).catch(() => {}),
    addManualContact(userIdB, userIdA).catch(() => {}),
  ]);
}

// ── Supprimer un contact ──

export async function deleteContact(userId: string, contactId: string) {
  const contact = await prisma.userContact.findFirst({ where: { id: contactId, userId } });
  if (!contact) throw new Error("Contact introuvable.");

  await prisma.userContact.delete({ where: { id: contactId } });
  return { ok: true };
}
