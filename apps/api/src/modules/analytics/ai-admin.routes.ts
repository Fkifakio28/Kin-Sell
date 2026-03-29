/**
 * AI Admin Routes — Super Admin Control Panel
 *
 * Routes pour le contrôle centralisé de tous les agents IA.
 * Monté sous /admin/ai/* dans admin.routes.ts.
 *
 * Permissions : AI_MANAGEMENT (LEVEL_1, LEVEL_2)
 * SUPER_ADMIN requis pour : purge, trigger, config critique
 */

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import type { AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import * as aiAdmin from "./ai-admin.service.js";

const router = Router();

// ── Dashboard IA complet ─────────────────────────────────────────────────────
router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const dashboard = await aiAdmin.getAiDashboard();
    res.json(dashboard);
  }),
);

// ── Liste des agents ─────────────────────────────────────────────────────────
router.get(
  "/agents",
  asyncHandler(async (_req, res) => {
    const dashboard = await aiAdmin.getAiDashboard();
    res.json({ agents: dashboard.agents });
  }),
);

// ── Config d'un agent ────────────────────────────────────────────────────────
router.get(
  "/agents/:name",
  asyncHandler(async (req, res) => {
    const agent = await aiAdmin.getAgentConfig(req.params.name);
    if (!agent) { res.status(404).json({ error: "Agent introuvable" }); return; }
    res.json(agent);
  }),
);

// ── Activer/Désactiver un agent ──────────────────────────────────────────────
router.post(
  "/agents/:name/toggle",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const agent = await aiAdmin.toggleAgent(req.params.name, enabled);
    res.json(agent);
  }),
);

// ── Mettre à jour la config d'un agent ───────────────────────────────────────
router.patch(
  "/agents/:name/config",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const config = z.record(z.unknown()).parse(req.body);
    const agent = await aiAdmin.updateAgentConfig(req.params.name, config);
    res.json(agent);
  }),
);

// ── Logs d'autonomie ─────────────────────────────────────────────────────────
router.get(
  "/autonomy-logs",
  asyncHandler(async (req, res) => {
    const params = z.object({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      agentName: z.string().optional(),
      actionType: z.string().optional(),
      success: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
      targetUserId: z.string().optional(),
    }).parse(req.query);
    const result = await aiAdmin.getAutonomyLogs(params);
    res.json(result);
  }),
);

// ── Snapshots mémoire ────────────────────────────────────────────────────────
router.get(
  "/memory",
  asyncHandler(async (req, res) => {
    const params = z.object({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      userId: z.string().optional(),
      agentName: z.string().optional(),
      snapshotType: z.string().optional(),
    }).parse(req.query);
    const result = await aiAdmin.getMemorySnapshots(params);
    res.json(result);
  }),
);

// ── Déclencher un cycle manuel (SUPER_ADMIN) ─────────────────────────────────
router.post(
  "/trigger",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    // Vérification SUPER_ADMIN inline
    const user = await import("../../shared/db/prisma.js").then((m) =>
      m.prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { role: true } }),
    );
    if (user?.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "SUPER_ADMIN requis" }); return;
    }
    const { cycle } = z.object({
      cycle: z.enum(["fast", "medium", "slow", "nightly", "all"]),
    }).parse(req.body);
    const result = await aiAdmin.triggerManualCycle(cycle);
    res.json(result);
  }),
);

// ── Purger la mémoire d'un utilisateur (SUPER_ADMIN) ────────────────────────
router.delete(
  "/memory/:userId",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await import("../../shared/db/prisma.js").then((m) =>
      m.prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { role: true } }),
    );
    if (user?.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "SUPER_ADMIN requis" }); return;
    }
    const count = await aiAdmin.purgeUserMemory(req.params.userId);
    res.json({ purged: count });
  }),
);

// ── Purger les logs anciens (SUPER_ADMIN) ────────────────────────────────────
router.post(
  "/purge-old-logs",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await import("../../shared/db/prisma.js").then((m) =>
      m.prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { role: true } }),
    );
    if (user?.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "SUPER_ADMIN requis" }); return;
    }
    const count = await aiAdmin.purgeOldLogs();
    res.json({ purged: count });
  }),
);

export default router;
