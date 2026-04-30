import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { HttpError } from "../errors/http-error.js";

const execFileAsync = promisify(execFile);

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_MAX_HEIGHT = 1920;
const DEFAULT_QUALITY = 82;
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 480;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_WIDTH = 960;
const VIDEO_MAX_HEIGHT = 540;
const VIDEO_CRF = 30;
const VIDEO_AUDIO_BITRATE = "64k";
const AUDIO_BITRATE = "48k";

type NormalizeImageOptions = {
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  generateThumbnail?: boolean;
};

const ensureUploadsDir = async (folder?: string) => {
  const targetDir = folder
    ? path.join(UPLOADS_DIR, folder.replace(/[^a-zA-Z0-9/_-]+/g, "").replace(/^\/+|\/+$/g, ""))
    : UPLOADS_DIR;
  // Prevent path traversal: ensure resolved path stays within UPLOADS_DIR
  const resolved = path.resolve(targetDir);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new HttpError(400, "Chemin de dossier invalide.");
  }
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
};

const buildPublicUrl = (absolutePath: string) => {
  const relativePath = path.relative(UPLOADS_DIR, absolutePath).replace(/\\/g, "/");
  return `/api/uploads/${relativePath}`;
};

const generateBaseName = () => `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

const optimizeImageBuffer = async (
  buffer: Buffer,
  options: NormalizeImageOptions = {}
) => {
  const pipeline = sharp(buffer, { failOn: "none" }).rotate().resize({
    width: options.maxWidth ?? DEFAULT_MAX_WIDTH,
    height: options.maxHeight ?? DEFAULT_MAX_HEIGHT,
    fit: "inside",
    withoutEnlargement: true,
  });

  return pipeline.webp({ quality: options.quality ?? DEFAULT_QUALITY, effort: 4 }).toBuffer();
};

export const isAcceptedImageInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/api/uploads/")) return true;
  if (IMAGE_DATA_URL_RE.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "data:";
  } catch {
    return false;
  }
};

export const storeImageDataUrl = async (
  dataUrl: string,
  options: NormalizeImageOptions = {}
) => {
  const match = dataUrl.match(IMAGE_DATA_URL_RE);
  if (!match) {
    throw new HttpError(400, "Format d'image non pris en charge.");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(400, "Image trop volumineuse.");
  }

  const targetDir = await ensureUploadsDir(options.folder);
  const baseName = generateBaseName();
  const mainOutputPath = path.join(targetDir, `${baseName}.webp`);
  const thumbnailOutputPath = path.join(targetDir, `${baseName}-thumb.webp`);

  const optimized = await optimizeImageBuffer(buffer, options);
  await fs.writeFile(mainOutputPath, optimized);

  let thumbnailUrl: string | undefined;
  if (options.generateThumbnail !== false) {
    const thumbBuffer = await sharp(buffer, { failOn: "none" }).rotate().resize({
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    }).webp({ quality: 72, effort: 4 }).toBuffer();
    await fs.writeFile(thumbnailOutputPath, thumbBuffer);
    thumbnailUrl = buildPublicUrl(thumbnailOutputPath);
  }

  return {
    url: buildPublicUrl(mainOutputPath),
    thumbnailUrl,
  };
};

export const normalizeImageInput = async (
  value: string | undefined,
  options: NormalizeImageOptions = {}
) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (IMAGE_DATA_URL_RE.test(trimmed)) {
    const stored = await storeImageDataUrl(trimmed, options);
    return stored.url;
  }
  return trimmed;
};

export const normalizeImageInputs = async (
  values: string[] | undefined,
  options: NormalizeImageOptions = {}
) => {
  if (!values) return undefined;
  const normalized = await Promise.all(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => normalizeImageInput(value, options))
  );

  return normalized.filter((value): value is string => Boolean(value));
};

export const optimizeUploadedImageFile = async (
  filePath: string,
  options: NormalizeImageOptions = {}
) => {
  const buffer = await fs.readFile(filePath);

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(400, "Image trop volumineuse.");
  }

  const targetDir = await ensureUploadsDir(options.folder);
  const baseName = generateBaseName();
  const mainOutputPath = path.join(targetDir, `${baseName}.webp`);
  const thumbnailOutputPath = path.join(targetDir, `${baseName}-thumb.webp`);

  // Optimise directement depuis le buffer (sharp détecte auto le format d'entrée)
  const optimized = await optimizeImageBuffer(buffer, options);
  await fs.writeFile(mainOutputPath, optimized);

  let thumbnailUrl: string | undefined;
  if (options.generateThumbnail !== false) {
    const thumbBuffer = await sharp(buffer, { failOn: "none" }).rotate().resize({
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    }).webp({ quality: 72, effort: 4 }).toBuffer();
    await fs.writeFile(thumbnailOutputPath, thumbBuffer);
    thumbnailUrl = buildPublicUrl(thumbnailOutputPath);
  }

  // Supprime le fichier temporaire multer
  await fs.unlink(filePath).catch(() => undefined);

  return {
    url: buildPublicUrl(mainOutputPath),
    thumbnailUrl,
  };
};

/* ════════════════════════════════════════════════════════════
   VIDEO COMPRESSION (WhatsApp-like)
   H.264 540p, CRF 30, AAC 64k — requiert ffmpeg sur le serveur
   ════════════════════════════════════════════════════════════ */

let _ffmpegAvailable: boolean | null = null;

async function isFfmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
    console.warn("[media] ffmpeg non disponible — vidéos/audios non compressés");
  }
  return _ffmpegAvailable;
}

export const optimizeUploadedVideoFile = async (
  filePath: string,
  options: { folder?: string } = {}
): Promise<{ url: string; thumbnailUrl?: string }> => {
  const targetDir = await ensureUploadsDir(options.folder);
  const baseName = generateBaseName();

  if (!(await isFfmpegAvailable())) {
    // Fallback: déplacer tel quel dans le dossier cible
    const ext = path.extname(filePath) || ".mp4";
    const outputPath = path.join(targetDir, `${baseName}${ext}`);
    await fs.rename(filePath, outputPath);
    return { url: buildPublicUrl(outputPath) };
  }

  const outputPath = path.join(targetDir, `${baseName}.mp4`);
  const thumbPath = path.join(targetDir, `${baseName}-thumb.webp`);

  // Low-bandwidth profile: 540p max, CRF 30 + AAC 64k + faststart
  await execFileAsync("ffmpeg", [
    "-i", filePath,
    "-vf", `scale='min(${VIDEO_MAX_WIDTH},iw)':'min(${VIDEO_MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
    "-c:v", "libx264",
    "-crf", String(VIDEO_CRF),
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", VIDEO_AUDIO_BITRATE,
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ], { timeout: 180_000 }); // 3 min max

  // Extraire une miniature à 1 seconde
  await execFileAsync("ffmpeg", [
    "-i", outputPath,
    "-ss", "1",
    "-vframes", "1",
    "-vf", "scale=480:-2",
    "-y",
    thumbPath,
  ], { timeout: 15_000 }).catch(() => undefined);

  // Supprimer le fichier temporaire multer
  await fs.unlink(filePath).catch(() => undefined);

  const thumbnailExists = await fs.stat(thumbPath).then(() => true, () => false);

  return {
    url: buildPublicUrl(outputPath),
    thumbnailUrl: thumbnailExists ? buildPublicUrl(thumbPath) : undefined,
  };
};

/* ════════════════════════════════════════════════════════════
   AUDIO COMPRESSION (WhatsApp-like)
   AAC 48k mono — requiert ffmpeg
   ════════════════════════════════════════════════════════════ */

export const optimizeUploadedAudioFile = async (
  filePath: string,
  options: { folder?: string } = {}
): Promise<{ url: string }> => {
  const targetDir = await ensureUploadsDir(options.folder);
  const baseName = generateBaseName();

  if (!(await isFfmpegAvailable())) {
    const ext = path.extname(filePath) || ".m4a";
    const outputPath = path.join(targetDir, `${baseName}${ext}`);
    await fs.rename(filePath, outputPath);
    return { url: buildPublicUrl(outputPath) };
  }

  const outputPath = path.join(targetDir, `${baseName}.m4a`);

  await execFileAsync("ffmpeg", [
    "-i", filePath,
    "-c:a", "aac",
    "-b:a", AUDIO_BITRATE,
    "-ac", "1",           // mono — suffisant pour messages vocaux
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ], { timeout: 60_000 }); // 1 min max

  await fs.unlink(filePath).catch(() => undefined);

  return { url: buildPublicUrl(outputPath) };
};
