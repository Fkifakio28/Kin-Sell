import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  importPhoneContacts,
  importFacebookContacts,
  getUserContacts,
  rematchContacts,
} from "./contacts.service.js";
import { ContactSource } from "@prisma/client";

const router = Router();

// POST /contacts/import/phone
router.post(
  "/import/phone",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) {
      res.status(400).json({ error: "contacts[] requis." });
      return;
    }
    const result = await importPhoneContacts(userId, contacts);
    res.json({ imported: result.length, contacts: result });
  })
);

// POST /contacts/import/facebook
router.post(
  "/import/facebook",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) {
      res.status(400).json({ error: "contacts[] requis." });
      return;
    }
    const result = await importFacebookContacts(userId, contacts);
    res.json({ imported: result.length, contacts: result });
  })
);

// GET /contacts?source=PHONE
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const source = req.query.source as ContactSource | undefined;
    const contacts = await getUserContacts(userId, source);
    res.json(contacts);
  })
);

// POST /contacts/rematch
router.post(
  "/rematch",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const result = await rematchContacts(userId);
    res.json(result);
  })
);

export default router;
