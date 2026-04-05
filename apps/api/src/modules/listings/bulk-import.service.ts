import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { Role } from "../../types/roles.js";
import { resolveCountryCode } from "../../shared/geo/country-aliases.js";
import { logger } from "../../shared/logger.js";

const MAX_BULK_ITEMS = 50;

export type BulkImportItem = {
  type: "PRODUIT" | "SERVICE";
  title: string;
  description?: string;
  category: string;
  city: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  priceUsdCents?: number;
  stockQuantity?: number | null;
  serviceDurationMin?: number | null;
  serviceLocation?: string | null;
  isNegotiable?: boolean;
};

export type BulkImportResult = {
  total: number;
  created: number;
  errors: Array<{ index: number; error: string }>;
};

export async function bulkCreateListings(
  userId: string,
  items: BulkImportItem[],
): Promise<BulkImportResult> {
  if (!items || items.length === 0) throw new HttpError(400, "Aucun article à importer");
  if (items.length > MAX_BULK_ITEMS)
    throw new HttpError(400, `Maximum ${MAX_BULK_ITEMS} articles par import`);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");
  if (user.role !== Role.USER && user.role !== Role.BUSINESS) {
    throw new HttpError(403, "Ce rôle ne peut pas publier d'articles");
  }

  let businessId: string | undefined;
  if (user.role === Role.BUSINESS) {
    const business = await prisma.businessAccount.findFirst({ where: { ownerUserId: userId } });
    if (!business) throw new HttpError(400, "Aucun compte entreprise trouvé");
    businessId = business.id;
  }

  const result: BulkImportResult = { total: items.length, created: 0, errors: [] };
  const validItems: Array<{ index: number; data: BulkImportItem }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.title || typeof item.title !== "string" || item.title.length < 2 || item.title.length > 140) {
      result.errors.push({ index: i, error: "Titre invalide (2-140 caractères)" });
      continue;
    }
    if (!item.category || typeof item.category !== "string" || item.category.length < 2) {
      result.errors.push({ index: i, error: "Catégorie requise (min 2 caractères)" });
      continue;
    }
    if (!item.city || typeof item.city !== "string" || item.city.length < 2) {
      result.errors.push({ index: i, error: "Ville requise (min 2 caractères)" });
      continue;
    }
    if (!item.type || !["PRODUIT", "SERVICE"].includes(item.type)) {
      result.errors.push({ index: i, error: "Type invalide (PRODUIT ou SERVICE)" });
      continue;
    }
    if (typeof item.latitude !== "number" || item.latitude < -90 || item.latitude > 90) {
      result.errors.push({ index: i, error: "Latitude invalide (-90 à 90)" });
      continue;
    }
    if (typeof item.longitude !== "number" || item.longitude < -180 || item.longitude > 180) {
      result.errors.push({ index: i, error: "Longitude invalide (-180 à 180)" });
      continue;
    }
    if (item.description && typeof item.description === "string" && item.description.length > 1200) {
      result.errors.push({ index: i, error: "Description trop longue (max 1200)" });
      continue;
    }
    validItems.push({ index: i, data: item });
  }

  if (validItems.length === 0) return result;

  await prisma.$transaction(async (tx) => {
    for (const { index, data } of validItems) {
      try {
        const resolvedCountryCode =
          data.countryCode?.toUpperCase() ?? resolveCountryCode(data.country) ?? undefined;

        await tx.listing.create({
          data: {
            type: data.type,
            title: data.title.trim(),
            description: data.description?.trim() || null,
            category: data.category.trim(),
            city: data.city.trim(),
            country: data.country?.trim() || null,
            countryCode: resolvedCountryCode as any,
            latitude: data.latitude,
            longitude: data.longitude,
            imageUrl: data.imageUrl || null,
            mediaUrls: [],
            priceUsdCents: Math.max(0, Math.round(data.priceUsdCents ?? 0)),
            stockQuantity: data.type === "PRODUIT" ? (data.stockQuantity ?? null) : null,
            serviceDurationMin: data.type === "SERVICE" ? (data.serviceDurationMin ?? null) : null,
            serviceLocation: data.type === "SERVICE" ? (data.serviceLocation ?? null) : null,
            isNegotiable: data.isNegotiable ?? true,
            ownerUserId: userId,
            businessId,
          },
        });
        result.created++;
      } catch (err) {
        result.errors.push({
          index,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "LISTING_BULK_IMPORT",
        entityType: "LISTING",
        entityId: "bulk",
        metadata: {
          total: items.length,
          created: result.created,
          errors: result.errors.length,
        },
      },
    });
  });

  logger.info({ userId, total: items.length, created: result.created }, "Bulk import completed");
  return result;
}

/* ── External DB preview ── */

export type DbPreviewResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  totalAvailable: number;
};

/** Block connexions to private / localhost addresses (SSRF protection) */
function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower === "0.0.0.0") return true;
  const parts = host.split(".");
  if (parts.length === 4) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

export async function previewExternalDb(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  table: string;
}): Promise<DbPreviewResult> {
  if (!config.host || !config.database || !config.table) {
    throw new HttpError(400, "Informations de connexion incomplètes");
  }

  if (isPrivateHost(config.host)) {
    throw new HttpError(403, "Connexion aux adresses privées/localhost interdite");
  }

  // Validate table name — alphanumeric + underscore only (prevent SQL injection)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(config.table)) {
    throw new HttpError(400, "Nom de table invalide (lettres, chiffres, underscores uniquement)");
  }

  if (config.port < 1 || config.port > 65535) {
    throw new HttpError(400, "Port invalide (1-65535)");
  }

  let mysql2: typeof import("mysql2/promise");
  try {
    mysql2 = await import("mysql2/promise");
  } catch {
    throw new HttpError(501, "Connexion MySQL non disponible sur ce serveur");
  }

  let connection: Awaited<ReturnType<typeof mysql2.createConnection>> | null = null;
  try {
    connection = await mysql2.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 5_000,
    });

    const tableName = config.table.replace(/`/g, "``");

    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM \`${tableName}\``,
    );
    const totalAvailable = (countResult as any[])[0]?.total ?? 0;

    const [rows] = await connection.execute(
      `SELECT * FROM \`${tableName}\` LIMIT 50`,
    );
    const data = rows as Record<string, unknown>[];
    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    return { columns, rows: data, totalAvailable };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const msg = err instanceof Error ? err.message : "inconnue";
    throw new HttpError(502, `Erreur de connexion MySQL: ${msg}`);
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
