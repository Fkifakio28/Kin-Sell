import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { optimizeUploadedImageFile, optimizeUploadedVideoFile, optimizeUploadedAudioFile } from "../../shared/utils/media-storage.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 6; // 5 photos + 1 video

// SECURITY: derive extension from validated MIME type, not from user-supplied filename
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/x-m4a": ".m4a",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
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
    // Note: file.size est 0 dans fileFilter (multer n'a pas encore lu le body).
    // La vérif de taille par type se fait POST-upload ci-dessous.
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

    // SÉCURITÉ: vérifier la taille réelle des images APRÈS upload (file.size fiable ici)
    const oversizedImages = images.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (oversizedImages.length > 0) {
      for (const f of files) fs.unlinkSync(f.path);
      throw new HttpError(400, "Les images ne doivent pas dépasser 10 Mo.");
    }

    const urls = await Promise.all(
      files.map(async (file) => {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          const stored = await optimizeUploadedImageFile(file.path, { folder: "media" });
          return stored.url;
        }
        if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
          const stored = await optimizeUploadedVideoFile(file.path, { folder: "media" });
          return stored.url;
        }
        if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
          const stored = await optimizeUploadedAudioFile(file.path, { folder: "media" });
          return stored.url;
        }
        return `/uploads/${file.filename}`;
      })
    ).catch((err) => {
      // B11 audit : si UN fichier échoue, nettoyer TOUS les fichiers temp
      // uploadés pour éviter une fuite disque progressive.
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      throw err;
    });

    response.status(201).json({ urls });
  })
);

export default router;
