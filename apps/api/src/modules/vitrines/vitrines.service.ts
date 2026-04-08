import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

const MAX_VITRINES = 12;

export const getVitrinesForUser = async (userId: string) => {
  return prisma.vitrine.findMany({
    where: { userId },
    orderBy: { displayOrder: "asc" },
  });
};

export const createVitrine = async (
  userId: string,
  data: { title: string; description?: string; mediaUrl: string }
) => {
  const count = await prisma.vitrine.count({ where: { userId } });
  if (count >= MAX_VITRINES) {
    throw new HttpError(400, `Vous ne pouvez pas ajouter plus de ${MAX_VITRINES} vitrines.`);
  }

  return prisma.vitrine.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      mediaUrl: data.mediaUrl,
      displayOrder: count,
    },
  });
};

export const updateVitrine = async (
  userId: string,
  vitrineId: string,
  data: { title?: string; description?: string; mediaUrl?: string }
) => {
  const vitrine = await prisma.vitrine.findUnique({ where: { id: vitrineId } });
  if (!vitrine || vitrine.userId !== userId) {
    throw new HttpError(404, "Vitrine introuvable.");
  }

  return prisma.vitrine.update({
    where: { id: vitrineId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.mediaUrl !== undefined && { mediaUrl: data.mediaUrl }),
    },
  });
};

export const deleteVitrine = async (userId: string, vitrineId: string) => {
  const vitrine = await prisma.vitrine.findUnique({ where: { id: vitrineId } });
  if (!vitrine || vitrine.userId !== userId) {
    throw new HttpError(404, "Vitrine introuvable.");
  }

  await prisma.vitrine.delete({ where: { id: vitrineId } });
  return { ok: true };
};

export const reorderVitrines = async (userId: string, orderedIds: string[]) => {
  const vitrines = await prisma.vitrine.findMany({ where: { userId } });
  const ownedIds = new Set(vitrines.map((v) => v.id));

  for (const id of orderedIds) {
    if (!ownedIds.has(id)) {
      throw new HttpError(400, "ID vitrine invalide.");
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.vitrine.update({ where: { id }, data: { displayOrder: i } })
    )
  );

  return { ok: true };
};
