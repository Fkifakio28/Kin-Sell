import { Router } from "express";
import { prisma } from "../../shared/db/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { z } from "zod";

const router = Router();

/**
 * GET /app-version/android — Public
 * Retourne la version Android la plus récente, l'URL de l'APK,
 * et si la mise à jour est obligatoire.
 */
router.get(
  "/android",
  asyncHandler(async (_req, res) => {
    const keys = [
      "android_latest_version",
      "android_latest_build",
      "android_apk_url",
      "android_force_update",
      "android_release_notes",
    ];
    const settings = await prisma.siteSetting.findMany({
      where: { key: { in: keys } },
    });

    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;

    res.json({
      version: map["android_latest_version"] ?? null,
      build: map["android_latest_build"] ? Number(map["android_latest_build"]) : null,
      apkUrl: map["android_apk_url"] ?? null,
      forceUpdate: map["android_force_update"] === "true",
      releaseNotes: map["android_release_notes"] ?? null,
    });
  }),
);

/**
 * PUT /app-version/android — Admin only
 * Met à jour les infos de version Android.
 */
const updateSchema = z.object({
  version: z.string().min(1).max(20),
  build: z.coerce.number().int().min(1),
  apkUrl: z.string().url().max(500),
  forceUpdate: z.boolean().optional().default(false),
  releaseNotes: z.string().max(2000).optional().default(""),
});

router.put(
  "/android",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = updateSchema.parse(req.body);

    const entries: [string, string][] = [
      ["android_latest_version", data.version],
      ["android_latest_build", String(data.build)],
      ["android_apk_url", data.apkUrl],
      ["android_force_update", String(data.forceUpdate)],
      ["android_release_notes", data.releaseNotes],
    ];

    for (const [key, value] of entries) {
      await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }

    res.json({ ok: true });
  }),
);

export default router;
