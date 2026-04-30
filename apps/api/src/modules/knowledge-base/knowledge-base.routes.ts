/**
 * KNOWLEDGE BASE ROUTES — Kin-Sell
 *
 * Endpoints pour consulter la base de connaissances IA et administrer le système.
 */

import { Router } from "express";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import {
  getExternalPriceIntel,
  getTradeRoutes,
  getBusinessInsights,
  getBlendedInsight,
  getKnowledgeBaseStats,
  runNightlyKnowledgeBaseRefresh,
  purgeLaunchData,
} from "./knowledge-base.service.js";

const router = Router();

// ── Prix de référence externe ──
router.get("/prices/:countryCode/:category", requireAuth, async (req, res) => {
  try {
    const { countryCode, category } = req.params;
    const { city, subcategory } = req.query;
    const intel = await getExternalPriceIntel(
      category,
      countryCode.toUpperCase(),
      city as string | undefined,
      subcategory as string | undefined,
    );
    res.json({ ok: true, data: intel });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Routes commerciales ──
router.get("/trade-routes/:countryCode", requireAuth, async (req, res) => {
  try {
    const { countryCode } = req.params;
    const { direction, category } = req.query;
    const routes = await getTradeRoutes(
      countryCode.toUpperCase(),
      (direction as "FROM" | "TO" | "BOTH") || "BOTH",
      category as string | undefined,
    );
    res.json({ ok: true, data: routes });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Insights business ──
router.get("/business/:countryCode", requireAuth, async (req, res) => {
  try {
    const { countryCode } = req.params;
    const { sector } = req.query;
    const insights = await getBusinessInsights(
      countryCode.toUpperCase(),
      sector as string | undefined,
    );
    res.json({ ok: true, data: insights });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Insight blendé (externe + interne fusionnés) ──
router.get("/blend/:countryCode/:category", requireAuth, async (req, res) => {
  try {
    const { countryCode, category } = req.params;
    const { city } = req.query;
    const blended = await getBlendedInsight(
      category,
      countryCode.toUpperCase(),
      city as string | undefined,
    );
    if (!blended) {
      return res.status(404).json({ ok: false, error: "Aucune donnée disponible" });
    }
    res.json({ ok: true, data: blended });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Stats KB (admin) ──
router.get("/stats", requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN), async (_req, res) => {
  try {
    const stats = await getKnowledgeBaseStats();
    res.json({ ok: true, data: stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Refresh manuel (admin) ──
router.post("/refresh", requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN), async (_req, res) => {
  try {
    await runNightlyKnowledgeBaseRefresh();
    res.json({ ok: true, message: "Refresh terminé" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur lors du refresh" });
  }
});

// ── Purge lancement (super admin ONLY) ──
router.post("/purge-launch", requireAuth, requireRoles(Role.SUPER_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.auth?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ ok: false, error: "Super Admin uniquement" });
    }
    const result = await purgeLaunchData();
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur lors de la purge" });
  }
});

export default router;
