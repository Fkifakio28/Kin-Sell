/**
 * EXTERNAL INTELLIGENCE ROUTES — Kin-Sell
 *
 * Endpoints pour consulter l'intelligence externe fusionnée
 * et administrer le pipeline d'ingestion.
 */

import { Router } from "express";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import {
  getFusedIntelligence,
  getJobsDemand,
  getSeasonalCalendar,
} from "./external-intelligence-fusion.service.js";
import { runFullExternalIngestion, getExternalIntelHealth } from "./external-intel-orchestrator.service.js";
import { triggerManualMidnightRun } from "./midnight-scheduler.service.js";

const router = Router();

// ── Opportunités fusionnées (commerce + emploi + saisonnier) ──
router.get("/opportunities/:countryCode/:category", requireAuth, async (req, res) => {
  try {
    const { countryCode, category } = req.params;
    const { city } = req.query;
    const fused = await getFusedIntelligence(
      category,
      countryCode.toUpperCase(),
      city as string | undefined,
    );
    res.json({ ok: true, data: fused });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Demande emploi par pays ──
router.get("/jobs-demand/:countryCode", requireAuth, async (req, res) => {
  try {
    const { countryCode } = req.params;
    const { serviceType } = req.query;
    const jobs = await getJobsDemand(
      countryCode.toUpperCase(),
      serviceType as string | undefined,
    );
    res.json({ ok: true, data: jobs });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Calendrier saisonnier ──
router.get("/seasonal-calendar/:countryCode", requireAuth, async (req, res) => {
  try {
    const { countryCode } = req.params;
    const calendar = await getSeasonalCalendar(countryCode.toUpperCase());
    res.json({ ok: true, data: calendar });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

// ── Refresh manuel (admin) — lance ingestion complète ──
router.post("/refresh", requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN), async (_req, res) => {
  try {
    const report = await runFullExternalIngestion();
    res.json({ ok: true, data: report });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur lors du refresh" });
  }
});

// ── Midnight run manuel (admin) — ingestion + KB refresh ──
router.post("/midnight-run", requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN), async (_req, res) => {
  try {
    const report = await triggerManualMidnightRun();
    res.json({ ok: true, data: report });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur lors du midnight run" });
  }
});

// ── Santé du pipeline ──
router.get("/health", requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN), async (_req, res) => {
  try {
    const health = await getExternalIntelHealth();
    res.json({ ok: true, data: health });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Erreur interne" });
  }
});

export default router;
