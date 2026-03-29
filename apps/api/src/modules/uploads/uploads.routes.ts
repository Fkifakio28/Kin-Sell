import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 6; // 5 photos + 1 video

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(new HttpError(400, `Type de fichier non autorisé: ${file.mimetype}. Acceptés: JPEG, PNG, WebP, GIF, MP4, WebM.`));
      return;
    }
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) && file.size > MAX_IMAGE_SIZE) {
      cb(new HttpError(400, "Les images ne doivent pas dépasser 10 Mo."));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.post(
  "/",
  requireAuth,
  upload.array("files", MAX_FILES),
  asyncHandler(async (request, response) => {
    const files = request.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      throw new HttpError(400, "Aucun fichier envoyé.");
    }

    // Validate: max 5 images + 1 video
    const images = files.filter((f) => ALLOWED_IMAGE_TYPES.includes(f.mimetype));
    const videos = files.filter((f) => ALLOWED_VIDEO_TYPES.includes(f.mimetype));

    if (images.length > 5) {
      // Clean up uploaded files
      for (const f of files) fs.unlinkSync(f.path);
      throw new HttpError(400, "Maximum 5 photos autorisées.");
    }

    if (videos.length > 1) {
      for (const f of files) fs.unlinkSync(f.path);
      throw new HttpError(400, "Maximum 1 vidéo autorisée.");
    }

    const urls = files.map((f) => `/uploads/${f.filename}`);

    response.status(201).json({ urls });
  })
);

export default router;
